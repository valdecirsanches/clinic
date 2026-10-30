// ==================== ROTAS DO ASSISTENTE (voz + texto) ====================
// POST /api/assistente/transcrever  { audioBase64, mime }       → { texto }
// POST /api/assistente/mensagem     { texto, historico, hoje, hora } → { fala, tipo, dados }
// POST /api/assistente/marcar       { pacienteId, profissionalId, data, horario }
// POST /api/assistente/cancelar     { consultaId, motivo }
// GET  /api/assistente/status                                    → { configurado }
//
// Nada é gravado sem a confirmação explícita da recepção: /mensagem só lê
// e propõe; a gravação acontece em /marcar e /cancelar.

const express = require('express');
const dbGlobal = require('../databaseGlobal');
const A = require('../services/assistenteAgenda');
const IA = require('../services/assistenteOpenAI');
const assinatura = require('../services/assinaturaCalculo');

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
  const usuarioId = String(req.body && req.body.usuarioId || req.query.usuarioId || '').trim();
  const clinicaId = String(req.body && req.body.clinicaId || req.query.clinicaId || '').trim();
  if (!usuarioId || !clinicaId) {
    res.status(400).json({ error: 'usuarioId e clinicaId são obrigatórios.' });
    return null;
  }
  try {
    const usuario = await dbGlobal.prepare('SELECT id, nome, tipo, ativo FROM usuarios WHERE id = ?').get(usuarioId);
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

function porPeriodo(slots, periodo) {
  if (periodo === 'manha') return slots.filter((s) => s < '12:00');
  if (periodo === 'tarde') return slots.filter((s) => s >= '12:00');
  return slots;
}

function listaNomes(nomes) {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`;
}

function horariosProximos(slots, alvo, n = 6) {
  const min = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return [...slots].sort((a, b) => Math.abs(min(a) - min(alvo)) - Math.abs(min(b) - min(alvo))).slice(0, n).sort();
}

function resolverProf(profissionais, nome) {
  if (!nome) return { vazio: true };
  const r = A.resolverProfissional(profissionais, nome);
  if (r.profissional) return { profissional: r.profissional };
  if (r.candidatos.length > 1) {
    return { fala: `Encontrei mais de um profissional para "${nome}": ${listaNomes(r.candidatos.map((p) => p.nome))}. Qual deles?` };
  }
  return { fala: `Não encontrei o profissional "${nome}" nesta clínica.` };
}

const conversa = (fala) => ({ tipo: 'conversa', fala, dados: null });

// ---------------------------------------------------------------------------

async function marcar(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  if (!pedido.paciente) return conversa('Para qual paciente é a consulta?');
  const pacientes = await A.buscarPacientes(clinicaId, pedido.paciente);
  if (!pacientes.length) return conversa(`Não encontrei paciente com o nome "${pedido.paciente}". Confira o nome ou cadastre o paciente antes.`);

  const p = resolverProf(profissionais, pedido.profissional);
  if (p.vazio) {
    const ativos = profissionais.filter((x) => x.ativo).map((x) => x.nome);
    return conversa(`Com qual profissional?${ativos.length ? ` Os disponíveis são: ${listaNomes(ativos.slice(0, 8))}.` : ''}`);
  }
  if (!p.profissional) return conversa(p.fala);
  const prof = p.profissional;

  const data = A.normalizarData(String(pedido.data || ''));
  if (data && data < agora.hoje) return conversa('Essa data já passou. Diga outra data.');

  let opcoes = [];
  let aviso = '';
  let selecionado = null;

  if (data) {
    const livre = await A.horariosLivres(clinicaId, prof, data, agora);
    const slots = porPeriodo(livre.slots, pedido.periodo);
    if (livre.aberto && slots.length) {
      const hora = A.normalizarHora(pedido.hora);
      if (hora && slots.includes(hora)) {
        selecionado = { data, horario: hora };
        opcoes = [{ data, rotulo: A.dataPorExtenso(data), slots }];
      } else {
        if (hora) aviso = `${hora} não está livre em ${A.dataPorExtenso(data)}.`;
        opcoes = [{ data, rotulo: A.dataPorExtenso(data), slots: hora ? horariosProximos(slots, hora, 8) : slots }];
      }
    } else {
      aviso = livre.aberto ?
      `Não há horário livre${pedido.periodo ? ` de ${pedido.periodo === 'manha' ? 'manhã' : 'tarde'}` : ''} em ${A.dataPorExtenso(data)}.` :
      `Não dá para marcar em ${A.dataPorExtenso(data)}: ${livre.motivo}.`;
      opcoes = await A.proximasDatasLivres(clinicaId, prof, A.normalizarData(new Date(new Date(`${data}T12:00:00`).getTime() + 86400000)), agora);
    }
  } else {
    opcoes = await A.proximasDatasLivres(clinicaId, prof, agora.hoje, agora);
    opcoes = opcoes.map((o) => ({ ...o, slots: porPeriodo(o.slots, pedido.periodo) })).filter((o) => o.slots.length);
  }

  if (!opcoes.length) {
    return conversa(`${aviso ? `${aviso} ` : ''}${prof.nome} não tem horário livre nos próximos 30 dias. Os dias precisam estar abertos na agenda.`);
  }

  // Aviso de consulta já marcada no mesmo dia (paciente único).
  if (pacientes.length === 1 && selecionado) {
    const futuras = await A.proximasConsultasPaciente(clinicaId, pacientes[0].id, agora.hoje, profissionais);
    const mesmoDia = futuras.find((c) => c.data === selecionado.data);
    if (mesmoDia) aviso = `${aviso ? `${aviso} ` : ''}Atenção: ${pacientes[0].nome} já tem consulta nesse dia às ${mesmoDia.horario}${mesmoDia.profissional ? ` com ${mesmoDia.profissional}` : ''}.`;
  }

  let fala;
  if (pacientes.length > 1) fala = `Encontrei ${pacientes.length} pacientes com esse nome. Escolha o paciente e o horário.`;else
  if (selecionado) fala = `Confirma ${pacientes[0].nome} com ${prof.nome}, ${A.dataPorExtenso(selecionado.data)} às ${selecionado.horario}?`;else
  fala = `${aviso ? `${aviso} ` : ''}Escolha um horário para ${pacientes[0].nome} com ${prof.nome}.`;
  if (selecionado && aviso) fala = `${fala} ${aviso}`;

  return {
    tipo: 'proposta_marcacao',
    fala,
    dados: { pacientes, profissional: { id: prof.id, nome: prof.nome }, opcoes, selecionado, aviso }
  };
}

async function horarios(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  const p = resolverProf(profissionais, pedido.profissional);
  if (!p.vazio && !p.profissional) return conversa(p.fala);
  const data = A.normalizarData(String(pedido.data || ''));

  if (p.profissional) {
    const prof = p.profissional;
    let grupos;
    let aviso = '';
    if (data) {
      const livre = await A.horariosLivres(clinicaId, prof, data, agora);
      const slots = porPeriodo(livre.slots, pedido.periodo);
      if (livre.aberto && slots.length) grupos = [{ data, rotulo: A.dataPorExtenso(data), slots }];else
      {
        aviso = livre.aberto ? `Sem horário livre em ${A.dataPorExtenso(data)}.` : `${A.dataPorExtenso(data)}: ${livre.motivo}.`;
        grupos = await A.proximasDatasLivres(clinicaId, prof, data, agora);
      }
    } else {
      grupos = await A.proximasDatasLivres(clinicaId, prof, agora.hoje, agora);
    }
    grupos = grupos.map((g) => ({ ...g, slots: porPeriodo(g.slots, pedido.periodo) })).filter((g) => g.slots.length);
    if (!grupos.length) return conversa(`${aviso ? `${aviso} ` : ''}${prof.nome} não tem horário livre nos próximos 30 dias.`);
    const g = grupos[0];
    return {
      tipo: 'horarios',
      fala: `${aviso ? `${aviso} ` : ''}${prof.nome} tem ${g.slots.length} horário${g.slots.length > 1 ? 's' : ''} livre${g.slots.length > 1 ? 's' : ''} em ${g.rotulo}, a partir das ${g.slots[0]}.`,
      dados: { grupos: grupos.map((x) => ({ ...x, profissionalId: prof.id, profissional: prof.nome })) }
    };
  }

  const dia = data || agora.hoje;
  const grupos = [];
  for (const prof of profissionais.filter((x) => x.ativo)) {
    const livre = await A.horariosLivres(clinicaId, prof, dia, agora);
    const slots = porPeriodo(livre.slots, pedido.periodo);
    if (livre.aberto && slots.length) {
      grupos.push({ data: dia, rotulo: A.dataPorExtenso(dia), slots, profissionalId: prof.id, profissional: prof.nome });
    }
  }
  if (!grupos.length) return conversa(`Nenhum profissional tem horário livre em ${A.dataPorExtenso(dia)} (dias precisam estar abertos na agenda).`);
  return {
    tipo: 'horarios',
    fala: `${grupos.length} profissiona${grupos.length > 1 ? 'is têm' : 'l tem'} horário livre em ${A.dataPorExtenso(dia)}.`,
    dados: { grupos }
  };
}

async function agenda(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  const p = resolverProf(profissionais, pedido.profissional);
  if (!p.vazio && !p.profissional) return conversa(p.fala);
  const data = A.normalizarData(String(pedido.data || '')) || agora.hoje;
  const itens = await A.agendaDoDia(clinicaId, data, p.profissional && p.profissional.id, profissionais);
  const quem = p.profissional ? ` de ${p.profissional.nome}` : '';
  return {
    tipo: 'agenda',
    fala: itens.length ?
    `${itens.length} consulta${itens.length > 1 ? 's' : ''}${quem} em ${A.dataPorExtenso(data)}. A primeira é às ${itens[0].horario}, ${itens[0].paciente}.` :
    `Nenhuma consulta marcada${quem} em ${A.dataPorExtenso(data)}.`,
    dados: { data, rotulo: A.dataPorExtenso(data), profissional: p.profissional ? p.profissional.nome : null, itens }
  };
}

async function consultasPaciente(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  if (!pedido.paciente) return conversa('De qual paciente?');
  const pacientes = await A.buscarPacientes(clinicaId, pedido.paciente);
  if (!pacientes.length) return conversa(`Não encontrei paciente com o nome "${pedido.paciente}".`);
  const lista = [];
  for (const pac of pacientes.slice(0, 4)) {
    lista.push({ ...pac, consultas: await A.proximasConsultasPaciente(clinicaId, pac.id, agora.hoje, profissionais) });
  }
  const unico = lista.length === 1 ? lista[0] : null;
  let fala;
  if (unico) {
    const c = unico.consultas[0];
    fala = c ?
    `A próxima consulta de ${unico.nome} é ${c.rotulo} às ${c.horario}${c.profissional ? ` com ${c.profissional}` : ''}.` :
    `${unico.nome} não tem consulta futura marcada.`;
  } else {
    fala = `Encontrei ${pacientes.length} pacientes com esse nome.`;
  }
  return { tipo: 'consultas_paciente', fala, dados: { pacientes: lista } };
}

async function cancelar(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  if (!pedido.paciente) return conversa('De qual paciente é a consulta a cancelar?');
  const pacientes = await A.buscarPacientes(clinicaId, pedido.paciente);
  if (!pacientes.length) return conversa(`Não encontrei paciente com o nome "${pedido.paciente}".`);
  const p = resolverProf(profissionais, pedido.profissional);
  const data = A.normalizarData(String(pedido.data || ''));
  const consultas = [];
  for (const pac of pacientes.slice(0, 4)) {
    const futuras = await A.proximasConsultasPaciente(clinicaId, pac.id, agora.hoje, profissionais);
    futuras.
    filter((c) => (!data || c.data === data) && (!p.profissional || c.profissionalId === p.profissional.id)).
    forEach((c) => consultas.push({ ...c, paciente: pac.nome }));
  }
  if (!consultas.length) return conversa(`Não encontrei consulta futura de ${pedido.paciente}${data ? ` em ${A.dataPorExtenso(data)}` : ''}.`);
  const c = consultas[0];
  return {
    tipo: 'proposta_cancelamento',
    fala:
    consultas.length === 1 ?
    `Confirma o cancelamento da consulta de ${c.paciente}, ${c.rotulo} às ${c.horario}${c.profissional ? ` com ${c.profissional}` : ''}?` :
    `Encontrei ${consultas.length} consultas. Escolha qual cancelar.`,
    dados: { consultas, motivo: pedido.motivo || '' }
  };
}

async function abrirAgenda(pedido, ctx) {
  const p = resolverProf(ctx.profissionais, pedido.profissional);
  if (!p.vazio && !p.profissional) return conversa(p.fala);
  const data = A.normalizarData(String(pedido.data || '')) || ctx.agora.hoje;
  return {
    tipo: 'navegar',
    fala: `Abrindo a agenda de ${A.dataPorExtenso(data)}${p.profissional ? ` de ${p.profissional.nome}` : ''}.`,
    dados: { data, profissionalId: p.profissional ? p.profissional.id : null }
  };
}

async function remarcar(pedido, ctx) {
  const { clinicaId, profissionais, agora } = ctx;
  if (!pedido.paciente) return conversa('De qual paciente é a consulta a remarcar?');
  const pacientes = await A.buscarPacientes(clinicaId, pedido.paciente);
  if (!pacientes.length) return conversa(`Não encontrei paciente com o nome "${pedido.paciente}".`);
  if (pacientes.length > 1) {
    return conversa(`Encontrei ${pacientes.length} pacientes: ${listaNomes(pacientes.map((p) => p.nome))}. Diga o nome completo.`);
  }
  const pac = pacientes[0];
  const futuras = await A.proximasConsultasPaciente(clinicaId, pac.id, agora.hoje, profissionais);
  if (!futuras.length) return conversa(`${pac.nome} não tem consulta futura para remarcar.`);
  // Várias consultas: remarca a mais próxima (o card mostra qual é antes de confirmar).
  const p = resolverProf(profissionais, pedido.profissional);
  if (!p.vazio && !p.profissional) return conversa(p.fala);
  const atual = futuras[0];
  const prof = p.profissional || profissionais.find((x) => x.id === atual.profissionalId);
  if (!prof) return conversa('Não encontrei o profissional da consulta atual. Diga com quem remarcar.');

  // Reaproveita a busca de horários da marcação.
  const proposta = await marcar({ ...pedido, paciente: pac.nome, profissional: prof.nome }, ctx);
  if (proposta.tipo !== 'proposta_marcacao') return proposta;
  const de = `${atual.rotulo} às ${atual.horario}${atual.profissional ? ` com ${atual.profissional}` : ''}`;
  const sel = proposta.dados.selecionado;
  return {
    tipo: 'proposta_remarcacao',
    fala: sel ?
    `Remarco a consulta de ${pac.nome} de ${de} para ${A.dataPorExtenso(sel.data)} às ${sel.horario}?` :
    `A consulta de ${pac.nome} é ${de}. Escolha o novo horário.`,
    dados: { ...proposta.dados, pacientes: [pac], consulta: { ...atual, paciente: pac.nome } }
  };
}

async function pacientesComConsultas(clinicaId, nome, ctx) {
  const pacientes = await A.buscarPacientes(clinicaId, nome);
  const lista = [];
  for (const pac of pacientes.slice(0, 4)) {
    lista.push({ ...pac, consultas: await A.proximasConsultasPaciente(clinicaId, pac.id, ctx.agora.hoje, ctx.profissionais) });
  }
  return lista;
}

async function abrirPaciente(pedido, ctx, destino) {
  if (!pedido.paciente) return conversa(destino === 'prontuario' ? 'De qual paciente é o prontuário?' : 'Qual paciente?');
  const lista = await pacientesComConsultas(ctx.clinicaId, pedido.paciente, ctx);
  if (!lista.length) {
    return conversa(`Não encontrei paciente com o nome "${pedido.paciente}". Se for paciente novo, diga "cadastrar paciente novo".`);
  }
  if (lista.length === 1) {
    const p = lista[0];
    return destino === 'prontuario' ?
    { tipo: 'abrir_prontuario', fala: `Abrindo o prontuário de ${p.nome}.`, dados: { pacienteId: p.id, nome: p.nome } } :
    { tipo: 'pacientes', fala: `Abrindo o cadastro de ${p.nome}.`, dados: { pacientes: lista, abrir: 'cadastro' } };
  }
  return {
    tipo: 'pacientes',
    fala: `Encontrei ${lista.length} pacientes com esse nome. Escolha qual abrir.`,
    dados: { pacientes: lista, abrir: null }
  };
}

function novoPaciente(pedido) {
  return {
    tipo: 'abrir_cadastro',
    fala: 'Abrindo o cadastro de paciente novo.',
    dados: { pacienteId: null, nome: String(pedido.paciente || '').trim() }
  };
}

function abrirTela(pedido) {
  const rotulo = IA.ROTULO_TELA[pedido.tela] || pedido.tela;
  return { tipo: 'navegar_tela', fala: `Abrindo ${rotulo}.`, dados: { tela: pedido.tela, rotulo } };
}

const NOME_STATUS = {
  agendada: 'agendadas', confirmada: 'confirmadas', aguardando_confirmacao: 'aguardando confirmação',
  realizada: 'realizadas', em_atendimento: 'em atendimento', faltou: 'faltas', chegou: 'na recepção'
};

async function resumoDia(pedido, ctx) {
  const data = A.normalizarData(String(pedido.data || '')) || ctx.agora.hoje;
  const r = await A.resumoDoDia(ctx.clinicaId, data, ctx.profissionais, ctx.agora);
  const rotulo = A.dataPorExtenso(data);
  if (!r.total) return conversa(`Nenhuma consulta marcada em ${rotulo}.`);
  const partes = r.porStatus.slice(0, 3).map((s) => `${s.quantidade} ${NOME_STATUS[s.status] || s.status}`);
  return {
    tipo: 'resumo_dia',
    fala: `${rotulo}: ${r.total} consulta${r.total > 1 ? 's' : ''} com ${r.porProfissional.length} profissiona${r.porProfissional.length > 1 ? 'is' : 'l'}. ${partes.join(', ')}.`,
    dados: { data, rotulo, ...r }
  };
}

const AJUDA =
'Posso abrir o cadastro ou o prontuário de um paciente, cadastrar paciente novo, marcar, remarcar e cancelar consultas, mostrar horários livres, o resumo do dia e abrir qualquer tela ou a agenda de um profissional. Toque em "Comandos" para ver tudo.';

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

router.post('/mensagem', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const texto = String(req.body.texto || '').trim();
  if (!texto) return res.status(400).json({ error: 'Diga ou digite o pedido.' });
  try {
    const agora = agoraDoPedido(req.body);
    const profissionais = await A.listarProfissionais(usuario.clinicaId);
    const diaSemana = A.DIAS_SEMANA[new Date(`${agora.hoje}T12:00:00`).getDay()];
    const pedido = await IA.interpretar({
      texto,
      historico: req.body.historico,
      hoje: agora.hoje,
      hora: agora.hora,
      diaSemana,
      profissionais: profissionais.map((p) => p.nome)
    });
    const ctx = { clinicaId: usuario.clinicaId, profissionais, agora };
    const acoes = {
      marcar,
      horarios_livres: horarios,
      agenda_dia: agenda,
      consultas_paciente: consultasPaciente,
      cancelar,
      abrir_agenda: abrirAgenda,
      remarcar,
      abrir_paciente: (p, c) => abrirPaciente(p, c, 'cadastro'),
      abrir_prontuario: (p, c) => abrirPaciente(p, c, 'prontuario'),
      novo_paciente: novoPaciente,
      abrir_tela: abrirTela,
      resumo_dia: resumoDia
    };
    const resultado = acoes[pedido.acao] ? await acoes[pedido.acao](pedido, ctx) : conversa(pedido.resposta || AJUDA);
    // Cobrança: 1 pedido atendido = 1 unidade (a transcrição faz parte do mesmo pedido).
    await assinatura.registrarUso(usuario.clinicaId, 'assistente_voz', 1, `${pedido.acao} · ${usuario.nome}`.slice(0, 120));
    console.log(`🤖 [assistente] ${usuario.nome}: "${texto}" → ${pedido.acao} (${resultado.tipo})`);
    res.json({ pedido, ...resultado });
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

router.post('/marcar', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
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
    console.log(`🤖 [assistente] Consulta ${r.id} marcada por ${usuario.nome}: ${r.paciente} ${r.data} ${r.horario}`);
    res.json(r);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, slots: err.slots });
  }
});

// POST /api/assistente/remarcar { consultaId, profissionalId, data, horario }
router.post('/remarcar', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
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
    console.log(`🤖 [assistente] Consulta ${req.body.consultaId} remarcada por ${usuario.nome} → ${r.id} ${r.data} ${r.horario}`);
    res.json(r);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, slots: err.slots });
  }
});

router.post('/cancelar', async (req, res) => {
  const usuario = await exigirUsuario(req, res);
  if (!usuario) return;
  const canceladoPor = usuario.tipo === 'medico' || usuario.tipo === 'dentista' ? 'Médico' : 'Atendente';
  try {
    const r = await A.cancelarConsulta({
      clinicaId: usuario.clinicaId,
      consultaId: req.body.consultaId,
      motivo: req.body.motivo,
      canceladoPor,
      agora: agoraDoPedido(req.body)
    });
    console.log(`🤖 [assistente] Consulta ${r.id} cancelada por ${usuario.nome}`);
    res.json(r);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;