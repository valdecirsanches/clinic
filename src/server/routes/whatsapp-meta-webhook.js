// ============ WEBHOOK DE ENTRADA DO WHATSAPP OFICIAL DA META ============
// Contraparte do whatsapp-meta.js (que só ENVIA). Aqui chegam as RESPOSTAS do
// paciente e os ARQUIVOS que ele manda.
//
// ⭐ POR QUE UM ARQUIVO NOVO, E NÃO O webhook.js DO WAHA:
// o webhook.js é o receptor do WAHA e não é tocado por este arquivo. Os dois
// protocolos são incompatíveis na entrada:
//   • WAHA  → { event, session, payload: { from, body, media } }  (binário direto)
//   • Meta  → { entry: [{ changes: [{ value: { messages, statuses } }] }] }
//             (mídia em duas etapas: media_id → URL autenticada → download)
// Além disso a Meta envia RESPOSTA DE BOTÃO estruturada, então confirmar/cancelar
// não depende de interpretar texto livre — é mais confiável que o WAHA.
//
// Deste arquivo só são REUTILIZADOS (sem alteração) os helpers compartilhados de
// classificação e gravação de documento, para que um arquivo recebido pela Meta
// caia na MESMA especialidade/categoria solicitada pela clínica.

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');
const dbGlobal = require('../databaseGlobal');
const {
  matchConfirmacao,
  matchCancelamento,
  buscarSolicitacaoPendente,
  buscarSolicitacaoPendentePorPacienteId,
  buscarUltimaClassificacaoDocumento,
  marcarSolicitacaoRecebida,
  salvarDocumentoPaciente,
  salvarMensagemHistorico
} = require('./whatsapp-shared');
const {
  buscarConfigMeta,
  enviarWhatsappMeta,
  normalizarTelefoneMeta,
  linkWaMeClinica
} = require('./whatsapp-meta');
const {
  buscarEnvioPorWamid,
  buscarUltimoEnvioPorTelefone
} = require('./whatsapp-meta-envios');

const GRAPH_BASE_URL = 'https://graph.facebook.com';
const API_VERSION_PADRAO = 'v21.0';
const META_WEBHOOK_VERSAO = '2026-08-29-meta-inbound';

