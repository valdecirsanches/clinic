// ==================== ROTAS DE ANIVERSÁRIOS ====================
// Endpoints para consultar aniversariantes do dia e enviar felicitações via WhatsApp

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const { getClinicaDB } = require('../databaseClinica');
const { enviarMensagemRobusta, cleanUrl, getWahaApiKey, getWahaHeaders } = require('./whatsapp-shared');
const { buscarConfigMeta, enviarWhatsappMeta } = require('./whatsapp-meta');

// ⭐ CANAL META (WhatsApp oficial): a felicitação também pode sair pelo número
// oficial, com o template "Feliz Aniversário" aprovado e vinculado. Só é usada
// quando o canal está ativo E o template está vinculado — nunca por padrão.
async function templateAniversarioMeta(clinicaId) {
  try {
    const config = await buscarConfigMeta(clinicaId);
    if (!config || !config.ativo) return null;
    const template = config.templates?.aniversario;
    if (!template?.name) return null;
    return template;
  } catch (e) {
    return null;
  }
}

async function enviarFelicitacaoMeta(clinicaId, telefone, primeiroNome, clinicaNome, template) {
  const resultado = await enviarWhatsappMeta(clinicaId, telefone, {
    template: {
      name: template.name,
      language: template.language || 'pt_BR',
      // A ordem é a de TEMPLATES_ESPERADOS: {{1}} nome, {{2}} clínica
      params: [primeiroNome, clinicaNome]
    }
  });
  if (!resultado.success) {
    console.error(`❌ [aniversarios] Meta recusou o envio: ${resultado.error}`);
  }
  return Boolean(resultado.success);
}

// ==================== IDEMPOTÊNCIA ====================
// ⭐ FIX v1.1: Evita envio duplicado de "Feliz Aniversário".
// Tabela por clínica que registra (pacienteId, ano). Antes de enviar, checa
// se já foi enviado neste ano; após enviar, registra. Garante 1 mensagem/ano
// por paciente, independente de quantas vezes a rota seja chamada (clique duplo,
// retry, cron + manual etc).

const tabelaAnivEnviadoCriada = {};

function garantirTabelaAniversarioEnviado(db, clinicaId, callback) {
  if (tabelaAnivEnviadoCriada[clinicaId]) return callback();
  db.run(
    `CREATE TABLE IF NOT EXISTS aniversario_enviado (
      pacienteId VARCHAR(64) NOT NULL,
      ano INT NOT NULL,
      enviadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (pacienteId, ano)
    )`,
    (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('🎂 [aniversario_enviado] Erro ao criar tabela:', err.message);
      }
      tabelaAnivEnviadoCriada[clinicaId] = true;
      callback();
    }
  );
}

function jaEnviouNesteAno(db, pacienteId, ano) {
  return new Promise((resolve) => {
    db.get(
      'SELECT 1 AS ok FROM aniversario_enviado WHERE pacienteId = ? AND ano = ? LIMIT 1',
      [pacienteId, ano],
      (err, row) => {
        if (err) {
          console.error('🎂 [jaEnviouNesteAno] Erro:', err.message);
          // Em caso de erro de consulta, prefere NÃO bloquear o envio (fail-open).
          // Mas como duplicação é o problema sendo corrigido, vamos preferir
          // fail-CLOSED para nunca arriscar duplicar.
          return resolve(true);
        }
        resolve(!!row);
      }
    );
  });
}

function registrarEnvio(db, pacienteId, ano) {
  return new Promise((resolve) => {
    db.run(
      'INSERT INTO aniversario_enviado (pacienteId, ano) VALUES (?, ?) ON DUPLICATE KEY UPDATE enviadoEm = CURRENT_TIMESTAMP',
      [pacienteId, ano],
      (err) => {
        if (err) {
          console.error('🎂 [registrarEnvio] Erro:', err.message);
        }
        resolve();
      }
    );
  });
}

function anoAtual() {
  return new Date().getFullYear();
}

// ==================== HELPERS ====================

