// ==================== AUTENTICAÇÃO DA API ====================
// Antes, o login devolvia `token: 'dummy-token'` e TODAS as rotas confiavam no
// `clinicaId` e no `usuarioId` enviados pelo navegador: quem soubesse o id de
// uma clínica lia os pacientes dela sem entrar no sistema.
//
// Agora:
//   • o login emite um token aleatório (256 bits); o banco guarda só o SHA-256;
//   • todo /api exige esse token, exceto as rotas públicas listadas abaixo
//     (login, webhooks, páginas que o paciente abre sem conta);
//   • o token chega por `Authorization: Bearer <token>` — ou, apenas em GET,
//     pelo parâmetro `?_auth=` (EventSource) ou pelo cookie `easyclin_token`
//     (imagens, downloads e links abertos direto pelo navegador);
//   • quem pede dados de uma clínica precisa ter acesso a ela: super admin vê
//     todas; os demais, as clínicas da própria operadora.
//
// AUTH_MODE=log (no .env.local) deixa passar tudo e só registra no log o que
// SERIA bloqueado — útil para conferir uma instalação antes de ligar de vez.
// O padrão é `enforce`.

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const dbGlobal = require('../databaseGlobal');

const MODO = String(process.env.AUTH_MODE || 'enforce').toLowerCase() === 'log' ? 'log' : 'enforce';
const VALIDADE_DIAS = Math.max(1, parseInt(process.env.AUTH_TOKEN_DIAS || '30', 10) || 30);
const COOKIE = 'easyclin_token';
const PARAM_QUERY = '_auth';

const contexto = new AsyncLocalStorage();

// ==================== TABELA ====================
let tabelaPronta = null;
function garantirTabela() {
  if (!tabelaPronta) {
    tabelaPronta = dbGlobal.prepare(`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        tokenHash CHAR(64) PRIMARY KEY,
        usuarioId VARCHAR(191) NOT NULL,
        criadoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ultimoUsoEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expiraEm DATETIME NOT NULL,
        ip VARCHAR(100),
        userAgent VARCHAR(255),
        revogadoEm DATETIME NULL,
        INDEX idx_auth_tokens_usuario (usuarioId)
      )`).run().catch((err) => {
      tabelaPronta = null;
      throw err;
    });
  }
  return tabelaPronta;
}

const hash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 100);
}

// ==================== EMISSÃO / REVOGAÇÃO ====================
async function emitirToken(usuarioId, req) {
  await garantirTabela();
  const token = crypto.randomBytes(32).toString('hex');
  await dbGlobal.prepare(
    `INSERT INTO auth_tokens (tokenHash, usuarioId, expiraEm, ip, userAgent)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?)`
  ).run(hash(token), usuarioId, VALIDADE_DIAS, ipDe(req), String(req.headers['user-agent'] || '').slice(0, 255));
  return token;
}

async function revogarToken(token) {
  if (!token) return;
  await garantirTabela();
  const h = hash(token);
  cacheTokens.delete(h);
  await dbGlobal.prepare('UPDATE auth_tokens SET revogadoEm = NOW() WHERE tokenHash = ? AND revogadoEm IS NULL').run(h);
}

/** Encerra as sessões de um usuário (ex.: troca de senha, desativação). */
async function revogarTokensDoUsuario(usuarioId, tokenMantido = null) {
  if (!usuarioId) return;
  await garantirTabela();
  const manter = tokenMantido ? hash(tokenMantido) : '';
  for (const [h, item] of cacheTokens) {
    if (item.usuario && item.usuario.id === usuarioId && h !== manter) cacheTokens.delete(h);
  }
  await dbGlobal.prepare(
    'UPDATE auth_tokens SET revogadoEm = NOW() WHERE usuarioId = ? AND revogadoEm IS NULL AND tokenHash <> ?'
  ).run(usuarioId, manter);
}

/** Esquece o usuário em cache (dados mudaram: tipo, operadora, ativo...). */
function esquecerUsuario(usuarioId) {
  for (const [h, item] of cacheTokens) {
    if (item.usuario && item.usuario.id === usuarioId) cacheTokens.delete(h);
  }
}

