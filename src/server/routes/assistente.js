// ==================== ROTAS DO ASSISTENTE (voz + texto) ====================
// POST /api/assistente/transcrever  { audioBase64, mime }       → { texto }
// POST /api/assistente/mensagem     { texto, historico, hoje, hora, contexto? } → { fala, tipo, dados }
//      A IA escolhe entre as ferramentas que o perfil do usuário pode usar
//      (server/assistente). ASSISTENTE_MODO=classico volta ao classificador antigo.
// POST /api/assistente/marcar       { pacienteId, profissionalId, data, horario }
// POST /api/assistente/remarcar     { consultaId, profissionalId, data, horario }
// POST /api/assistente/cancelar     { consultaId, motivo }
// GET  /api/assistente/status                                    → { configurado }
//
// Nada é gravado sem a confirmação explícita da recepção: /mensagem só lê
// e propõe; a gravação acontece em /marcar, /remarcar e /cancelar, que
// exigem acesso à Agenda e ficam registradas no audit_log da clínica.

const express = require('express');
const dbGlobal = require('../databaseGlobal');
const A = require('../services/assistenteAgenda');
const IA = require('../services/assistenteOpenAI');
const assinatura = require('../services/assinaturaCalculo');
const acoes = require('../assistente/acoes');
const assistente = require('../assistente');
const { podeAcessarPagina } = require('../assistente/permissoes');
const auditoria = require('../assistente/auditoria');

const router = express.Router();

// As telas enviam POST como text/plain (evita o preflight que o proxy não
// repassa). Limite maior que o padrão por causa do áudio em base64.
router.use((req, res, next) => {
  const tipo = String(req.headers['content-type'] || '');
  if (!tipo.includes('text/plain') || req.body && Object.keys(req.body).length) return next();
  let bruto = '';
  req.setEncoding('utf8');
  req.on('data', (parte) => {
    bruto += parte;
    if (bruto.length > 12 * 1024 * 1024) req.destroy();
  });
  req.on('end', () => {
    try {
      req.body = bruto ? JSON.parse(bruto) : {};
    } catch (e) {
      req.body = {};
    }
    next();
  });
  req.on('error', () => next());
});

// ---- Ativação por clínica (o administrador liga; o uso é cobrado) ----
const chaveAtivacao = (clinicaId) => `assistente_voz_${clinicaId}`;

async function lerAtivacao(clinicaId) {
  try {
    const row = await dbGlobal.prepare('SELECT valor FROM configuracoes_globais WHERE chave = ?').get(chaveAtivacao(clinicaId));
    const valor = row && row.valor;
    const config = typeof valor === 'string' ? JSON.parse(valor) : valor;
    return config && typeof config === 'object' ? config : { ativo: false };
  } catch (e) {
    return { ativo: false };
  }
}

async function gravarAtivacao(clinicaId, config) {
  const texto = JSON.stringify(config);
  const agora = new Date().toISOString();
  const upd = await dbGlobal.
  prepare('UPDATE configuracoes_globais SET valor = ?, atualizadoEm = ? WHERE chave = ?').
  run(texto, agora, chaveAtivacao(clinicaId));
  if (!upd || upd.changes === 0) {
    await dbGlobal.
    prepare('INSERT INTO configuracoes_globais (id, chave, valor, atualizadoEm) VALUES (?, ?, ?, ?)').
    run(`cfg${Date.now()}${Math.floor(Math.random() * 1000)}`, chaveAtivacao(clinicaId), texto, agora);
  }
}

async function precoDoAssistente(clinicaId) {
  try {
    const servicos = await assinatura.buscarServicos(clinicaId);
    const s = servicos.find((x) => x.servico === 'assistente_voz');
    return { valorUnitario: s ? s.valorUnitario : 0, franquia: s ? s.franquia : 0 };
  } catch (e) {
    return { valorUnitario: 0, franquia: 0 };
  }
}

