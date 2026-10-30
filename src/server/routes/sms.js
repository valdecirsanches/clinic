// ==================== ROTAS DE SMS (PROVEDOR SMSGo) ====================
// Canal alternativo ao WhatsApp para avisos ao paciente.
//
// A comunicação é HTTP direta com a SMSGo (sem SDK, sem dependência a instalar):
// autenticação de 2 passos (SMSGo-key → token Bearer) e POST /v1/sms/send/single.
//
// ⭐ REGRA DE OURO DESTE ARQUIVO: a rota SEMPRE responde, e responde RÁPIDO.
// Se a resposta demora demais, o proxy/CDN à frente da API corta a conexão e
// devolve um 504 SEM cabeçalhos CORS — o navegador então descarta a resposta e
// mostra "Failed to fetch", sem qualquer erro legível. Por isso todo caminho
// externo E o registro no banco têm teto de tempo, e nada bloqueante acontece
// antes de responder ao navegador.

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');
const { salvarMensagemHistorico } = require('./whatsapp-shared');
const { registrarUso } = require('../services/assinaturaCalculo');
const { verificarLimite } = require('../services/limitesPlano');

/**
 * Partes cobradas pela operadora: GSM-7 = 160 caracteres (153 por parte quando
 * concatenado); com acento/emoji (UCS-2) = 70 (67 por parte).
 */