// ⚠️ A tela envia os POSTs como text/plain (evita o preflight OPTIONS, que o
// proxy não repassa). O parser existe no whatsapp-meta.js, mas ESTE é outro
// router: sem a mesma leitura, req.body chegava VAZIO e "Ativar recebimento"
// respondia "clinicaId é obrigatório" mesmo com a clínica selecionada.
// A entrega da Meta (application/json) não é afetada — só text/plain entra aqui.
router.use((req, res, next) => {
  const tipo = String(req.headers['content-type'] || '');
  if (!tipo.includes('text/plain') || req.body && Object.keys(req.body).length) {
    return next();
  }
  let bruto = '';
  req.setEncoding('utf8');
  req.on('data', (parte) => {
    bruto += parte;
    if (bruto.length > 1e6) req.destroy();
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

let fetchCompat =
typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
if (!fetchCompat) {
  try {
    const nodeFetch = require('node-fetch');
    fetchCompat = (...args) => nodeFetch(...args);
  } catch (e) {
    fetchCompat = null;
  }
}

// Mensagens repetidas: a Meta reentrega o mesmo evento quando não recebe 200 a
// tempo. Sem esta guarda, uma consulta seria confirmada duas vezes.
const idsProcessados = new Map();
const TEMPO_EXPIRACAO_ID = 10 * 60 * 1000;

function jaProcessada(id) {
  if (!id) return false;
  const agora = Date.now();
  for (const [chave, quando] of idsProcessados) {
    if (agora - quando > TEMPO_EXPIRACAO_ID) idsProcessados.delete(chave);
  }
  if (idsProcessados.has(id)) return true;
  idsProcessados.set(id, agora);
  return false;
}

// Aguardando o motivo do cancelamento (o paciente clicou "Cancelar" e a próxima
// mensagem dele é o motivo). Em memória: um diálogo curto, de minutos.
const aguardandoMotivo = new Map();
const TEMPO_MOTIVO = 30 * 60 * 1000;

function comOrcamento(promessa, ms) {
  return Promise.race([
  promessa,
  new Promise((resolve) => setTimeout(() => resolve(null), ms))]
  );
}

// ==================== RESOLUÇÃO DA CLÍNICA ====================

// A Meta identifica o destino pelo phone_number_id, não por sessão. Cada clínica
// tem o seu, então o número recebido diz de quem é a mensagem.
const cachePhoneNumberId = new Map();
const TEMPO_CACHE_CLINICA = 5 * 60 * 1000;

async function listarClinicas() {
  try {
    const rows = await dbGlobal.prepare('SELECT id, nome FROM clinicas').all();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error('🟢 [META-IN] Falha ao listar clínicas:', e.message);
    return [];
  }
}

async function buscarClinicaPorPhoneNumberId(phoneNumberId) {
  const chave = String(phoneNumberId || '');
  if (!chave) return null;

  const emCache = cachePhoneNumberId.get(chave);
  if (emCache && Date.now() - emCache.quando < TEMPO_CACHE_CLINICA) {
    return emCache.clinicaId;
  }

  const clinicas = await listarClinicas();
  for (const clinica of clinicas) {
    try {
      const config = await buscarConfigMeta(clinica.id);
      if (config && config.phoneNumberId && config.phoneNumberId === chave) {
        cachePhoneNumberId.set(chave, { clinicaId: clinica.id, quando: Date.now() });
        return clinica.id;
      }
    } catch (e) {

      // Uma clínica com banco indisponível não pode impedir as outras
    }}
  return null;
}

// ==================== PACIENTE ====================

// ⚠️ NO BRASIL A META DEVOLVE O NÚMERO SEM O NONO DÍGITO em boa parte dos casos:
// envia-se para 55 11 99701-0404 e a resposta chega como 55 11 9701-0404. Casar
// apenas pelos "últimos 9 dígitos" falha nesse caso (fica "197010404"), o
// paciente não é encontrado e a resposta é ignorada em silêncio. Por isso as
// duas formas — com e sem o 9 — são testadas.
function variantesTelefoneBr(digitos) {
  const formas = new Set();
  const semDdi = digitos.replace(/^55/, '');
  const candidatos = [digitos, semDdi];

  for (const numero of candidatos) {
    if (numero.length < 8) continue;
    formas.add(numero.slice(-9));
    formas.add(numero.slice(-8));
    // DDD + 8 dígitos → acrescenta o 9 (cadastro novo, resposta antiga)
    if (numero.length === 10) formas.add(`${numero.slice(0, 2)}9${numero.slice(2)}`.slice(-9));
  }
  return Array.from(formas).filter((f) => f.length >= 8);
}

async function buscarPacientePorTelefone(clinicaId, telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length < 8) return null;
  const db = getClinicaDB(clinicaId);
  const limpar = (coluna) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${coluna},''),'(',''),')',''),'-',''),' ','')`;

  for (const sufixo of variantesTelefoneBr(digitos)) {
    const achado = await new Promise((resolve) =>
    db.get(
      `SELECT id, nome, telefone, celular FROM pacientes
          WHERE ${limpar('celular')} LIKE ?
             OR ${limpar('telefone')} LIKE ?
          ORDER BY atualizadoEm DESC LIMIT 1`,
      [`%${sufixo}`, `%${sufixo}`],
      (err, row) => resolve(err ? null : row || null)
    )
    );
    if (achado) return achado;
  }
  return null;
}

// ==================== CONSULTA (confirmar / cancelar) ====================

async function garantirColunasConsulta(db) {
  const migrations = [
  `ALTER TABLE consultas ADD COLUMN confirmacaoCanal VARCHAR(30)`,
  `ALTER TABLE consultas ADD COLUMN canalCancelamento VARCHAR(30)`];

  for (const sql of migrations) {
    await new Promise((r) => db.run(sql, () => r()));
  }
}

// A consulta que o paciente está respondendo: a próxima ainda sem resposta.
// Nunca uma consulta antiga — responder um lembrete de meses atrás não existe.
async function buscarConsultaPendente(clinicaId, pacienteId) {
  const db = getClinicaDB(clinicaId);
  const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  return new Promise((resolve) =>
  db.get(
    `SELECT id, data, horario, status, pacienteNome, profissional
         FROM consultas
        WHERE pacienteId = ?
          AND data >= ?
          AND status NOT IN ('cancelada', 'realizada', 'finalizada', 'atendida')
          AND confirmacaoRecebidaEm IS NULL
        ORDER BY data ASC, horario ASC
        LIMIT 1`,
    [pacienteId, ontem],
    (err, row) => resolve(err ? null : row || null)
  )
  );
}

// A consulta EXATA do envio que originou a resposta. É a forma correta quando o
// registro do envio existe: não depende de "qual é a próxima consulta", que erra
// quando o paciente tem mais de uma marcada.
async function buscarConsultaPorId(clinicaId, consultaId) {
  if (!consultaId) return null;
  const db = getClinicaDB(clinicaId);
  return new Promise((resolve) =>
  db.get(
    `SELECT id, data, horario, status, pacienteId, pacienteNome, profissional,
              confirmacaoRecebidaEm
         FROM consultas WHERE id = ? LIMIT 1`,
    [consultaId],
    (err, row) => resolve(err ? null : row || null)
  )
  );
}

async function confirmarConsulta(clinicaId, consultaId) {
  const db = getClinicaDB(clinicaId);
  await garantirColunasConsulta(db);
  await new Promise((r) =>
  db.run(
    `UPDATE consultas
          SET status = 'confirmada', confirmacaoRecebidaEm = ?, confirmacaoCanal = 'meta'
        WHERE id = ?`,
    [new Date().toISOString(), consultaId],
    () => r()
  )
  );
}

async function cancelarConsulta(clinicaId, consultaId, motivo) {
  const db = getClinicaDB(clinicaId);
  await garantirColunasConsulta(db);
  await new Promise((r) =>
  db.run(
    `UPDATE consultas
          SET status = 'cancelada', motivoCancelamento = ?, confirmacaoRecebidaEm = ?,
              confirmacaoCanal = 'meta', canalCancelamento = 'meta'
        WHERE id = ?`,
    [String(motivo || 'Cancelado pelo paciente pelo WhatsApp'), new Date().toISOString(), consultaId],
    () => r()
  )
  );
}

// ==================== MÍDIA (duas etapas, ao contrário do WAHA) ====================

// A Meta não entrega o arquivo: entrega um media_id. Primeiro se obtém a URL,
// depois se baixa COM O TOKEN no cabeçalho (a URL sozinha não autentica).
async function baixarMidiaMeta(config, mediaId) {
  if (!fetchCompat) throw new Error('Ambiente sem fetch disponível');
  const versao = config.apiVersion || API_VERSION_PADRAO;

  const metaResp = await comOrcamento(
    fetchCompat(`${GRAPH_BASE_URL}/${versao}/${mediaId}`, {
      headers: { Authorization: `Bearer ${config.accessToken}` }
    }),
    15000
  );
  if (!metaResp) throw new Error('A Meta não respondeu ao pedido da mídia em 15s');
  const meta = await metaResp.json();
  if (!metaResp.ok || !meta.url) {
    throw new Error(meta?.error?.message || 'A Meta não devolveu a URL da mídia');
  }

  const arquivoResp = await comOrcamento(
    fetchCompat(meta.url, {
      headers: { Authorization: `Bearer ${config.accessToken}` }
    }),
    30000
  );
  if (!arquivoResp) throw new Error('Download da mídia não concluído em 30s');
  if (!arquivoResp.ok) throw new Error(`Download da mídia falhou (HTTP ${arquivoResp.status})`);

  const buffer = Buffer.from(await arquivoResp.arrayBuffer());
  return {
    base64: buffer.toString('base64'),
    mimetype: meta.mime_type || 'application/octet-stream'
  };
}

// Resposta curta ao paciente. Dentro da janela de 24h (ele acabou de escrever),
// a Meta aceita texto livre — então não é preciso template para responder.
async function responder(clinicaId, telefone, texto, comBotaoFalar = false) {
  try {
    // ⚠️ A opção correta é `mensagem` (texto livre). Com `texto`, o envio era
    // recusado por "informe a mensagem ou o template" e o paciente nunca
    // recebia a resposta automática.
    // ⭐ NADA de link para o WhatsApp. A Meta recusa wa.me em botão de template,
    // e um botão que abre OUTRA conversa é desnecessário: o paciente acabou de
    // escrever, então a janela de 24h está aberta e ele pode falar AQUI MESMO.
    // Basta convidá-lo a responder — a recepção atende pela tela de Mensagens.
    const convite = comBotaoFalar ?
    `${texto}\n\nSe precisar falar com a gente, é só responder esta mensagem — nossa equipe atende por aqui.` :
    texto;
    await enviarWhatsappMeta(clinicaId, telefone, { mensagem: convite });
  } catch (e) {
    console.log(`🟢 [META-IN] Não foi possível responder ao paciente: ${e.message}`);
  }
}

/**
 * ⭐ Aviso formal por TEMPLATE aprovado (aviso_de_confirmacao / aviso_de_cancelamento).
 *
 * Por que template e não só texto livre: o texto livre depende da janela de 24h
 * e não fica registrado como aviso oficial da clínica. O template é o mesmo
 * documento que a recepção enviaria. Se o template não estiver vinculado (ou a
 * Meta recusar), cai no texto livre — o paciente NUNCA fica sem resposta.
 */
async function responderComTemplate(
clinicaId,
telefone,
chave,
params,
textoAlternativo,
comBotaoFalar = false)
{
  try {
    const config = await buscarConfigMeta(clinicaId);
    const template = config?.templates?.[chave];
    if (template?.name) {
      await enviarWhatsappMeta(clinicaId, telefone, {
        template: {
          name: template.name,
          language: template.language,
          params: (params || []).map((p) => String(p || '-'))
        }
      });
      return;
    }
  } catch (e) {
    console.log(
      `🟢 [META-IN] Template "${chave}" não enviado (${e.message}) — usando texto livre.`
    );
  }
  await responder(clinicaId, telefone, textoAlternativo, comBotaoFalar);
}

// Base pública deste servidor, capturada no recebimento (o processamento é
// assíncrono e não tem mais acesso ao `req`).
let baseUrlLembrada = process.env.PUBLIC_API_URL || '';

// ==================== TELEMETRIA DE ENTRADA ====================
// Sem isto era impossível saber se a Meta chega a CHAMAR o webhook. "Nada
// aconteceu" tem duas causas muito diferentes: o evento não chegou (assinatura
// da WABA ausente) ou chegou e não foi interpretado.
const ultimosEventos = [];
const MAX_EVENTOS = 20;
let totalRecebidos = 0;

function registrarRecebimento(body) {
  totalRecebidos += 1;
  try {
    const valor = body?.entry?.[0]?.changes?.[0]?.value || {};
    const mensagem = valor?.messages?.[0];
    ultimosEventos.unshift({
      em: new Date().toISOString(),
      phoneNumberId: valor?.metadata?.phone_number_id || null,
      de: mensagem?.from || null,
      tipo: mensagem?.type || (valor?.statuses ? 'status' : 'desconhecido'),
      // Prova de que a resposta cita o envio da clínica — é por este id que o
      // paciente e a consulta são identificados (e não pelo telefone).
      contexto: mensagem?.context?.id || null,
      botao:
      mensagem?.interactive?.button_reply?.title ||
      mensagem?.button?.text ||
      null,
      texto: mensagem?.text?.body || null
    });
    if (ultimosEventos.length > MAX_EVENTOS) ultimosEventos.pop();
  } catch (e) {

    /* telemetria nunca pode derrubar o recebimento */}
}

// ==================== VERIFICAÇÃO DO WEBHOOK (GET) ====================

// A Meta chama esta rota UMA vez, ao cadastrar a URL no painel. Precisa devolver
// o hub.challenge em texto puro quando o verify token confere.
router.get('/webhook', async (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (modo !== 'subscribe' || !challenge) {
    return res.json({
      ok: true,
      versao: META_WEBHOOK_VERSAO,
      mensagem:
      'Webhook de entrada da Meta ativo. Cadastre esta URL no painel da Meta com o verify token da clínica.'
    });
  }

  // O token pode ser o global (uma URL para todas as clínicas) ou o de qualquer
  // clínica configurada — a Meta valida por app, não por número.
  const tokenGlobal = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
  if (tokenGlobal && token === tokenGlobal) {
    console.log('🟢 [META-IN] ✅ Webhook verificado (token global)');
    return res.status(200).send(String(challenge));
  }

  const clinicas = await listarClinicas();
  for (const clinica of clinicas) {
    try {
      const config = await buscarConfigMeta(clinica.id);
      if (config && config.verifyToken && config.verifyToken === token) {
        console.log(`🟢 [META-IN] ✅ Webhook verificado (clínica ${clinica.id})`);
        return res.status(200).send(String(challenge));
      }
    } catch (e) {

      /* clínica indisponível não interrompe a verificação */}
  }

  console.log('🟢 [META-IN] ❌ Verificação recusada: verify token não confere');
  res.sendStatus(403);
});

// ==================== RECEBIMENTO (POST) ====================

router.post('/webhook', (req, res) => {
  // ⭐ Guarda a base pública para montar o link "Falar conosco" nas respostas
  // automáticas — o processamento acontece fora do ciclo da requisição.
  baseUrlLembrada = baseUrlPublicaHttps(req);
  registrarRecebimento(req.body);
  // ⭐ Responde ANTES de processar: a Meta reentrega o evento (e pode desativar a
  // assinatura) se a resposta demorar. Mesmo princípio do webhook do WAHA.
  res.sendStatus(200);

  processarEvento(req.body).catch((err) => {
    console.error('🟢 [META-IN] 🛑 Falha ao processar evento:', err.message);
  });
});

async function processarEvento(body) {
  const entradas = Array.isArray(body?.entry) ? body.entry : [];
  for (const entrada of entradas) {
    const mudancas = Array.isArray(entrada.changes) ? entrada.changes : [];
    for (const mudanca of mudancas) {
      const valor = mudanca?.value || {};
      const phoneNumberId = valor?.metadata?.phone_number_id;

      // Status de entrega (enviada/entregue/lida/falhou): registrado no log, sem
      // ação. É o que permite saber depois por que uma mensagem não chegou.
      if (Array.isArray(valor.statuses) && valor.statuses.length > 0) {
        for (const status of valor.statuses) {
          if (status.status === 'failed') {
            const erro = status.errors?.[0];
            console.log(
              `🟢 [META-IN] ⚠️ Entrega FALHOU para ${status.recipient_id}: ${erro?.title || ''} ${erro?.message || ''}`
            );
          }
        }
      }

      const mensagens = Array.isArray(valor.messages) ? valor.messages : [];
      if (mensagens.length === 0) continue;

      const clinicaId = await buscarClinicaPorPhoneNumberId(phoneNumberId);
      if (!clinicaId) {
        console.log(
          `🟢 [META-IN] ⚠️ Nenhuma clínica com phone_number_id ${phoneNumberId} — mensagem ignorada`
        );
        continue;
      }

      const config = await buscarConfigMeta(clinicaId);
      const nomeContato = valor.contacts?.[0]?.profile?.name || null;

      for (const mensagem of mensagens) {
        try {
          await processarMensagem(clinicaId, config, mensagem, nomeContato);
        } catch (err) {
          console.error(`🟢 [META-IN] 🛑 Erro na mensagem ${mensagem.id}:`, err.message);
        }
      }
    }
  }
}

async function processarMensagem(clinicaId, config, mensagem, nomeContato) {
  if (jaProcessada(mensagem.id)) return;

  const telefone = String(mensagem.from || '').replace(/\D/g, '');
  if (!telefone) return;

  // ⭐ IDENTIFICAÇÃO PELO CONTEXTO DO ENVIO, NÃO PELO TELEFONE.
  // Buscar o paciente pelo número é inconsistente: o mesmo telefone serve mãe e
  // filhos, e a mensagem pode ter sido enviada para um terceiro. A resposta de
  // botão traz `context.id` = o wamid da mensagem que a clínica enviou, então o
  // paciente e a consulta são exatamente os daquele envio.
  const contextoId = mensagem.context?.id || null;
  let envio = contextoId ? await buscarEnvioPorWamid(clinicaId, contextoId) : null;
  let origemIdentificacao = envio ? 'contexto' : null;

  // Texto livre não traz contexto: cai no último envio feito para esse número.
  if (!envio) {
    envio = await buscarUltimoEnvioPorTelefone(clinicaId, telefone);
    if (envio) origemIdentificacao = 'ultimo-envio';
  }

  let pacienteId = envio?.pacienteId || null;
  let pacienteNome = envio?.pacienteNome || null;

  // Último recurso (mensagem espontânea, sem envio anterior): o telefone. Aqui
  // o risco de ambiguidade é aceitável porque não há nada melhor — e a ação
  // sensível (confirmar/cancelar) exige um envio identificado.
  if (!pacienteId) {
    const paciente = await buscarPacientePorTelefone(clinicaId, telefone);
    if (paciente) {
      pacienteId = paciente.id;
      pacienteNome = paciente.nome;
      origemIdentificacao = 'telefone';
    }
  }
  if (!pacienteNome) pacienteNome = nomeContato || telefone;

  // ⭐ Resposta de BOTÃO: a Meta entrega a escolha estruturada. É mais confiável
  // que interpretar texto, e é o caminho normal dos templates com botões.
  const respostaBotao =
  mensagem.interactive?.button_reply?.title ||
  mensagem.interactive?.button_reply?.id ||
  mensagem.button?.text ||
  mensagem.button?.payload ||
  null;

  const texto =
  mensagem.text?.body ||
  mensagem.image?.caption ||
  mensagem.document?.caption ||
  respostaBotao ||
  '';

  // Registra no histórico do paciente ANTES de agir: mesmo uma mensagem que o
  // sistema não entende precisa ficar visível para a clínica.
  if (pacienteId) {
    await salvarMensagemHistorico(
      clinicaId,
      pacienteId,
      pacienteNome,
      'recebida',
      texto || `[${mensagem.type}]`,
      'recebida',
      telefone
    ).catch(() => {});
  }

  console.log(
    `🟢 [META-IN] 📥 ${pacienteNome} (${telefone}) tipo=${mensagem.type}${respostaBotao ? ` botão="${respostaBotao}"` : ''} identificação=${origemIdentificacao || 'não identificado'}${envio?.consultaId ? ` consulta=${envio.consultaId}` : ''}`
  );

  // ---------- ARQUIVOS (documento solicitado pela clínica) ----------
  if (mensagem.type === 'image' || mensagem.type === 'document') {
    const mediaId = mensagem.image?.id || mensagem.document?.id;
    if (!mediaId) return;

    if (!pacienteId) {
      await responder(
        clinicaId,
        telefone,
        'Recebemos seu arquivo, mas não localizamos seu cadastro por este número. Entre em contato com a clínica.'
      );
      return;
    }

    const { base64, mimetype } = await baixarMidiaMeta(config, mediaId);

    // ⭐ MESMA classificação do fluxo do WAHA: o arquivo vai para a
    // especialidade/categoria que a clínica pediu, nunca em "Outros" por padrão.
    let categoria = 'outros';
    let especialidade = null;
    let solicitacaoId = null;

    const pendente =
    (await buscarSolicitacaoPendente(clinicaId, telefone).catch(() => null)) || (
    await buscarSolicitacaoPendentePorPacienteId(clinicaId, pacienteId).catch(() => null));

    if (pendente) {
      categoria = pendente.categoria || categoria;
      especialidade = pendente.especialidade || null;
      solicitacaoId = pendente.id || null;
    } else {
      const ultima = await buscarUltimaClassificacaoDocumento(
        clinicaId,
        pacienteId,
        telefone
      ).catch(() => null);
      if (ultima) {
        categoria = ultima.categoria || categoria;
        especialidade = ultima.especialidade || null;
      }
    }

    const salvo = await salvarDocumentoPaciente(
      clinicaId,
      pacienteId,
      pacienteNome,
      base64,
      mimetype,
      mensagem.type,
      categoria,
      especialidade
    );

    if (solicitacaoId) {
      await marcarSolicitacaoRecebida(clinicaId, solicitacaoId, salvo?.url || null).catch(
        () => {}
      );
    }

    console.log(
      `🟢 [META-IN] 📎 Documento salvo para ${pacienteNome} — ${especialidade || 'sem especialidade'} / ${categoria}`
    );
    await responder(
      clinicaId,
      telefone,
      'Arquivo recebido e anexado ao seu cadastro. Obrigado!'
    );
    return;
  }

  if (!texto) return;

  // ---------- MOTIVO DO CANCELAMENTO (diálogo aberto) ----------
  const dialogo = aguardandoMotivo.get(telefone);
  if (dialogo && Date.now() - dialogo.quando < TEMPO_MOTIVO) {
    aguardandoMotivo.delete(telefone);
    await cancelarConsulta(clinicaId, dialogo.consultaId, texto);
    console.log(`🟢 [META-IN] 🚫 Consulta ${dialogo.consultaId} CANCELADA — motivo: ${texto}`);
    // Motivo registrado → aviso oficial de cancelamento.
    const cancelada = await buscarConsultaPorId(clinicaId, dialogo.consultaId);
    await responderComTemplate(
      clinicaId,
      telefone,
      'cancelamento',
      [
      String(pacienteNome || 'paciente').split(' ')[0],
      formatarDataBr(cancelada?.data),
      String(cancelada?.horario || '').slice(0, 5)],

      'Sua consulta foi cancelada e o motivo foi registrado. Quando quiser reagendar, estamos à disposição.',
      true
    );
    return;
  }

  // ---------- "FALAR CONOSCO" (resposta rápida do template) ----------
  // Como a Meta proíbe wa.me em botão, "Falar conosco" é uma RESPOSTA RÁPIDA.
  // O toque já abre a janela de 24h: a conversa continua no próprio número
  // oficial e a recepção responde pela tela de Mensagens.
  const normalizado = String(texto).
  toUpperCase().
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '');
  if (/FALAR CONOSCO|FALAR COM|ATENDIMENTO|QUERO FALAR/.test(normalizado)) {
    console.log(`🟢 [META-IN] 💬 ${pacienteNome} pediu atendimento humano`);
    await responder(
      clinicaId,
      telefone,
      'Claro! Escreva aqui sua dúvida ou o que precisa, que nossa equipe responde em seguida.'
    );
    return;
  }

  // ---------- CONFIRMAR / CANCELAR ----------
  const confirmou = matchConfirmacao(texto);
  const cancelou = matchCancelamento(texto);
  if (!confirmou && !cancelou) return;

  // ⭐ A consulta vem do REGISTRO DO ENVIO (identificação exata). Só se não
  // houver envio registrado recorremos a "próxima consulta do paciente".
  let consulta = await buscarConsultaPorId(clinicaId, envio?.consultaId);

  // ⭐ Uma consulta já respondida não é reprocessada quando o paciente REPETE a
  // mesma resposta (clique duplicado). Mas DESISTIR depois de confirmar é uma
  // decisão nova e legítima: bloquear isso deixava a agenda com um paciente que
  // avisou que não vem — exatamente o "cliquei em Não poderei comparecer e não
  // aconteceu nada". Confirmada → cancelada passa; o inverso exige a clínica.
  if (consulta && consulta.confirmacaoRecebidaEm) {
    const jaConfirmada = String(consulta.status || '') === 'confirmada';
    const jaCancelada = String(consulta.status || '') === 'cancelada';
    const repetiuMesmaResposta = confirmou && jaConfirmada || cancelou && jaCancelada;
    const querReconfirmarCancelada = confirmou && jaCancelada;

    if (repetiuMesmaResposta || querReconfirmarCancelada) {
      await responder(
        clinicaId,
        telefone,
        jaConfirmada ?
        'Esta consulta já está confirmada. Para alterar, entre em contato com a clínica.' :
        'Esta consulta já está cancelada. Para reagendar, entre em contato com a clínica.',
        // Reagendar/alterar depende de atendimento humano: leva o botão.
        true
      );
      return;
    }
  }

  if (!consulta && pacienteId) {
    consulta = await buscarConsultaPendente(clinicaId, pacienteId);
  }

  if (!consulta) {
    await responder(
      clinicaId,
      telefone,
      'Não encontramos uma consulta aguardando resposta. Se precisar, fale com a clínica pelo botão abaixo.',
      true
    );
    return;
  }

  if (confirmou) {
    await confirmarConsulta(clinicaId, consulta.id);
    console.log(`🟢 [META-IN] ✅ Consulta ${consulta.id} CONFIRMADA por ${pacienteNome}`);
    // Confirmou → aviso oficial de confirmação (aviso_de_confirmacao).
    await responderComTemplate(
      clinicaId,
      telefone,
      'confirmacaoAviso',
      [
      String(pacienteNome || 'paciente').split(' ')[0],
      formatarDataBr(consulta.data),
      String(consulta.horario || '').slice(0, 5),
      consulta.profissional || 'nossa equipe'],

      'Presença confirmada! Até breve.'
    );
    return;
  }

  // ⭐ CANCELAMENTO IMEDIATO. Antes o cancelamento só era gravado DEPOIS que o
  // paciente escrevesse o motivo — se ele não respondesse (o caso normal, já que
  // clicar no botão parece concluir a ação), a consulta ficava intacta e a
  // clínica via "nada aconteceu". A agenda é a informação crítica: cancela-se
  // já, e o motivo é apenas complementado quando ele chegar.
  await cancelarConsulta(clinicaId, consulta.id, 'Cancelado pelo paciente pelo WhatsApp');
  console.log(`🟢 [META-IN] 🚫 Consulta ${consulta.id} CANCELADA por ${pacienteNome}`);
  aguardandoMotivo.set(telefone, { consultaId: consulta.id, quando: Date.now() });
  const quando = [
  formatarDataBr(consulta.data),
  String(consulta.horario || '').slice(0, 5)].

  filter(Boolean).
  join(' às ');
  await responder(
    clinicaId,
    telefone,
    `Sua consulta${quando ? ` de ${quando}` : ''} foi cancelada.\n\nSe puder, responda esta mensagem informando o motivo. Para reagendar ou falar com a clínica, use o botão abaixo.`,
    // ⭐ Cancelamento é o momento em que o paciente mais precisa de atendimento
    // humano — a resposta leva o botão que abre a conversa livre da clínica.
    true
  );
}

function formatarDataBr(data) {
  const iso = String(data || '').slice(0, 10);
  const [ano, mes, dia] = iso.split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : '';
}

// ==================== DIAGNÓSTICO ====================

// Uma URL para conferir se o webhook está no ar e o que a clínica precisa
// cadastrar no painel da Meta — em vez de depurar às cegas.
// ⚠️ A Meta EXIGE HTTPS na Callback URL. Atrás do proxy o Express enxerga
// "http", e a URL mostrada saía http:// — colada no painel, a Meta recusa.
function baseUrlPublicaHttps(req) {
  if (process.env.PUBLIC_API_URL) return String(process.env.PUBLIC_API_URL).replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `https://${host}`;
}