// Formata telefone para chatId do WhatsApp (55XXXXXXXXXXX@c.us)
function formatarChatId(telefone) {
  if (!telefone) return null;
  let limpo = telefone.replace(/\D/g, '');
  if (limpo.length < 10) return null;
  if (!limpo.startsWith('55')) limpo = '55' + limpo;
  return limpo + '@c.us';
}

// Busca config WhatsApp da clínica
function getWhatsAppConfig(db, clinicaId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM whatsapp_config WHERE clinicaId = ?', [clinicaId], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

// ⭐ Busca mensagem customizada de aniversário — PER CLINIC
// Chave: aniversario_config_{clinicaId} (isolamento multi-tenant)
// Fallback: tenta chave global legada 'aniversario_config' para compatibilidade
// ⚠️ A gravação da tela pode vir como objeto JSON ou como string JSON (duplo
// encode). Sem desfazer isso, `habilitado` fica `undefined` e o sistema conclui
// "ativo" — a clínica desativa e continua enviando.
function interpretarValorConfig(valor) {
  let atual = valor;
  for (let i = 0; i < 3; i += 1) {
    if (atual && typeof atual === 'object') return atual;
    if (typeof atual !== 'string') return null;
    try {
      atual = JSON.parse(atual);
    } catch (e) {
      return null;
    }
  }
  return atual && typeof atual === 'object' ? atual : null;
}

async function lerChaveConfig(chave) {
  try {
    const row = await dbGlobal.
    prepare('SELECT valor FROM configuracoes_globais WHERE chave = ?').
    get(chave);
    if (!row) return null;
    return { chave, bruto: row.valor, config: interpretarValorConfig(row.valor) };
  } catch (e) {
    console.error(`❌ [aniversarios] Erro ao ler ${chave}:`, e.message);
    return null;
  }
}

/**
 * Resolve a configuração da clínica dizendo TAMBÉM de onde ela veio. Saber a
 * origem é o que permite provar por que uma clínica continua recebendo envio
 * depois de desativar (ver GET /api/aniversarios/diag).
 */
async function resolverAniversarioConfig(clinicaId) {
  const perClinic = clinicaId ? await lerChaveConfig(`aniversario_config_${clinicaId}`) : null;
  const legado = await lerChaveConfig('aniversario_config');

  // A chave da própria clínica é autoritativa quando existe. A legada só vale
  // para clínicas que nunca salvaram (compatibilidade com a versão antiga).
  const escolhida = perClinic || legado;
  const config = escolhida?.config || null;

  // ⚠️ Só um `true` EXPLÍCITO habilita quando existe registro. Um registro
  // ilegível (JSON corrompido, valor inesperado) passava por "ativo" — agora
  // não: registro presente e sem `habilitado: true` é tratado como desativado.
  let habilitado;
  if (!escolhida) {
    habilitado = true; // nunca configurado = comportamento histórico
  } else if (config && typeof config.habilitado === 'boolean') {
    habilitado = config.habilitado;
  } else {
    habilitado = false;
  }

  return {
    habilitado,
    mensagemCustom: config?.mensagemCustom || null,
    origem: escolhida?.chave || null,
    temConfig: Boolean(escolhida),
    bruto: escolhida?.bruto || null,
    ilegivel: Boolean(escolhida && !config)
  };
}

function getAniversarioConfig(clinicaId) {
  return resolverAniversarioConfig(clinicaId).then((r) =>
  r.temConfig ? { habilitado: r.habilitado, mensagemCustom: r.mensagemCustom } : null
  );
}

// ⭐⭐ TRAVA CENTRAL: a felicitação está desativada para esta clínica?
//
// CAUSA DO BUG: até aqui, o `habilitado` era verificado APENAS pelo cron
// (start-server.js). Os endpoints que realmente enviam não olhavam a
// configuração, então qualquer outro caminho — botão manual na agenda, botão na
// lista de pacientes, uma automação futura — continuava enviando com a
// felicitação "desativada". A regra agora vive no ponto de envio, não em quem
// chama. Desligou => nenhum caminho envia.
async function felicitacaoDesativada(clinicaId) {
  const r = await resolverAniversarioConfig(clinicaId);
  if (!r.habilitado) {
    console.log(
      `🎂 [aniversarios] 🚫 DESATIVADA para ${clinicaId} — origem=${r.origem || 'nenhuma'}${r.ilegivel ? ' (valor ilegível, tratado como desativado)' : ''}`
    );
  }
  return !r.habilitado;
}

// Consulta a preferência do paciente (felicitarAniversario = 0 => não enviar)
function getPacienteFelicitacao(db, pacienteId) {
  return new Promise((resolve) => {
    db.get(
      'SELECT felicitarAniversario FROM pacientes WHERE id = ?',
      [pacienteId],
      (err, row) => {
        if (err) return resolve(null);
        resolve(row || null);
      }
    );
  });
}

// ⭐ Monta mensagem de aniversário (usa custom ou padrão)
function montarMensagemAniversario(primeiroNome, clinicaNome, mensagemCustom) {
  const mensagemPadrao = `🎂🎉 *Feliz Aniversário, ${primeiroNome}!* 🎉🎂\n\nA equipe da *${clinicaNome}* deseja a você um dia maravilhoso, repleto de saúde, alegria e realizações!\n\nQue este novo ciclo traga muitas bênçãos. Parabéns! 🥳🎈`;

  if (!mensagemCustom) return mensagemPadrao;

  // Substitui placeholders
  return mensagemCustom.
  replace(/\{nome\}/g, primeiroNome).
  replace(/\{clinica\}/g, clinicaNome);
}

// Busca aniversariantes do dia para uma clínica
function getAniversariantesDoDia(db) {
  return new Promise((resolve, reject) => {
    // Compara mês e dia do dataNascimento (formato YYYY-MM-DD ou DD/MM/YYYY)
    // Usa SUBSTRING para extrair mês e dia independente do formato
    const hoje = new Date();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');

    db.all(
      `SELECT id, nome, dataNascimento, telefone, felicitarAniversario
       FROM pacientes 
       WHERE (deletado IS NULL OR deletado = 0)
         AND dataNascimento IS NOT NULL 
         AND dataNascimento != ''
         AND (
           (SUBSTRING(dataNascimento, 6, 5) = ? AND LENGTH(dataNascimento) >= 10 AND dataNascimento LIKE '____-__-__')
           OR
           (CONCAT(SUBSTRING(dataNascimento, 4, 2), '-', SUBSTRING(dataNascimento, 1, 2)) = ? AND dataNascimento LIKE '__/__/____')
         )`,
      [`${mes}-${dia}`, `${mes}-${dia}`],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

// ==================== ROTAS ====================

// GET /api/aniversarios/hoje?clinicaId=xxx
// Retorna lista de aniversariantes do dia
router.get('/hoje', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  try {
    const db = getClinicaDB(clinicaId);
    const aniversariantes = await getAniversariantesDoDia(db);

    console.log(`🎂 [aniversarios] ${aniversariantes.length} aniversariante(s) hoje na clínica ${clinicaId}`);
    res.json(aniversariantes);
  } catch (err) {
    console.error('❌ [aniversarios] Erro ao buscar aniversariantes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/aniversarios/status?clinicaId=xxx
// Informa se a felicitação está habilitada para a clínica, para que a interface
// não ofereça o botão de envio quando o recurso está desligado.
router.get('/status', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  try {
    const r = await resolverAniversarioConfig(clinicaId);
    res.json({
      habilitado: r.habilitado,
      temConfig: r.temConfig,
      origem: r.origem
    });
  } catch (err) {
    console.error('❌ [aniversarios] Erro ao consultar status:', err.message);
    // Na dúvida, informa habilitado para não esconder o recurso por falha de rede.
    res.json({ habilitado: true, temConfig: false, erro: err.message });
  }
});

// GET /api/aniversarios/diag  → texto puro, sem login.
// Prova, clínica por clínica, QUAL registro decide o envio e o que ele contém.
// Sem isto, "desativei e continua enviando" só se investiga por tentativa.
router.get('/diag', async (req, res) => {
  const linhas = [];
  linhas.push('=== DIAGNÓSTICO DA FELICITAÇÃO DE ANIVERSÁRIO ===');
  linhas.push('');

  try {
    const todas = await dbGlobal.
    prepare("SELECT chave, valor, atualizadoEm FROM configuracoes_globais WHERE chave LIKE 'aniversario_config%'").
    all();
    linhas.push(`--- 1) REGISTROS GRAVADOS (${(todas || []).length}) ---`);
    for (const row of todas || []) {
      linhas.push(`  ${row.chave} = ${String(row.valor || '').slice(0, 200)}   (atualizado: ${row.atualizadoEm || '-'})`);
    }
    if (!todas || todas.length === 0) {
      linhas.push('  nenhum — nunca foi salvo. Comportamento: ATIVO (histórico).');
    }
    linhas.push('');

    const clinicas = await dbGlobal.prepare('SELECT id, nome FROM clinicas WHERE ativa = 1').all();
    linhas.push(`--- 2) DECISÃO POR CLÍNICA (${(clinicas || []).length} ativas) ---`);
    for (const c of clinicas || []) {
      const r = await resolverAniversarioConfig(c.id);
      linhas.push(
        `  ${r.habilitado ? 'ENVIA   ' : 'BLOQUEIA'} · ${c.nome} (${c.id}) · origem=${r.origem || 'nenhuma (nunca salvo)'}${r.ilegivel ? ' · VALOR ILEGÍVEL' : ''}`
      );
      if (r.habilitado && !r.temConfig) {
        linhas.push('             ↑ esta clínica NUNCA salvou a configuração. Abra Configurações → Felicitação de Aniversário e desative.');
      }
      if (r.habilitado && r.origem === 'aniversario_config') {
        linhas.push('             ↑ está usando a chave LEGADA global. Salve a configuração nesta clínica para ela ter a própria chave.');
      }
    }
    linhas.push('');
    linhas.push('--- CONCLUSÃO ---');
    linhas.push('Quem aparece como BLOQUEIA não envia por nenhum caminho (cron, botão da agenda, lista de pacientes).');
    linhas.push('Quem aparece como ENVIA está com a felicitação ativa — a linha acima diz por quê.');
  } catch (err) {
    linhas.push(`Falha ao montar o diagnóstico: ${err.message}`);
  }

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(linhas.join('\n'));
});

// POST /api/aniversarios/enviar
// Envia felicitação de aniversário para um paciente específico
// Body: { clinicaId, pacienteId, pacienteNome, telefone, force? }
router.post('/enviar', async (req, res) => {
  const { clinicaId, pacienteId, pacienteNome, telefone, force } = req.body;

  if (!clinicaId || !pacienteId || !telefone) {
    return res.status(400).json({ error: 'clinicaId, pacienteId e telefone são obrigatórios' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    // ⭐⭐ TRAVA: felicitação desativada nas Configurações da clínica.
    // Vale para TODOS os caminhos, inclusive o botão manual.
    if (await felicitacaoDesativada(clinicaId)) {
      console.log(`🎂 [aniversarios] 🚫 Felicitação DESATIVADA na clínica ${clinicaId} — envio bloqueado (${pacienteNome || pacienteId})`);
      return res.json({
        success: true,
        skipped: true,
        disabled: true,
        message: 'Felicitação de aniversário está desativada nas Configurações desta clínica'
      });
    }

    // ⭐⭐ TRAVA: paciente que optou por NÃO receber felicitação.
    // O envio em lote já respeitava isso; o envio individual, não.
    const prefPaciente = await getPacienteFelicitacao(db, pacienteId);
    if (prefPaciente && prefPaciente.felicitarAniversario === 0) {
      console.log(`🎂 [aniversarios] 🚫 ${pacienteNome || pacienteId} optou por NÃO receber felicitação — envio bloqueado`);
      return res.json({
        success: true,
        skipped: true,
        optOut: true,
        message: 'Este paciente optou por não receber felicitação de aniversário'
      });
    }

    // ⭐ FIX v1.1: Idempotência — bloqueia reenvio no mesmo ano (a menos que force=true)
    await new Promise((r) => garantirTabelaAniversarioEnviado(db, clinicaId, r));
    const ano = anoAtual();
    if (!force) {
      const jaEnviou = await jaEnviouNesteAno(db, pacienteId, ano);
      if (jaEnviou) {
        console.log(`🎂 [aniversarios] ⏭️  ${pacienteNome} (id=${pacienteId}) JÁ recebeu felicitação em ${ano} — bloqueado para evitar duplicata`);
        return res.json({
          success: true,
          skipped: true,
          alreadySent: true,
          message: 'Paciente já recebeu felicitação neste ano'
        });
      }
    }

    // Canal: WhatsApp oficial (Meta) quando o template está vinculado; senão WAHA.
    const templateMeta = await templateAniversarioMeta(clinicaId);
    const whatsappConfig = await getWhatsAppConfig(db, clinicaId);

    if (!templateMeta && (!whatsappConfig || !whatsappConfig.serverUrl)) {
      return res.status(400).json({
        error:
        'Nenhum canal de WhatsApp disponível: configure o WhatsApp da clínica ou vincule o template "Feliz Aniversário" em WhatsApp Oficial.'
      });
    }

    const serverUrl = whatsappConfig?.serverUrl ? cleanUrl(whatsappConfig.serverUrl) : null;
    const apiKey = whatsappConfig ? getWahaApiKey(whatsappConfig) : null;
    const sessionId = whatsappConfig?.sessionName || 'default';
    const chatId = formatarChatId(telefone);

    if (!chatId && !templateMeta) {
      return res.status(400).json({ error: 'Telefone inválido' });
    }

    // Busca nome da clínica
    let clinicaNome = 'nossa clínica';
    try {
      const clinica = await dbGlobal.prepare('SELECT nome FROM clinicas WHERE id = ?').get(clinicaId);
      if (clinica) clinicaNome = clinica.nome;
    } catch (e) {/* ignora */}

    const primeiroNome = (pacienteNome || 'paciente').split(' ')[0];

    // ⭐ Busca mensagem customizada (per-clinic)
    const anivConfig = await getAniversarioConfig(clinicaId);
    const mensagem = montarMensagemAniversario(primeiroNome, clinicaNome, anivConfig?.mensagemCustom);

    console.log(`🎂 [aniversarios] Enviando felicitação para ${pacienteNome} (${chatId})`);

    // ⭐ FIX v1.1: Registra ANTES do envio para evitar race condition em chamadas
    // concorrentes (clique duplo, cron sobreposto). Se o envio falhar de fato,
    // o erro é logado mas o registro permanece — é melhor um paciente perder
    // a felicitação do que receber duas.
    await registrarEnvio(db, pacienteId, ano);

    const resultado = templateMeta ?
    await enviarFelicitacaoMeta(clinicaId, telefone, primeiroNome, clinicaNome, templateMeta) :
    await enviarMensagemRobusta(serverUrl, apiKey, chatId, mensagem, sessionId);

    if (resultado) {
      console.log(`✅ [aniversarios] Felicitação enviada com sucesso para ${pacienteNome}`);
      res.json({ success: true, message: 'Felicitação enviada com sucesso' });
    } else {
      console.error(`❌ [aniversarios] Falha ao enviar felicitação para ${pacienteNome}`);
      res.status(500).json({ error: 'Falha ao enviar mensagem' });
    }
  } catch (err) {
    console.error('❌ [aniversarios] Erro ao enviar felicitação:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/aniversarios/enviar-todos
// Envia felicitação para TODOS os aniversariantes do dia de uma clínica
// Body: { clinicaId }
router.post('/enviar-todos', async (req, res) => {
  const { clinicaId } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  try {
    // ⭐⭐ TRAVA: felicitação desativada nas Configurações da clínica.
    // Antes só o cron checava isso — agora o próprio endpoint recusa.
    if (await felicitacaoDesativada(clinicaId)) {
      console.log(`🎂 [aniversarios] 🚫 Felicitação DESATIVADA na clínica ${clinicaId} — lote bloqueado`);
      return res.json({
        success: true,
        skipped: true,
        disabled: true,
        enviados: 0,
        message: 'Felicitação de aniversário está desativada nas Configurações desta clínica'
      });
    }

    const db = getClinicaDB(clinicaId);
    const aniversariantes = await getAniversariantesDoDia(db);
    const aptos = aniversariantes.filter((p) => p.felicitarAniversario !== 0 && p.telefone);

    if (aptos.length === 0) {
      return res.json({ success: true, enviados: 0, total: aniversariantes.length, message: 'Nenhum aniversariante apto para receber felicitação' });
    }

    const templateMeta = await templateAniversarioMeta(clinicaId);
    const whatsappConfig = await getWhatsAppConfig(db, clinicaId);
    if (!templateMeta && (!whatsappConfig || !whatsappConfig.serverUrl)) {
      return res.status(400).json({
        error:
        'Nenhum canal de WhatsApp disponível: configure o WhatsApp da clínica ou vincule o template "Feliz Aniversário" em WhatsApp Oficial.'
      });
    }

    const serverUrl = whatsappConfig?.serverUrl ? cleanUrl(whatsappConfig.serverUrl) : null;
    const apiKey = whatsappConfig ? getWahaApiKey(whatsappConfig) : null;
    const sessionId = whatsappConfig?.sessionName || 'default';

    let clinicaNome = 'nossa clínica';
    try {
      const clinica = await dbGlobal.prepare('SELECT nome FROM clinicas WHERE id = ?').get(clinicaId);
      if (clinica) clinicaNome = clinica.nome;
    } catch (e) {/* ignora */}

    // ⭐ Busca mensagem customizada per-clinic (fora do loop para performance)
    const anivConfigTodos = await getAniversarioConfig(clinicaId);

    // ⭐ FIX v1.1: Idempotência — garante tabela e filtra pacientes já contemplados este ano
    await new Promise((r) => garantirTabelaAniversarioEnviado(db, clinicaId, r));
    const ano = anoAtual();

    let enviados = 0;
    let erros = 0;
    let pulados = 0;

    for (const paciente of aptos) {
      const chatId = formatarChatId(paciente.telefone);
      if (!chatId && !templateMeta) {erros++;continue;}

      // ⭐ FIX v1.1: pula se já recebeu felicitação este ano
      const jaEnviou = await jaEnviouNesteAno(db, paciente.id, ano);
      if (jaEnviou) {
        pulados++;
        console.log(`🎂 [aniversarios] ⏭️  ${paciente.nome} (id=${paciente.id}) já recebeu felicitação em ${ano} — pulando`);
        continue;
      }

      const primeiroNome = (paciente.nome || 'paciente').split(' ')[0];

      // ⭐ Busca mensagem customizada (fora do loop para performance)
      const mensagem = montarMensagemAniversario(primeiroNome, clinicaNome, anivConfigTodos?.mensagemCustom);

      // ⭐ FIX v1.1: Registra ANTES do envio para evitar race condition entre
      // chamadas paralelas (cron + clique manual concorrentes).
      await registrarEnvio(db, paciente.id, ano);

      try {
        const resultado = templateMeta ?
        await enviarFelicitacaoMeta(
          clinicaId,
          paciente.telefone,
          primeiroNome,
          clinicaNome,
          templateMeta
        ) :
        await enviarMensagemRobusta(serverUrl, apiKey, chatId, mensagem, sessionId);
        if (resultado) {
          enviados++;
          console.log(`✅ [aniversarios] Felicitação enviada: ${paciente.nome}`);
        } else {
          erros++;
        }
        // Delay entre mensagens para não ser bloqueado
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        erros++;
        console.error(`❌ [aniversarios] Erro ao enviar para ${paciente.nome}:`, e.message);
      }
    }

    console.log(`🎂 [aniversarios] Resumo: ${enviados} enviados, ${pulados} pulados (já enviados este ano), ${erros} erros, ${aniversariantes.length} total`);
    res.json({ success: true, enviados, pulados, erros, total: aniversariantes.length });
  } catch (err) {
    console.error('❌ [aniversarios] Erro ao enviar felicitações em lote:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;