async function exigirUsuario(req, res, { exigirAtivacao = true } = {}) {
  const usuarioId = String(req.usuario && req.usuario.id || req.body && req.body.usuarioId || req.query.usuarioId || '').trim();
  const clinicaId = String(req.body && req.body.clinicaId || req.query.clinicaId || '').trim();
  if (!usuarioId || !clinicaId) {
    res.status(400).json({ error: 'usuarioId e clinicaId são obrigatórios.' });
    return null;
  }
  try {
    const usuario = await dbGlobal.prepare('SELECT id, nome, tipo, ativo, permissoesMenu FROM usuarios WHERE id = ?').get(usuarioId);
    if (!usuario || !Number(usuario.ativo)) {
      res.status(403).json({ error: 'Usuário inativo ou não encontrado.' });
      return null;
    }
    if (!IA.configurado()) {
      res.status(503).json({ error: 'O assistente não está configurado: defina OPENAI_API_KEY no server/.env.local e reinicie o backend.' });
      return null;
    }
    if (exigirAtivacao && !(await lerAtivacao(clinicaId)).ativo) {
      res.status(403).json({
        error: 'O assistente não está ativado nesta clínica. O administrador ativa em Configurações da Clínica → Assistente de voz.',
        naoAtivado: true
      });
      return null;
    }
    return { ...usuario, clinicaId };
  } catch (err) {
    res.status(500).json({ error: err.message });
    return null;
  }
}