// ==================== RESOLUÇÃO DO TOKEN ====================
// Cache curto: evita uma consulta ao banco por requisição. Mudanças de
// tipo/operadora/ativo valem em até 60 s (ou na hora, via esquecerUsuario).
const cacheTokens = new Map(); // hash -> { usuario, ate, renovadoEm }
const CACHE_MS = 60 * 1000;
const RENOVAR_MS = 10 * 60 * 1000;

async function usuarioDoToken(token) {
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const h = hash(token);
  const agora = Date.now();
  const emCache = cacheTokens.get(h);
  if (emCache && emCache.ate > agora) return emCache.usuario;

  await garantirTabela();
  const row = await dbGlobal.prepare(
    `SELECT u.id, u.nome, u.email, u.tipo, u.operadoraId, u.clinicaId, u.clinicaPadraoId,
            u.operadoraPadraoId, u.ativo
       FROM auth_tokens t JOIN usuarios u ON u.id = t.usuarioId
      WHERE t.tokenHash = ? AND t.revogadoEm IS NULL AND t.expiraEm > NOW()`
  ).get(h);
  if (!row || !Number(row.ativo)) {
    cacheTokens.delete(h);
    return null;
  }
  const usuario = { ...row, ativo: true };

  // Validade deslizante: quem usa o sistema todo dia não é deslogado.
  const renovadoEm = emCache ? emCache.renovadoEm : 0;
  if (agora - renovadoEm > RENOVAR_MS) {
    dbGlobal.prepare(
      'UPDATE auth_tokens SET ultimoUsoEm = NOW(), expiraEm = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE tokenHash = ?'
    ).run(VALIDADE_DIAS, h).catch(() => {});
  }
  cacheTokens.set(h, { usuario, ate: agora + CACHE_MS, renovadoEm: agora - renovadoEm > RENOVAR_MS ? agora : renovadoEm });
  if (cacheTokens.size > 5000) cacheTokens.delete(cacheTokens.keys().next().value);
  return usuario;
}

// ==================== ACESSO ÀS CLÍNICAS ====================
let mapaClinicas = new Map(); // id -> operadoraId
let clinicasAte = 0;
let recarregando = null;
let ultimaRecargaForcada = 0;

async function carregarClinicas(forcar = false) {
  const agora = Date.now();
  if (!forcar && clinicasAte > agora) return mapaClinicas;
  if (forcar && agora - ultimaRecargaForcada < 3000) return mapaClinicas;
  if (forcar) ultimaRecargaForcada = agora;
  if (!recarregando) {
    recarregando = dbGlobal.prepare('SELECT id, operadoraId FROM clinicas').all().
    then((rows) => {
      mapaClinicas = new Map(rows.map((r) => [String(r.id), r.operadoraId ? String(r.operadoraId) : null]));
      clinicasAte = Date.now() + 60 * 1000;
      return mapaClinicas;
    }).
    finally(() => {recarregando = null;});
  }
  return recarregando;
}

function esquecerClinicas() {
  clinicasAte = 0;
}

async function podeAcessarClinica(usuario, clinicaId) {
  if (!usuario) return false;
  if (usuario.tipo === 'super_admin') return true;
  const id = String(clinicaId || '').trim();
  if (!id) return true;
  if (id === String(usuario.clinicaId || '') || id === String(usuario.clinicaPadraoId || '')) return true;
  let mapa = await carregarClinicas();
  if (!mapa.has(id)) mapa = await carregarClinicas(true);
  const operadoraDaClinica = mapa.get(id);
  return Boolean(operadoraDaClinica && usuario.operadoraId && operadoraDaClinica === String(usuario.operadoraId));
}