router.get('/webhook-info', async (req, res) => {
  const { clinicaId } = req.query;
  const base = baseUrlPublicaHttps(req);

  const info = {
    versao: META_WEBHOOK_VERSAO,
    callbackUrl: `${base}/api/whatsapp-meta/webhook`,
    campoObrigatorio: 'messages',
    verifyTokenConfigurado: false,
    fetchDisponivel: Boolean(fetchCompat),
    // Prova objetiva de que a Meta está (ou não) chamando o webhook.
    eventosRecebidos: totalRecebidos,
    ultimoEventoEm: ultimosEventos[0]?.em || null,
    ultimosEventos: ultimosEventos.slice(0, 5)
  };

  if (clinicaId) {
    try {
      const config = await buscarConfigMeta(clinicaId);
      info.verifyTokenConfigurado = Boolean(config?.verifyToken);
      info.phoneNumberId = config?.phoneNumberId || null;
      info.tokenConfigurado = Boolean(config?.accessToken);
      info.wabaId = config?.wabaId || null;
      // ⭐ A causa mais comum de "respondi e nada aconteceu": a WABA nunca foi
      // ASSINADA pelo app. Sem assinatura a Meta não entrega nada ao webhook.
      const assinatura = await consultarAssinaturaWaba(config);
      info.assinaturaWaba = assinatura.assinada;
      info.assinaturaDetalhe = assinatura.detalhe;
      // Etapa que costuma faltar: a Callback URL registrada no APP.
      const callback = await consultarCallbackApp(
        config?.apiVersion || API_VERSION_PADRAO
      );
      info.callbackRegistrado = callback.registrado;
      info.callbackDetalhe = callback.detalhe;
      info.callbackUrlNaMeta = callback.callbackUrl || null;
      // ⚠️ "Não verificado" NÃO é "pronto". Antes, quando a Callback URL não
      // podia ser consultada (sem APP_ID/SECRET), a tela mostrava "Ativo" com
      // ZERO evento recebido — dizia que estava funcionando quando não estava.
      // A única prova real de recebimento é evento chegando.
      info.recebimentoPronto =
      totalRecebidos > 0 ||
      assinatura.assinada === true && callback.registrado === true;
      info.recebimentoNaoVerificado =
      totalRecebidos === 0 &&
      assinatura.assinada === true &&
      callback.registrado === null;
    } catch (e) {
      info.erro = e.message;
    }
  }

  res.json(info);
});