function agoraDoPedido(body) {
  const d = new Date();
  return {
    hoje: A.normalizarData(String(body.hoje || '')) || A.normalizarData(d),
    hora: A.normalizarHora(body.hora) || `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  };
}

// ---------------------------------------------------------------------------

router.get('/status', (req, res) => {
  res.json({ configurado: IA.configurado() });
});

// GET /api/assistente/ativacao?clinicaId= → situação + preço por pedido
router.get('/ativacao', async (req, res) => {
  const clinicaId = String(req.query.clinicaId || '').trim();
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório.' });
  const [config, preco] = await Promise.all([lerAtivacao(clinicaId), precoDoAssistente(clinicaId)]);
  res.json({
    ativo: Boolean(config.ativo) && IA.configurado(),
    ativoNaClinica: Boolean(config.ativo),
    alteradoPor: config.alteradoPor || null,
    alteradoEm: config.alteradoEm || null,
    configurado: IA.configurado(),
    ...preco
  });
});

// POST /api/assistente/ativacao { clinicaId, usuarioId, ativo } — só administrador
router.post('/ativacao', async (req, res) => {
  const usuario = await exigirUsuario(req, res, { exigirAtivacao: false });
  if (!usuario) return;
  if (!['admin', 'super_admin'].includes(usuario.tipo)) {
    return res.status(403).json({ error: 'Somente o administrador da clínica pode ativar ou desativar o assistente.' });
  }
  const ativo = Boolean(req.body.ativo);
  try {
    await gravarAtivacao(usuario.clinicaId, { ativo, alteradoPor: usuario.nome, alteradoEm: new Date().toISOString() });
    console.log(`🤖 [assistente] ${ativo ? 'ATIVADO' : 'desativado'} na clínica ${usuario.clinicaId} por ${usuario.nome}`);
    res.json({ ativo, ...(await precoDoAssistente(usuario.clinicaId)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/transcrever', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  try {
    const texto = await IA.transcrever(req.body.audioBase64, req.body.mime, req.body.contexto === 'prontuario' ? 'prontuario' : 'agenda');
    res.json({ texto });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Modo clássico (ASSISTENTE_MODO=classico): a IA classifica a frase numa
// ação fixa, como antes das ferramentas. Fica como reserva enquanto o modo
// com ferramentas amadurece. Respeita as mesmas permissões.
const FERRAMENTA_DA_ACAO = {
  marcar: 'propor_marcacao',
  horarios_livres: 'horarios_livres',
  agenda_dia: 'agenda_dia',
  consultas_paciente: 'consultas_paciente',
  cancelar: 'propor_cancelamento',
  abrir_agenda: 'abrir_agenda',
  remarcar: 'propor_remarcacao',
  abrir_paciente: 'abrir_paciente',
  abrir_prontuario: 'abrir_prontuario',
  novo_paciente: 'novo_paciente',
  abrir_tela: 'abrir_tela',
  resumo_dia: 'resumo_dia'
};

async function responderClassico({ usuario, texto, historico, agora }) {
  const profissionais = await A.listarProfissionais(usuario.clinicaId);
  const diaSemana = A.DIAS_SEMANA[new Date(`${agora.hoje}T12:00:00`).getDay()];
  const pedido = await IA.interpretar({
    texto, historico, hoje: agora.hoje, hora: agora.hora, diaSemana,
    profissionais: profissionais.map((p) => p.nome)
  });
  const nome = FERRAMENTA_DA_ACAO[pedido.acao];
  const f = nome && assistente.registro.disponiveis(usuario).find((x) => x.nome === nome);
  const ctx = { clinicaId: usuario.clinicaId, profissionais, agora, usuario };
  if (!f) {
    const fala = nome ? 'Seu perfil não tem acesso a essa função.' : pedido.resposta || acoes.AJUDA;
    return { pedido, tipo: 'conversa', fala, dados: null };
  }
  if (f.nome === 'abrir_tela' && !f.parametros.properties.tela.enum.includes(pedido.tela)) {
    return { pedido, tipo: 'conversa', fala: 'Seu perfil não tem acesso a essa tela.', dados: null };
  }
  return { pedido, ...(await f.executar(pedido, ctx)) };
}

function contextoDoPedido(body) {
  const c = body && body.contexto && typeof body.contexto === 'object' ? body.contexto : {};
  const tela = String(c.tela || '').trim();
  return { tela: /^[a-z_]{1,40}$/.test(tela) ? tela : null };
}

router.post('/mensagem', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const texto = String(req.body.texto || '').trim();
  if (!texto) return res.status(400).json({ error: 'Diga ou digite o pedido.' });
  try {
    const agora = agoraDoPedido(req.body);
    const classico = String(process.env.ASSISTENTE_MODO || '').trim() === 'classico';
    const resposta = classico ?
    await responderClassico({ usuario, texto, historico: req.body.historico, agora }) :
    await assistente.responder({
      usuario,
      texto,
      historico: req.body.historico,
      agora,
      contexto: contextoDoPedido(req.body),
      ip: auditoria.ipDe(req)
    });
    const { _uso, ...resultado } = resposta;
    // Cobrança: 1 pedido atendido = 1 unidade, não importa quantas voltas o
    // laço deu (a transcrição faz parte do mesmo pedido).
    const acao = resultado.pedido && resultado.pedido.acao || 'conversa';
    await assinatura.registrarUso(usuario.clinicaId, 'assistente_voz', 1, `${acao} · ${usuario.nome}`.slice(0, 120));
    const tokens = _uso ? ` · ${_uso.prompt_tokens}+${_uso.completion_tokens} tokens, ${_uso.passos} passo(s)` : '';
    console.log(`🤖 [assistente] ${usuario.nome}: "${texto.slice(0, 120)}" → ${acao} (${resultado.tipo})${tokens}`);
    res.json(resultado);
  } catch (err) {
    console.error('🤖 [assistente] Erro:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/assistente/prontuario { texto, historico, etapaAtual, paciente }
// Só interpreta o ditado: quem grava é a própria etapa no navegador, pelo
// mesmo caminho da digitação (prontuário assinado continua bloqueado lá).
router.post('/prontuario', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const texto = String(req.body.texto || '').trim();
  if (!texto) return res.status(400).json({ error: 'Dite ou digite o que deseja.' });
  try {
    const r = await IA.interpretarProntuario({
      texto,
      historico: req.body.historico,
      etapaAtual: String(req.body.etapaAtual || ''),
      paciente: String(req.body.paciente || '').slice(0, 120)
    });
    await assinatura.registrarUso(usuario.clinicaId, 'assistente_voz', 1, `prontuario:${r.acao} · ${usuario.nome}`.slice(0, 120));
    console.log(`🤖 [assistente] prontuário · ${usuario.nome}: ${r.acao} (${r.preenchimentos.map((p) => p.etapa).join(', ') || r.etapa || '-'})`);
    res.json({ tipo: 'prontuario', fala: r.resposta, dados: r });
  } catch (err) {
    console.error('🤖 [assistente] Erro prontuário:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/assistente/falar { texto } → { audioBase64, mime } (voz feminina)
// Faz parte do pedido já cobrado; não conta como uso à parte.
router.post('/falar', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  try {
    res.json(await IA.falar(req.body.texto));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Confirmações: mesma regra de acesso das ferramentas de proposta (página
// Agenda) e registro na auditoria da clínica.
function exigirAgenda(usuario, res) {
  if (podeAcessarPagina(usuario, 'agenda')) return true;
  res.status(403).json({ error: 'Seu perfil não tem acesso à agenda.' });
  return false;
}

function auditarConfirmacao(req, usuario, acao, dados) {
  return auditoria.registrar(usuario.clinicaId, usuario, {
    acao,
    entidade: 'consulta',
    entidadeId: dados.consultaId || null,
    pacienteId: dados.pacienteId || null,
    pacienteNome: dados.paciente || null,
    detalhes: JSON.stringify(dados),
    ip: auditoria.ipDe(req)
  });
}

router.post('/marcar', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario || !exigirAgenda(usuario, res)) return;
  try {
    const r = await A.marcarConsulta({
      clinicaId: usuario.clinicaId,
      pacienteId: req.body.pacienteId,
      profissionalId: req.body.profissionalId,
      data: req.body.data,
      horario: req.body.horario,
      usuarioNome: usuario.nome,
      agora: agoraDoPedido(req.body)
    });
    await auditarConfirmacao(req, usuario, 'ASSISTENTE_MARCACAO', {
      consultaId: r.id, pacienteId: req.body.pacienteId, paciente: r.paciente, profissional: r.profissional, data: r.data, horario: r.horario
    });
    console.log(`🤖 [assistente] Consulta ${r.id} marcada por ${usuario.nome}: ${r.paciente} ${r.data} ${r.horario}`);
    res.json(r);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, slots: err.slots });
  }
});

// POST /api/assistente/remarcar { consultaId, profissionalId, data, horario }
router.post('/remarcar', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario || !exigirAgenda(usuario, res)) return;
  const canceladoPor = usuario.tipo === 'medico' || usuario.tipo === 'dentista' ? 'Médico' : 'Atendente';
  try {
    const r = await A.remarcarConsulta({
      clinicaId: usuario.clinicaId,
      consultaId: req.body.consultaId,
      profissionalId: req.body.profissionalId,
      data: req.body.data,
      horario: req.body.horario,
      usuarioNome: usuario.nome,
      canceladoPor,
      agora: agoraDoPedido(req.body)
    });
    await auditarConfirmacao(req, usuario, 'ASSISTENTE_REMARCACAO', {
      consultaId: r.id, consultaAnteriorId: req.body.consultaId, paciente: r.paciente, profissional: r.profissional, data: r.data, horario: r.horario
    });
    console.log(`🤖 [assistente] Consulta ${req.body.consultaId} remarcada por ${usuario.nome} → ${r.id} ${r.data} ${r.horario}`);
    res.json(r);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, slots: err.slots });
  }
});

router.post('/cancelar', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario || !exigirAgenda(usuario, res)) return;
  const canceladoPor = usuario.tipo === 'medico' || usuario.tipo === 'dentista' ? 'Médico' : 'Atendente';
  try {
    const r = await A.cancelarConsulta({
      clinicaId: usuario.clinicaId,
      consultaId: req.body.consultaId,
      motivo: req.body.motivo,
      canceladoPor,
      agora: agoraDoPedido(req.body)
    });
    await auditarConfirmacao(req, usuario, 'ASSISTENTE_CANCELAMENTO', { consultaId: r.id, motivo: r.motivo || req.body.motivo || '' });
    console.log(`🤖 [assistente] Consulta ${r.id} cancelada por ${usuario.nome}`);
    res.json(r);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;