function contarPartesSms(texto) {
  const t = String(texto || '');
  const gsm = /^[A-Za-z0-9 @£$¥\n\r!"#%&'()*+,\-./:;<=>?_¡¿§¤ÄÖÑÜäöñüàèéùìòÇØøÅåÆæßÉ^{}\\[\]~|€]*$/.test(t);
  const unico = gsm ? 160 : 70;
  const parte = gsm ? 153 : 67;
  const tamanho = Array.from(t).length;
  return tamanho <= unico ? 1 : Math.ceil(tamanho / parte);
}

const SMSGO_BASE_URL_PADRAO = 'https://api.smsgo.com.br';

// ⭐ Marcador de versão deste arquivo. Aparece em /api/sms/disponivel e /api/sms/diag
// para provar QUAL código está de fato no ar (evita depurar um backend antigo).
const SMS_ROUTES_VERSAO = '2026-08-27-auth-get-token';

// ⭐ Sem SDK: falamos HTTP direto com a SMSGo (comprovado por curl em produção).
// Isso remove a dependência externa que fazia o envio morrer sem resposta.
let fetchCompat = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
if (!fetchCompat) {
  try {
    const nodeFetch = require('node-fetch');
    fetchCompat = (...args) => nodeFetch(...args);
    console.log('📲 [SMS] Usando node-fetch (Node sem fetch nativo)');
  } catch (e) {
    fetchCompat = null;
  }
}

function garantirTabelaSms(db) {
  return new Promise((resolve) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS sms_config (
        id VARCHAR(191) PRIMARY KEY,
        clinicaId VARCHAR(191) NOT NULL,
        provider VARCHAR(100) NOT NULL DEFAULT 'smsgo',
        baseUrl VARCHAR(500),
        apiKey TEXT,
        bearerToken TEXT,
        remetente VARCHAR(100),
        ativo TINYINT(1) DEFAULT 0,
        usarComoFallback TINYINT(1) DEFAULT 1,
        mensagemTemplate TEXT,
        atualizadoEm VARCHAR(50) NOT NULL
      )`,
      () => resolve()
    );
  });
}

/** SMSGO_API_KEY / SMSGO_BEARER_TOKEN / SMSGO_API_URL do server/.env.local */
function credenciaisSmsDoServidor() {
  return {
    apiKey: String(process.env.SMSGO_API_KEY || '').trim(),
    bearerToken: String(process.env.SMSGO_BEARER_TOKEN || '').trim(),
    baseUrl: String(process.env.SMSGO_API_URL || '').trim()
  };
}

async function buscarConfigSms(clinicaId) {
  const db = getClinicaDB(clinicaId);
  await garantirTabelaSms(db);
  const row = await new Promise((r) =>
  db.get('SELECT * FROM sms_config WHERE clinicaId = ?', [clinicaId], (err, found) =>
  r(err ? null : found || null)
  )
  );
  if (!row) return null;
  // ⭐ Credenciais FIXAS no server/.env.local (conta SMSGo da plataforma)
  // têm prioridade; o cadastro da clínica é só o plano B.
  const env = credenciaisSmsDoServidor();
  return {
    ...row,
    baseUrl: (env.baseUrl || row.baseUrl || SMSGO_BASE_URL_PADRAO).replace(/\/+$/, ''),
    apiKey: env.apiKey || String(row.apiKey || '').trim(),
    bearerToken: env.bearerToken || row.bearerToken || '',
    ativo: Boolean(row.ativo),
    usarComoFallback: row.usarComoFallback === null || row.usarComoFallback === undefined ?
    true :
    Boolean(row.usarComoFallback)
  };
}

// ⭐ Normaliza o telefone para o formato E.164 brasileiro (+55DDNNNNNNNNN)
function normalizarTelefone(telefone) {
  let numero = String(telefone || '').replace(/\D/g, '');
  if (!numero) return null;
  numero = numero.replace(/^0+/, '');
  if (!numero.startsWith('55')) numero = '55' + numero;
  // 55 + DDD (2) + 8 ou 9 dígitos
  if (numero.length < 12 || numero.length > 13) return null;
  return `+${numero}`;
}

// ⭐ Chamada HTTP direta à SMSGo, exatamente como o curl validado em produção:
//    POST /v1/sms/send/single  +  Authorization: Bearer <token>
//    Não usamos SDK: a chamada direta é comprovadamente funcional e não depende
//    de pacote externo (era o ponto onde o envio morria sem resposta).
// ⭐ TODA chamada externa tem teto de tempo. Sem isso, uma chamada pendurada
// deixa a requisição do navegador sem resposta até o proxy cortar a conexão —
// e o usuário vê "Failed to fetch" sem qualquer explicação.
// ⭐ Orçamento total: garante uma resposta ao navegador mesmo que algo interno
// fique pendurado (rede sem saída, pool do banco travado, DNS lento...).
function comOrcamento(promessa, ms, mensagem) {
  return new Promise((resolve) => {
    let encerrado = false;
    const timer = setTimeout(() => {
      if (encerrado) return;
      encerrado = true;
      resolve({ success: false, error: mensagem, timeout: true });
    }, ms);
    Promise.resolve(promessa).
    then((valor) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(timer);
      resolve(valor);
    }).
    catch((err) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(timer);
      resolve({ success: false, error: err?.message || 'Falha inesperada no envio.' });
    });
  });
}

async function fetchComTeto(url, opcoes = {}, ms = 8000) {
  if (!fetchCompat) {
    throw new Error('Servidor sem fetch disponível (use Node 18+ ou instale node-fetch).');
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), ms) : null;
  try {
    const resposta = await fetchCompat(url, {
      ...opcoes,
      signal: controller ? controller.signal : undefined
    });
    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch (e) {
      dados = null;
    }
    return { resposta, dados, texto };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function chamarSmsGo(config, caminho, { method = 'GET', body } = {}) {
  const url = `${config.baseUrl}${caminho}`;
  const executar = async (ignorarColado) => {
    const token = await obterToken(config, { ignorarColado });
    const { resposta, dados } = await fetchComTeto(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!resposta.ok) {
      const erro = new Error(
        dados?.message ||
        dados?.error ||
        `A SMSGo respondeu ${resposta.status} em ${caminho}`
      );
      erro.status = resposta.status;
      erro.dados = dados;
      throw erro;
    }
    return dados;
  };

  try {
    return await executar(false);
  } catch (err) {
    // Token colado no painel EXPIRA (48h). Se houver SMSGo-key, troca a chave
    // por um token novo e tenta uma única vez — antes, um token vencido
    // quebrava o envio até alguém colar outro manualmente.
    const podeRenovar =
    err?.status === 401 &&
    String(config.bearerToken || '').trim() &&
    String(config.apiKey || '').trim();
    if (!podeRenovar) throw err;
    console.log('📲 [SMSGo] Token do painel recusado (401) — renovando pela SMSGo-key...');
    return executar(true);
  }
}

// Cache de token por clínica
const tokensPorClinica = new Map();

// ⭐ Token Bearer: o colado no painel tem prioridade; senão troca a SMSGo-key.
async function obterToken(config, { ignorarColado = false } = {}) {
  const colado = String(config.bearerToken || '').trim();
  if (colado && !ignorarColado) return colado;

  const apiKey = String(config.apiKey || '').trim();
  if (!apiKey) throw new Error('Informe a SMSGo-key ou o token Bearer do painel.');

  const cache = tokensPorClinica.get(apiKey);
  if (cache && cache.expiraEm > Date.now() && !ignorarColado) return cache.token;
  if (ignorarColado) tokensPorClinica.delete(apiKey);

  // ⭐ A SMSGo autentica em GET /v1/auth/token, com a chave NO HEADER
  // ('SMSGo-key'). A resposta observada é { token: "oat_...", mode: "live" }.
  // O POST fica apenas como segunda tentativa, para não quebrar quem estiver
  // em uma versão anterior da API.
  const tentativas = [
  { method: 'GET', caminho: '/v1/auth/token' },
  { method: 'POST', caminho: '/v1/auth/token' }];

  let ultimoErro = null;
  for (const tentativa of tentativas) {
    try {
      // Com teto de tempo: era exatamente aqui que a chamada podia ficar
      // pendurada indefinidamente, derrubando a requisição do navegador.
      const opcoes = {
        method: tentativa.method,
        headers: {
          'SMSGo-key': apiKey,
          Accept: 'application/json'
        }
      };
      if (tentativa.method === 'POST') {
        opcoes.headers['Content-Type'] = 'application/json';
        opcoes.body = JSON.stringify({ key: apiKey });
      }
      const { resposta, dados } = await fetchComTeto(
        `${config.baseUrl}${tentativa.caminho}`,
        opcoes,
        6000
      );
      const token = dados?.token || dados?.accessToken || dados?.access_token;
      if (resposta.ok && token) {
        tokensPorClinica.set(apiKey, {
          token,
          // Token documentado como válido por 48h; renovamos em 40h.
          expiraEm: Date.now() + 40 * 60 * 60 * 1000
        });
        console.log(
          `📲 [SMSGo] Token obtido via ${tentativa.method} ${tentativa.caminho} (mode: ${dados?.mode || '?'})`
        );
        return token;
      }
      ultimoErro = new Error(
        dados?.message ||
        dados?.error ||
        `A SMSGo respondeu ${resposta.status} em ${tentativa.method} ${tentativa.caminho}`
      );
    } catch (err) {
      ultimoErro = err;
      // Se estourou o tempo, o problema é de REDE (saída HTTPS bloqueada) —
      // tentar o segundo endpoint só empilharia mais espera e levaria a
      // requisição do navegador a estourar o tempo do proxy.
      if (err?.name === 'AbortError') break;
    }
  }
  const detalhe =
  ultimoErro?.name === 'AbortError' ?
  'a SMSGo não respondeu à autenticação em 6s — o servidor da clínica provavelmente não tem saída HTTPS liberada para api.smsgo.com.br' :
  ultimoErro?.message || 'sem detalhe';
  throw new Error(
    `Não foi possível obter o token da SMSGo (${detalhe}). ` +
    'Como alternativa, cole o token Bearer do painel no campo correspondente.'
  );
}

// ⭐ Traduz a resposta da SMSGo numa mensagem acionável para a clínica
function descreverErro(err) {
  if (err?.name === 'AbortError') {
    return 'A SMSGo não respondeu no tempo limite. Verifique a saída HTTPS do servidor para api.smsgo.com.br (teste: /api/sms/diag).';
  }
  const status = err?.status;
  const codigo = err?.dados?.code || err?.code;
  if (status === 401 || codigo === 'unauthorized') {
    return 'Credencial da SMSGo inválida ou expirada. Cole novamente a chave ou o token do painel.';
  }
  if (status === 402 || codigo === 'insufficient_balance') return 'Saldo insuficiente na SMSGo.';
  if (status === 429 || codigo === 'rate_limited') {
    return 'Limite de envios da SMSGo atingido. Tente em instantes.';
  }
  const erros = err?.dados?.errors;
  if (Array.isArray(erros) && erros.length) {
    return `Dados rejeitados pela SMSGo — ${erros.map((e) => `${e.field}: ${e.message}`).join('; ')}`;
  }
  return err?.message || 'Falha ao falar com a SMSGo.';
}

// ⭐ Verifica se a clínica tem SMS pronto para uso (usado pela agenda)
async function smsDisponivel(clinicaId) {
  const config = await buscarConfigSms(clinicaId).catch(() => null);
  if (!config) return { disponivel: false, motivo: 'SMS não configurado' };
  if (!config.apiKey && !config.bearerToken) {
    return { disponivel: false, motivo: 'SMSGo-key não informada' };
  }
  if (!config.ativo) return { disponivel: false, motivo: 'Envio por SMS desativado' };
  return {
    disponivel: true,
    usarComoFallback: config.usarComoFallback,
    remetente: config.remetente || null,
    mensagemTemplate: config.mensagemTemplate || '',
    versao: SMS_ROUTES_VERSAO
  };
}

// ⭐ Envia um SMS pela SMSGo. Retorna { success, id?, status?, error? }
// NUNCA lança: qualquer falha volta como { success:false, error }. Se lançasse,
// o Express 4 não captura rejeições assíncronas — a requisição ficaria SEM
// resposta e o navegador mostraria "Failed to fetch" sem qualquer explicação.
async function enviarSms(clinicaId, telefone, mensagem) {
  let config = null;
  try {
    config = await buscarConfigSms(clinicaId);
  } catch (err) {
    return {
      success: false,
      error: `Não foi possível ler a configuração de SMS desta clínica: ${err.message}`
    };
  }
  if (!config) {
    return { success: false, error: 'SMS não configurado para esta clínica' };
  }
  if (!config.ativo) {
    return { success: false, error: 'Envio de SMS está desativado nas configurações' };
  }
  if (!config.apiKey && !config.bearerToken) {
    return { success: false, error: 'Informe a SMSGo-key ou o token Bearer nas configurações' };
  }

  const phone = normalizarTelefone(telefone);
  if (!phone) {
    return { success: false, error: `Telefone inválido para SMS: ${telefone}` };
  }
  const texto = String(mensagem || '').trim();
  if (!texto) {
    return { success: false, error: 'Mensagem vazia' };
  }

  const bloqueioPlano = await verificarLimite(clinicaId, 'sms');
  if (bloqueioPlano) {
    return { success: false, error: bloqueioPlano.error };
  }

  try {
    const params = { phone, message: texto };
    if (config.remetente) params.from = config.remetente;

    const resultado = await chamarSmsGo(config, '/v1/sms/send/single', {
      method: 'POST',
      body: params
    });
    console.log(
      `📲 ✅ [SMSGo] SMS enviado para ${phone} (id: ${resultado?.id || 's/ id'}, status: ${resultado?.status || '?'}${resultado?.test ? ', modo teste' : ''})`
    );
    // ⭐ Medição para a fatura da assinatura: cada envio real conta as partes
    // cobradas. Modo teste não é cobrado. Fora do caminho da resposta.
    if (!resultado?.test) {
      const partes = Number(resultado?.segments) || contarPartesSms(texto);
      registrarUso(clinicaId, 'sms', partes, resultado?.id || phone).catch(() => {});
    }
    return {
      success: true,
      id: resultado?.id || null,
      status: resultado?.status || 'queued',
      test: Boolean(resultado?.test)
    };
  } catch (err) {
    const descricao = descreverErro(err);
    console.error(`📲 ❌ [SMSGo] Envio falhou: ${descricao}`);
    return { success: false, error: descricao, status: err?.status };
  }
}

// ⭐ Histórico gravado FORA do caminho da resposta (nunca segura o navegador)
function registrarHistoricoSms({
  clinicaId,
  pacienteId,
  pacienteNome,
  consultaId,
  mensagem,
  resultado
}) {
  Promise.resolve().
  then(() =>
  salvarMensagemHistorico(
    clinicaId,
    pacienteId || null,
    pacienteNome || null,
    'enviada',
    `[SMS] ${mensagem}`,
    resultado.success ? 'enviada' : 'erro',
    resultado.success ? null : resultado.error,
    consultaId || null
  )
  ).
  catch((err) => {
    console.log(`📲 ⚠️ Histórico do SMS não salvo (não crítico): ${err.message}`);
  });
}

// ⭐⭐⭐ ACEITA CORPO COMO text/plain ⭐⭐⭐
// Um POST com Content-Type: application/json obriga o navegador a fazer antes
// uma requisição OPTIONS (preflight CORS). Se o proxy/CDN à frente da API não
// repassar OPTIONS, o navegador aborta ANTES de enviar o POST e mostra
// "Failed to fetch" — sem nada chegar ao servidor e sem erro legível.
// Com Content-Type: text/plain o POST é uma "requisição simples": não há
// preflight, então esse bloqueio deixa de existir. Aqui só interpretamos o
// corpo; quem envia application/json continua funcionando como antes.
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

// ==================== ROTAS ====================

// GET /api/sms/disponivel — a agenda usa para decidir se oferece o envio por SMS
router.get('/disponivel', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  try {
    res.json(await smsDisponivel(clinicaId));
  } catch (err) {
    res.status(500).json({ disponivel: false, motivo: err.message });
  }
});

// POST /api/sms/send-message — envia um SMS e registra no histórico
router.post('/send-message', async (req, res) => {
  const { clinicaId, telefone, mensagem, pacienteId, pacienteNome, consultaId } = req.body;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!telefone) return res.status(400).json({ error: 'telefone é obrigatório' });
  if (!mensagem) return res.status(400).json({ error: 'mensagem é obrigatória' });

  console.log(`\n📲 POST /api/sms/send-message — clínica ${clinicaId}, tel ${telefone}`);

  // Orçamento total de 14s: o navegador SEMPRE recebe resposta antes de qualquer
  // proxy cortar a conexão (que é o que produzia "Failed to fetch").
  const resultado = await comOrcamento(
    enviarSms(clinicaId, telefone, mensagem),
    14000,
    'O envio não retornou em 14s. Verifique se o servidor da clínica tem saída HTTPS para api.smsgo.com.br (teste: /api/sms/diag).'
  );

  // Responde ANTES de gravar o histórico: a escrita no banco não pode segurar
  // a resposta (um pool travado deixaria a requisição sem retorno).
  if (!resultado.success) {
    res.status(502).json({ error: resultado.error });
  } else {
    res.json(resultado);
  }

  registrarHistoricoSms({
    clinicaId,
    pacienteId,
    pacienteNome,
    consultaId,
    mensagem,
    resultado
  });
});

// ⭐⭐⭐ GET /api/sms/send-message — MESMO envio, por GET ⭐⭐⭐
// Existe porque há ambientes onde o proxy/CDN à frente da API bloqueia o POST
// nesta rota (a resposta de bloqueio não tem cabeçalhos CORS, então o navegador
// só consegue dizer "Failed to fetch"). O GET simples passa. Não é elegante,
// mas garante o aviso ao paciente enquanto a regra do proxy é ajustada.
router.get('/send-message', async (req, res) => {
  const { clinicaId, telefone, mensagem, pacienteId, pacienteNome, consultaId } = req.query;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!telefone) return res.status(400).json({ error: 'telefone é obrigatório' });
  if (!mensagem) return res.status(400).json({ error: 'mensagem é obrigatória' });

  console.log(`\n📲 GET /api/sms/send-message (alternativa ao POST) — clínica ${clinicaId}`);

  const resultado = await comOrcamento(
    enviarSms(clinicaId, telefone, mensagem),
    14000,
    'O envio não retornou em 14s. Verifique se o servidor tem saída HTTPS para api.smsgo.com.br (teste: /api/sms/diag).'
  );

  if (!resultado.success) {
    res.status(502).json({ error: resultado.error });
  } else {
    res.json({ ...resultado, via: 'GET' });
  }

  registrarHistoricoSms({
    clinicaId,
    pacienteId,
    pacienteNome,
    consultaId,
    mensagem,
    resultado
  });
});

// GET /api/sms/testar — mesma alternativa para o teste das configurações
router.get('/testar', async (req, res) => {
  const { clinicaId, telefone } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!telefone) return res.status(400).json({ error: 'telefone é obrigatório' });

  const resultado = await comOrcamento(
    enviarSms(
      clinicaId,
      telefone,
      'Teste de configuracao de SMS. Se voce recebeu esta mensagem, a integracao esta funcionando.'
    ),
    14000,
    'O teste não retornou em 14s. Verifique a saída HTTPS do servidor (teste: /api/sms/diag).'
  );

  if (!resultado.success) return res.status(502).json({ error: resultado.error });
  res.json({ ...resultado, via: 'GET' });
});

// GET /api/sms/saldo — consulta o saldo da conta SMSGo
router.get('/saldo', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  try {
    const config = await buscarConfigSms(clinicaId);
    if (!config) return res.status(404).json({ error: 'SMS não configurado' });
    if (!config.apiKey && !config.bearerToken) {
      return res.status(400).json({ error: 'Informe a SMSGo-key ou o token Bearer' });
    }

    const dados = await comOrcamento(
      chamarSmsGo(config, '/v1/account/balance'),
      14000,
      'A consulta de saldo não retornou em 14s. Verifique a saída HTTPS do servidor (teste: /api/sms/diag).'
    );
    if (dados && dados.success === false) {
      return res.status(502).json({ error: dados.error });
    }
    res.json({
      balance: dados?.balance ?? null,
      currency: dados?.currency || 'BRL',
      company: dados?.company?.name || null
    });
  } catch (err) {
    res.status(502).json({ error: descreverErro(err) });
  }
});

// GET /api/sms/diag — diagnóstico objetivo, sem expor segredos.
// Responde em segundos e diz exatamente onde o SMS está parando: configuração,
// saída de rede do servidor ou credencial recusada pela SMSGo.
router.get('/diag', async (req, res) => {
  const { clinicaId } = req.query;
  const diag = {
    rota: 'ok',
    versao: SMS_ROUTES_VERSAO,
    node: process.version,
    fetch: fetchCompat ? 'disponível' : 'INDISPONÍVEL',
    clinicaId: clinicaId || null,
    config: null,
    egresso: null,
    autenticacao: null
  };

  if (!clinicaId) {
    diag.config = 'informe ?clinicaId=... para checar a configuração';
    return res.json(diag);
  }

  try {
    const config = await comOrcamento(
      buscarConfigSms(clinicaId),
      6000,
      'A leitura da configuração no banco não retornou em 6s.'
    );
    if (config && config.success === false) {
      diag.config = config.error;
      return res.json(diag);
    }
    if (!config) {
      diag.config = 'SMS não configurado para esta clínica';
      return res.json(diag);
    }
    diag.config = {
      baseUrl: config.baseUrl,
      ativo: config.ativo,
      usarComoFallback: config.usarComoFallback,
      temApiKey: Boolean(config.apiKey),
      temTokenColado: Boolean(String(config.bearerToken || '').trim()),
      remetente: config.remetente || null
    };

    // Teste de saída de rede: só verifica se o host responde algo
    const iniciado = Date.now();
    try {
      const { resposta } = await fetchComTeto(config.baseUrl, { method: 'GET' }, 6000);
      diag.egresso = `ok — ${config.baseUrl} respondeu ${resposta.status} em ${Date.now() - iniciado}ms`;
    } catch (err) {
      diag.egresso =
      err?.name === 'AbortError' ?
      `BLOQUEADO — ${config.baseUrl} não respondeu em 6s. Libere a saída HTTPS do servidor para este host.` :
      `FALHOU — ${err.message}`;
      return res.json(diag);
    }

    // Teste de credencial
    try {
      const token = await comOrcamento(
        obterToken(config, { ignorarColado: false }),
        8000,
        'A autenticação não retornou em 8s.'
      );
      if (token && token.success === false) {
        diag.autenticacao = token.error;
      } else {
        diag.autenticacao = `ok — token obtido (${String(token).slice(0, 8)}...)`;
      }
    } catch (err) {
      diag.autenticacao = `FALHOU — ${descreverErro(err)}`;
    }
    res.json(diag);
  } catch (err) {
    diag.erro = err.message;
    res.json(diag);
  }
});

// POST /api/sms/testar — envia uma mensagem de teste para validar as credenciais
router.post('/testar', async (req, res) => {
  const { clinicaId, telefone } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!telefone) return res.status(400).json({ error: 'telefone é obrigatório' });

  const resultado = await comOrcamento(
    enviarSms(
      clinicaId,
      telefone,
      'Teste de configuracao de SMS. Se voce recebeu esta mensagem, a integracao esta funcionando.'
    ),
    14000,
    'O teste não retornou em 14s. Verifique se o servidor da clínica tem saída HTTPS para api.smsgo.com.br (teste: /api/sms/diag).'
  );

  if (!resultado.success) {
    return res.status(502).json({ error: resultado.error });
  }
  res.json(resultado);
});

module.exports = router;
module.exports.enviarSms = enviarSms;
module.exports.buscarConfigSms = buscarConfigSms;
module.exports.smsDisponivel = smsDisponivel;
module.exports.normalizarTelefone = normalizarTelefone;