// ⭐ DIAGNÓSTICO EM UMA ÚNICA URL, SEM LOGIN E SEM SABER O clinicaId.
// GET /api/whatsapp-meta/receber-diag  → texto puro, legível, com o veredito.
// Existe para acabar com o ciclo de "testa e não funciona": esta página diz,
// objetivamente, se a Meta chegou a CHAMAR o webhook e o que falta.
router.get('/receber-diag', async (req, res) => {
  const base = baseUrlPublicaHttps(req);
  const callbackUrl = `${base}/api/whatsapp-meta/webhook`;
  const linhas = [];

  linhas.push('=== DIAGNÓSTICO DO RECEBIMENTO (WhatsApp oficial / Meta) ===');
  linhas.push(`versão do webhook : ${META_WEBHOOK_VERSAO}`);
  linhas.push(`callback esperada : ${callbackUrl}`);
  linhas.push(`fetch disponível  : ${Boolean(fetchCompat)}`);
  linhas.push('');
  linhas.push('--- 1) A META CHEGOU A CHAMAR ESTE SERVIDOR? ---');
  linhas.push(`eventos recebidos desde o último restart: ${totalRecebidos}`);
  if (totalRecebidos === 0) {
    linhas.push('VEREDITO: NÃO. Nenhum evento chegou. O problema está ANTES do');
    linhas.push('sistema (Callback URL do app, assinatura da WABA ou o proxy');
    linhas.push('bloqueando POST externo em /api). Não adianta mexer no código.');
  } else {
    linhas.push('VEREDITO: SIM. Os eventos abaixo chegaram — se nada acontece na');
    linhas.push('agenda, a falha é na interpretação (paciente/consulta), não na Meta.');
    for (const ev of ultimosEventos.slice(0, 10)) {
      linhas.push(
        `  ${ev.em} · de=${ev.de || '-'} · tipo=${ev.tipo} · botão=${ev.botao || '-'} · contexto=${ev.contexto ? 'sim' : '-'} · texto=${(ev.texto || '-').slice(0, 60)}`
      );
    }
  }

  linhas.push('');
  linhas.push('--- 2) CADA CLÍNICA CONFIGURADA ---');
  const app = appAccessToken();
  linhas.push(
    `META_APP_ID/META_APP_SECRET no servidor: ${app ? 'SIM' : 'NÃO (a URL precisa ser cadastrada à mão no painel)'}`
  );

  const clinicas = await listarClinicas();
  let achou = false;
  for (const clinica of clinicas) {
    let config = null;
    try {
      config = await buscarConfigMeta(clinica.id);
    } catch (e) {
      continue;
    }
    if (!config?.phoneNumberId && !config?.wabaId) continue;
    achou = true;
    const versao = config.apiVersion || API_VERSION_PADRAO;
    const assinatura = await consultarAssinaturaWaba(config);
    const callback = await consultarCallbackApp(versao);
    linhas.push('');
    linhas.push(`clínica          : ${clinica.nome} (${clinica.id})`);
    linhas.push(`phoneNumberId    : ${config.phoneNumberId || '(vazio)'}`);
    linhas.push(`wabaId           : ${config.wabaId || '(vazio)'}`);
    linhas.push(`token            : ${config.accessToken ? 'presente' : 'AUSENTE'}`);
    linhas.push(`verifyToken      : ${config.verifyToken || '(vazio)'}`);
    linhas.push(`WABA assinada    : ${assinatura.assinada} — ${assinatura.detalhe}`);
    linhas.push(`Callback no app  : ${callback.registrado} — ${callback.detalhe}`);
    if (callback.callbackUrl && callback.callbackUrl !== callbackUrl) {
      linhas.push(
        `⚠️ A URL registrada na Meta É DIFERENTE da deste servidor. Registrada: ${callback.callbackUrl}`
      );
    }
  }
  if (!achou) linhas.push('Nenhuma clínica com configuração da Meta encontrada.');

  linhas.push('');
  linhas.push('--- CONCLUSÃO ---');
  if (totalRecebidos === 0) {
    linhas.push('⚠️ CAUSA Nº 1 QUANDO A URL JÁ ESTÁ CADASTRADA E CORRETA:');
    linhas.push('   O APP NÃO ESTÁ PUBLICADO (modo de desenvolvimento).');
    linhas.push('   Nesse modo a Meta só entrega webhooks de TESTE disparados do');
    linhas.push('   painel — nenhuma mensagem real, nem de administradores ou');
    linhas.push('   testadores. Publique o app no painel (Revisão do app → Ativo).');
    linhas.push('   CAUSA Nº 2: o campo "messages" não está com Assinar LIGADO.');
    linhas.push('');
  }
  if (totalRecebidos > 0) {
    linhas.push('A Meta ENTREGA os eventos. Se a agenda não muda, a falha está na');
    linhas.push('interpretação (paciente não encontrado pelo telefone, ou nenhuma');
    linhas.push('consulta pendente). Veja os eventos listados acima.');
  } else if (!app) {
    linhas.push('A conta (WABA) está assinada, mas o APP não tem Callback URL');
    linhas.push('registrada — e o servidor não tem META_APP_ID/META_APP_SECRET');
    linhas.push('para registrá-la sozinho. É POR ISSO que nada chega.');
    linhas.push('');
    linhas.push('CAMINHO A — automático: coloque no server/.env.local');
    linhas.push('   META_APP_ID=...');
    linhas.push('   META_APP_SECRET=...');
    linhas.push('reinicie o backend e clique em "Ativar recebimento" na tela.');
    linhas.push('');
    linhas.push('CAMINHO B — manual, no painel da Meta:');
    linhas.push('   App → WhatsApp → Configuração → Webhook → Editar');
    linhas.push(`   Callback URL : ${callbackUrl}`);
    linhas.push('   Verify token : (o verifyToken da clínica, listado acima)');
    linhas.push('   Depois clique em "Gerenciar" e ASSINE o campo: messages');
    linhas.push('');
    linhas.push('⚠️ A URL precisa ser HTTPS e responder de fora. Assinar o campo');
    linhas.push('   "messages" é obrigatório: sem ele a URL é aceita e mesmo assim');
    linhas.push('   nenhuma resposta de botão é entregue.');
  } else {
    linhas.push('Confira acima se a Callback do app está registrada e se o campo');
    linhas.push('"messages" está assinado. Se estiver, teste o curl abaixo: se o');
    linhas.push('contador não subir, o proxy está bloqueando POST externo em /api.');
  }

  linhas.push('');
  linhas.push('--- 3) O PRÓPRIO SERVIDOR ACEITA O POST DA META? ---');
  linhas.push(`Teste externo: curl -X POST ${callbackUrl} -H 'Content-Type: application/json' -d '{"object":"whatsapp_business_account","entry":[]}'`);
  linhas.push('Deve responder 200 e o contador de eventos acima deve subir em 1.');

  res.type('text/plain').send(linhas.join('\n'));
});