/** Todos os valores de clinicaId que a requisição traz (query, corpo, cabeçalho, caminho). */
async function clinicasPedidas(req) {
  const ids = new Set();
  const adicionar = (v) => {
    if (Array.isArray(v)) v.forEach(adicionar);else
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v).trim();
      if (s && s !== 'undefined' && s !== 'null') ids.add(s);
    }
  };
  for (const fonte of [req.query, req.body]) {
    if (fonte && typeof fonte === 'object') {
      adicionar(fonte.clinicaId);
      adicionar(fonte.atorClinicaId);
      adicionar(fonte.clinicaIds);
    }
  }
  adicionar(req.get('x-clinica-id'));
  // Ids de clínica no próprio caminho (ex.: /api/livekit/paciente/:clinicaId/...)
  // Qualquer segmento que seja o id de uma clínica cadastrada conta.
  const segmentos = String(req.path || '').split('/').filter(Boolean).map((s) => {
    try {return decodeURIComponent(s);} catch (e) {return s;}
  });
  if (segmentos.length) {
    const mapa = await carregarClinicas();
    segmentos.forEach((s) => {if (mapa.has(s)) ids.add(s);});
  }
  return [...ids];
}

/** Primeiro clinicaId sem acesso, ou null se tudo certo. */
async function clinicaNegada(usuario, req) {
  for (const id of await clinicasPedidas(req)) {
    if (!(await podeAcessarClinica(usuario, id))) return id;
  }
  return null;
}

// ==================== ROTAS PÚBLICAS ====================
// [métodos, padrão do caminho a partir de /api]. Mantenha a lista CURTA:
// tudo o que não está aqui exige login.
const PUBLICAS = [
// Saúde do servidor
[['GET'], /^\/(health|version)\/?$/],
[['GET'], /^\/diagnostico\/health\/?$/],
// Login, duas etapas e criação de conta
[['POST'], /^\/auth\/(login|login\/verificar|login\/reenviar|cadastro|logout)\/?$/],
[['GET'], /^\/auth\/cadastro\/cnpj\/[^/]+\/?$/],
// Instaladores (PrintServer, leitor biométrico)
[['GET'], /^\/downloads\/(arquivo\/[^/]+|listar)\/?$/],
// Webhooks de serviços externos (WAHA, Meta, Mercado Pago, Itaú)
[['GET', 'POST'], /^\/webhook\/whatsapp\/?$/],
[['POST'], /^\/whatsapp\/webhook\/?$/],
[['GET', 'POST'], /^\/whatsapp-meta\/webhook\/?$/],
[['GET'], /^\/whatsapp-meta\/receber-diag\/?$/],
[['POST'], /^\/assinatura\/webhook\/mercadopago\/?$/],
[['POST'], /^\/boletos-itau\/webhook\/?$/],
// Páginas que o paciente abre sem conta
[['GET'], /^\/whatsapp-meta\/(logo\/[^/]+|falar\/[^/]+)\/?$/],
[['GET'], /^\/confirmacao\/[^/]+\/?$/],
[['POST'], /^\/confirmacao\/[^/]+\/responder\/?$/],
[['GET'], /^\/assinaturas\/[^/]+\/?$/], // /:token e /version
[['POST'], /^\/assinaturas\/[^/]+\/assinar\/?$/],
[['GET'], /^\/livekit\/(status|paciente\/[^/]+\/[^/]+)\/?$/],
[['GET'], /^\/video\/bbb\/status\/?$/]];


function ehPublica(req) {
  const caminho = req.path;
  const metodo = req.method === 'HEAD' ? 'GET' : req.method;
  if (PUBLICAS.some(([metodos, re]) => metodos.includes(metodo) && re.test(caminho))) return true;
  // Sala BBB: o paciente entra pelo link (papel "attendee"); só o moderador
  // (profissional) precisa estar logado.
  if (metodo === 'GET' && /^\/video\/bbb\/join\/?$/.test(caminho) && req.query.role !== 'moderator') return true;
  return false;
}