// ⭐ ASSINATURA NO NÍVEL DO APP.
// Assinar a WABA (subscribed_apps) NÃO basta: o app precisa ter a Callback URL
// registrada, senão a Meta não tem para onde entregar. Isso normalmente é feito
// à mão no painel — e é a etapa que costuma ficar esquecida. Com APP_ID e
// APP_SECRET no servidor dá para registrar por API, sem depender do painel.
function appAccessToken() {
  const id = String(process.env.META_APP_ID || '').trim();
  const secret = String(process.env.META_APP_SECRET || '').trim();
  if (!id || !secret) return null;
  return { appId: id, token: `${id}|${secret}` };
}

async function consultarCallbackApp(versao) {
  const app = appAccessToken();
  if (!app) {
    return {
      registrado: null,
      detalhe: 'META_APP_ID/META_APP_SECRET não definidos no servidor'
    };
  }
  if (!fetchCompat) return { registrado: null, detalhe: 'Ambiente sem fetch' };
  try {
    const resp = await comOrcamento(
      fetchCompat(
        `${GRAPH_BASE_URL}/${versao}/${app.appId}/subscriptions?access_token=${encodeURIComponent(app.token)}`
      ),
      12000
    );
    if (!resp) return { registrado: null, detalhe: 'A Meta não respondeu em 12s' };
    const json = await resp.json();
    if (!resp.ok) {
      return { registrado: null, detalhe: json?.error?.message || `HTTP ${resp.status}` };
    }
    const wa = (json.data || []).find((s) => s.object === 'whatsapp_business_account');
    if (!wa) return { registrado: false, detalhe: 'Nenhuma Callback URL registrada no app' };
    const campos = (wa.fields || []).map((f) => f.name || f);
    return {
      registrado: campos.includes('messages'),
      detalhe: `${wa.callback_url || 'sem URL'} · campos: ${campos.join(', ') || 'nenhum'}`,
      callbackUrl: wa.callback_url || null
    };
  } catch (e) {
    return { registrado: null, detalhe: e.message };
  }
}

async function registrarCallbackApp(versao, callbackUrl, verifyToken) {
  const app = appAccessToken();
  if (!app) {
    return {
      ok: false,
      detalhe:
      'META_APP_ID e META_APP_SECRET não estão no servidor — cadastre a Callback URL no painel da Meta.'
    };
  }
  if (!fetchCompat) return { ok: false, detalhe: 'Ambiente sem fetch' };
  try {
    const corpo = new URLSearchParams({
      object: 'whatsapp_business_account',
      callback_url: callbackUrl,
      verify_token: verifyToken,
      fields: 'messages',
      access_token: app.token
    });
    const resp = await comOrcamento(
      fetchCompat(`${GRAPH_BASE_URL}/${versao}/${app.appId}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corpo.toString()
      }),
      20000
    );
    if (!resp) return { ok: false, detalhe: 'A Meta não respondeu em 20s' };
    const json = await resp.json();
    if (!resp.ok || !json.success) {
      return {
        ok: false,
        detalhe:
        json?.error?.message ||
        'A Meta recusou o registro da Callback URL (ela precisa ser pública e HTTPS).'
      };
    }
    return { ok: true, detalhe: `Callback URL registrada: ${callbackUrl}` };
  } catch (e) {
    return { ok: false, detalhe: e.message };
  }
}

// Consulta se o app está assinado na WABA da clínica.
async function consultarAssinaturaWaba(config) {
  if (!config?.wabaId || !config?.accessToken) {
    return { assinada: null, detalhe: 'WABA ID ou token ausente' };
  }
  if (!fetchCompat) return { assinada: null, detalhe: 'Ambiente sem fetch' };
  const versao = config.apiVersion || API_VERSION_PADRAO;
  try {
    const resp = await comOrcamento(
      fetchCompat(`${GRAPH_BASE_URL}/${versao}/${config.wabaId}/subscribed_apps`, {
        headers: { Authorization: `Bearer ${config.accessToken}` }
      }),
      12000
    );
    if (!resp) return { assinada: null, detalhe: 'A Meta não respondeu em 12s' };
    const json = await resp.json();
    if (!resp.ok) {
      return { assinada: null, detalhe: json?.error?.message || `HTTP ${resp.status}` };
    }
    const apps = Array.isArray(json.data) ? json.data : [];
    return {
      assinada: apps.length > 0,
      detalhe: apps.length > 0 ? `${apps.length} app(s) assinado(s)` : 'Nenhum app assinado nesta WABA'
    };
  } catch (e) {
    return { assinada: null, detalhe: e.message };
  }
}

// ==================== ATIVAR RECEBIMENTO (assinar a WABA) ====================
// Necessário para as clínicas configuradas MANUALMENTE: a assinatura só era
// feita no fluxo do Embedded Signup, então quem colou as credenciais na mão
// enviava normalmente, mas nunca recebia resposta nenhuma.
router.post('/assinar-webhook', async (req, res) => {
  const clinicaId = req.body?.clinicaId || req.query?.clinicaId;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!fetchCompat) return res.status(400).json({ error: 'Ambiente sem fetch disponível' });

  try {
    const config = await buscarConfigMeta(clinicaId);
    if (!config?.wabaId) {
      return res.status(400).json({
        error: 'Informe o WABA ID da clínica antes de ativar o recebimento.'
      });
    }
    if (!config?.accessToken) {
      return res.status(400).json({
        error: 'Informe o token de acesso da clínica antes de ativar o recebimento.'
      });
    }

    const versao = config.apiVersion || API_VERSION_PADRAO;

    // ETAPA 1 — Callback URL no APP. Sem ela a Meta não tem para onde entregar,
    // por mais que a WABA esteja assinada.
    const callbackUrl = `${baseUrlPublicaHttps(req)}/api/whatsapp-meta/webhook`;
    const jaRegistrado = await consultarCallbackApp(versao);
    let etapaCallback = jaRegistrado.detalhe;
    if (jaRegistrado.registrado !== true) {
      const registro = await registrarCallbackApp(
        versao,
        callbackUrl,
        config.verifyToken || 'easyclin'
      );
      etapaCallback = registro.detalhe;
      if (!registro.ok && jaRegistrado.registrado === false) {
        return res.status(400).json({
          error: `A Callback URL não está registrada no app da Meta e não foi possível registrá-la automaticamente: ${registro.detalhe}. Cadastre no painel da Meta → WhatsApp → Configuração: URL ${callbackUrl} e token de verificação ${config.verifyToken || '(gere salvando a configuração)'}.`
        });
      }
    }

    // ETAPA 2 — assinar a WABA da clínica.
    const resp = await comOrcamento(
      fetchCompat(`${GRAPH_BASE_URL}/${versao}/${config.wabaId}/subscribed_apps`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.accessToken}` }
      }),
      15000
    );
    if (!resp) {
      return res.status(400).json({ error: 'A Meta não respondeu em 15s.' });
    }
    const json = await resp.json();
    if (!resp.ok || !json.success) {
      return res.status(400).json({
        error:
        json?.error?.message ||
        'A Meta recusou a assinatura da conta. Confira o WABA ID e as permissões do token.'
      });
    }

    console.log(
      `🟢 [META-IN] ✅ WABA ${config.wabaId} assinada (clínica ${clinicaId}) · callback: ${etapaCallback}`
    );
    res.json({
      ok: true,
      callbackUrl,
      detalheCallback: etapaCallback,
      mensagem:
      'Recebimento ativado: conta assinada e URL de entrada registrada. As respostas dos botões e os arquivos do paciente passam a chegar neste sistema.'
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;