// ==================== EXTRAÇÃO DO TOKEN ====================
function lerCookie(req, nome) {
  const bruto = String(req.headers.cookie || '');
  for (const parte of bruto.split(';')) {
    const i = parte.indexOf('=');
    if (i > -1 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

function tokenDaRequisicao(req) {
  const auth = String(req.headers.authorization || '');
  if (/^Bearer\s+/i.test(auth)) {
    const t = auth.replace(/^Bearer\s+/i, '').trim();
    if (t && t !== 'dummy-token') return t;
  }
  // Query e cookie só valem para leitura: o navegador os envia sozinho em
  // <img>, links e EventSource, mas nunca podem autorizar uma gravação (CSRF).
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (req.query && typeof req.query[PARAM_QUERY] === 'string') return req.query[PARAM_QUERY];
    const c = lerCookie(req, COOKIE);
    if (c) return c;
  }
  return null;
}

function definirCookie(req, res, token) {
  const https = req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
  const partes = [
  `${COOKIE}=${token ? encodeURIComponent(token) : ''}`,
  'Path=/',
  'HttpOnly',
  'SameSite=Strict',
  `Max-Age=${token ? VALIDADE_DIAS * 86400 : 0}`];

  if (https) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

// ==================== MIDDLEWARE ====================
function negar(req, res, status, mensagem, codigo) {
  if (MODO === 'log') {
    console.warn(`🔓 [AUTH:log] ${req.method} ${req.originalUrl.split('?')[0]} seria bloqueado (${status} ${codigo})`);
    return false;
  }
  res.status(status).json({ error: mensagem, codigo });
  return true;
}

/**
 * Lê corpos text/plain como JSON antes de conferir o clinicaId (algumas telas
 * mandam POST como text/plain para evitar o preflight). Mesmo comportamento
 * de lerCorpoTexto em services/superAdmin.js.
 */
function lerCorpoTextoSeNecessario(req) {
  return new Promise((resolve) => {
    const tipo = String(req.headers['content-type'] || '');
    if (!tipo.includes('text/plain') || req.body && Object.keys(req.body).length) return resolve();
    let bruto = '';
    req.setEncoding('utf8');
    req.on('data', (parte) => {
      bruto += parte;
      if (bruto.length > 2 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {req.body = bruto ? JSON.parse(bruto) : {};} catch (e) {req.body = {};}
      resolve();
    });
    req.on('error', () => resolve());
  });
}

async function middleware(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  try {
    const token = tokenDaRequisicao(req);
    const usuario = token ? await usuarioDoToken(token) : null;
    if (usuario) {
      req.usuario = usuario;
      req.authToken = token;
    }
    if (req.query && req.query[PARAM_QUERY] !== undefined) delete req.query[PARAM_QUERY];

    if (ehPublica(req)) return next();

    if (!usuario) {
      if (negar(req, res, 401, 'Sessão expirada ou inválida. Entre novamente.', 'NAO_AUTENTICADO')) return;
      return next();
    }

    await lerCorpoTextoSeNecessario(req);
    const negada = await clinicaNegada(usuario, req);
    if (negada) {
      console.warn(`🚫 [AUTH] ${usuario.email} (${usuario.tipo}) tentou acessar a clínica ${negada}: ${req.method} ${req.originalUrl.split('?')[0]}`);
      if (negar(req, res, 403, 'Você não tem acesso a esta clínica.', 'CLINICA_NEGADA')) return;
    }

    const regra = await regraDeEntidadesGlobais(req, usuario);
    if (regra) {
      if (negar(req, res, regra.status, regra.mensagem, 'SEM_PERMISSAO')) return;
    }

    contexto.run({ usuario }, next);
  } catch (err) {
    console.error('🔐 ❌ [AUTH] Falha ao validar a sessão:', err.message);
    res.status(503).json({ error: 'Não foi possível validar a sessão agora. Tente novamente.', codigo: 'AUTH_INDISPONIVEL' });
  }
}

// ==================== OPERADORAS, CLÍNICAS, USUÁRIOS, PLANOS ====================
// Estas tabelas ficam no banco GLOBAL e são de todas as operadoras: sem estas
// regras, qualquer usuário logado listaria os usuários de outras operadoras,
// promoveria a si mesmo a super admin ou mudaria o plano de uma clínica.
const CAMPOS_PRIVILEGIADOS = ['tipo', 'operadoraId', 'clinicaId', 'ativo', 'permissoesMenu', 'prontuarioTotal'];

async function regraDeEntidadesGlobais(req, usuario) {
  if (usuario.tipo === 'super_admin') return null;
  const caminho = req.path.replace(/\/+$/, '');
  const metodo = req.method;
  const leitura = metodo === 'GET' || metodo === 'HEAD';
  const minhaOperadora = String(usuario.operadoraId || '');
  const ehAdmin = usuario.tipo === 'admin';
  const proibido = (mensagem) => ({ status: 403, mensagem });

  // Configurações globais e planos do sistema: só leitura fora do super admin
  if (!leitura && /^\/(configuracoes-globais|planos)(\/|$)/.test(caminho)) {
    return proibido('Somente o super administrador pode alterar isto.');
  }
  if (!leitura && /^\/clinicas\/[^/]+\/plano$/.test(caminho)) {
    return proibido('Somente o super administrador pode trocar o plano de uma clínica.');
  }

  // ---------- Operadoras ----------
  if (/^\/operadoras(\/|$)/.test(caminho)) {
    if (/^\/operadoras\/consulta-cnpj\//.test(caminho)) return null;
    if (!leitura) return proibido('Somente o super administrador pode alterar operadoras.');
    filtrarResposta(res(req), (item) => item && String(item.id) === minhaOperadora);
    return null;
  }

  // ---------- Clínicas ----------
  if (/^\/clinicas(\/|$)/.test(caminho)) {
    if (leitura) {
      filtrarResposta(res(req), (item) => item && String(item.operadoraId || '') === minhaOperadora);
      return null;
    }
    if (!ehAdmin) return proibido('Somente o administrador pode alterar clínicas.');
    if (metodo === 'POST' && caminho === '/clinicas') {
      if (req.body && req.body.operadoraId && String(req.body.operadoraId) !== minhaOperadora) {
        return proibido('Você só pode criar clínicas na sua operadora.');
      }
      if (req.body) req.body.operadoraId = minhaOperadora;
      esquecerClinicas();
      return null;
    }
    const alvo = caminho.split('/')[2];
    const mapa = await carregarClinicas(true);
    if (!alvo || mapa.get(alvo) !== minhaOperadora) return proibido('Esta clínica não pertence à sua operadora.');
    if (req.body && req.body.operadoraId && String(req.body.operadoraId) !== minhaOperadora) {
      return proibido('Não é possível mover a clínica para outra operadora.');
    }
    esquecerClinicas();
    return null;
  }

  // ---------- Usuários ----------
  if (/^\/usuarios(\/|$)/.test(caminho)) {
    if (leitura) {
      if (req.query.operadoraId && String(req.query.operadoraId) !== minhaOperadora) {
        return proibido('Você só pode ver usuários da sua operadora.');
      }
      filtrarResposta(res(req), (item) =>
      item && (String(item.operadoraId || '') === minhaOperadora || item.id === usuario.id)
      );
      return null;
    }

    const alvoId = caminho.split('/')[2] || null;
    const proprio = alvoId && alvoId === usuario.id;

    if (metodo === 'POST' && !alvoId) {
      if (!ehAdmin) return proibido('Somente o administrador pode cadastrar usuários.');
      const b = req.body || {};
      if (b.tipo === 'super_admin') return proibido('Você não pode criar um super administrador.');
      if (b.operadoraId && String(b.operadoraId) !== minhaOperadora) return proibido('Você só pode criar usuários na sua operadora.');
      b.operadoraId = minhaOperadora;
      if (b.clinicaId && !(await podeAcessarClinica(usuario, b.clinicaId))) return proibido('Clínica fora da sua operadora.');
      return null;
    }

    if (!alvoId) return proibido('Operação não permitida.');
    const alvo = await dbGlobal.prepare('SELECT id, tipo, operadoraId, clinicaId, ativo, permissoesMenu, prontuarioTotal FROM usuarios WHERE id = ?').get(alvoId);
    if (!alvo) return null; // a rota responde 404

    if (proprio && !ehAdmin) {
      // Pode editar o próprio cadastro (foto, nome, senha, duas etapas),
      // mas não o próprio perfil de acesso.
      if (metodo === 'DELETE') return proibido('Você não pode excluir o próprio usuário.');
      if (metodo === 'PUT' && caminho === `/usuarios/${alvoId}` && req.body) {
        req.body.tipo = alvo.tipo;
        req.body.operadoraId = alvo.operadoraId;
        req.body.clinicaId = alvo.clinicaId;
        req.body.ativo = Boolean(Number(alvo.ativo));
        req.body.prontuarioTotal = Boolean(Number(alvo.prontuarioTotal));
        let perms = null;
        try {perms = alvo.permissoesMenu ? JSON.parse(alvo.permissoesMenu) : null;} catch (e) {perms = null;}
        req.body.permissoesMenu = perms;
      }
      return null;
    }

    if (!ehAdmin) return proibido('Somente o administrador pode alterar outros usuários.');
    if (alvo.tipo === 'super_admin') return proibido('Você não pode alterar um super administrador.');
    if (String(alvo.operadoraId || '') !== minhaOperadora) return proibido('Este usuário não pertence à sua operadora.');
    const b = req.body || {};
    if (b.tipo === 'super_admin') return proibido('Você não pode promover alguém a super administrador.');
    if (b.operadoraId && String(b.operadoraId) !== minhaOperadora) return proibido('Não é possível mover o usuário para outra operadora.');
    if (b.clinicaId && !(await podeAcessarClinica(usuario, b.clinicaId))) return proibido('Clínica fora da sua operadora.');
    if (proprio && metodo === 'PUT' && b.tipo && b.tipo !== alvo.tipo) return proibido('Você não pode mudar o próprio perfil.');
    esquecerUsuario(alvoId);
    return null;
  }

  return null;
}

// Guarda a resposta para o filtro (o middleware ainda não tem acesso a `res`
// dentro de regraDeEntidadesGlobais sem mudar a assinatura).
const RES = Symbol('res');
function res(req) {return req[RES];}

/** Remove da resposta JSON os itens fora do escopo; objeto único fora → 403. */
function filtrarResposta(resposta, permitido) {
  if (!resposta || resposta.__filtroAuth) return;
  resposta.__filtroAuth = true;
  const original = resposta.json.bind(resposta);
  resposta.json = (corpo) => {
    if (resposta.statusCode >= 400) return original(corpo);
    if (Array.isArray(corpo)) return original(corpo.filter(permitido));
    if (corpo && typeof corpo === 'object') {
      for (const chave of ['usuarios', 'clinicas', 'operadoras', 'data', 'items']) {
        if (Array.isArray(corpo[chave])) return original({ ...corpo, [chave]: corpo[chave].filter(permitido) });
      }
      if (('id' in corpo) && !permitido(corpo)) {
        resposta.status(403);
        return original({ error: 'Sem acesso a este registro.', codigo: 'SEM_PERMISSAO' });
      }
    }
    return original(corpo);
  };
}

function middlewareComRes(req, resposta, next) {
  req[RES] = resposta;
  return middleware(req, resposta, next);
}

// ==================== GUARDA NO ACESSO AO BANCO ====================
// Defesa em profundidade: se alguma rota abrir o banco de uma clínica que não
// veio por query/corpo/caminho (e por isso escapou do middleware), fica
// registrado no log.
const avisados = new Set();
function registrarAcessoClinica(clinicaId) {
  const ctx = contexto.getStore();
  if (!ctx || !ctx.usuario || ctx.usuario.tipo === 'super_admin') return;
  podeAcessarClinica(ctx.usuario, clinicaId).then((ok) => {
    const chave = `${ctx.usuario.id}:${clinicaId}`;
    if (!ok && !avisados.has(chave)) {
      avisados.add(chave);
      console.warn(`🚫 [AUTH] Banco da clínica ${clinicaId} aberto numa requisição de ${ctx.usuario.email}, que não tem acesso a ela. Revise a rota.`);
    }
  }).catch(() => {});
}

module.exports = {
  MODO,
  middleware: middlewareComRes,
  emitirToken,
  revogarToken,
  revogarTokensDoUsuario,
  esquecerUsuario,
  esquecerClinicas,
  usuarioDoToken,
  tokenDaRequisicao,
  definirCookie,
  podeAcessarClinica,
  registrarAcessoClinica,
  garantirTabela
};
