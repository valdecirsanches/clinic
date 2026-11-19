// ==================== CONFIRMAÇÃO DE E-MAIL E CELULAR NO CADASTRO ====================
// Quem cria uma conta nova recebe um código de 6 dígitos no e-mail e outro no
// celular (WhatsApp ou SMS). Só depois de confirmar os dois a conta é criada.
//
// Configuração no .env.local do servidor (ver src/.env.example, bloco
// "Cadastro de conta nova"):
//   CADASTRO_CONFIRMAR_EMAIL=1        0 = não pede código no e-mail
//   CADASTRO_CONFIRMAR_CELULAR=1      0 = não pede código no celular
//   CADASTRO_CELULAR_CANAL=auto       whatsapp | sms | auto (WhatsApp e, se falhar, SMS)
//   CADASTRO_WAHA_SESSION=            sessão do WAHA (padrão: WAHA_2FA_SESSION ou edssolution)
//   CADASTRO_CODIGO_NO_LOG=0          1 = escreve o código no log (só para testes!)
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
//   SMSGO_API_KEY / SMSGO_BEARER_TOKEN / SMSGO_API_URL / SMSGO_REMETENTE
//
// Como no login em duas etapas, o código não é guardado: só o hash. Depois de
// confirmado, o navegador recebe um "comprovante" (também guardado só como
// hash) que o POST /api/auth/cadastro exige junto com o mesmo e-mail/celular.

const crypto = require('crypto');
const dbGlobal = require('../databaseGlobal');

const VALIDADE_CODIGO_MS = 10 * 60 * 1000;
const VALIDADE_COMPROVANTE_MS = 60 * 60 * 1000;
const MAX_TENTATIVAS = 5;
const INTERVALO_REENVIO_MS = 60 * 1000;
const MAX_ENVIOS_POR_DESTINO_HORA = 5;

let tabelaPronta = false;

function erro(status, mensagem, codigo) {
  const e = new Error(mensagem);
  e.status = status;
  if (codigo) e.codigo = codigo;
  return e;
}

function ligado(nome, padrao = true) {
  const v = String(process.env[nome] ?? '').trim().toLowerCase();
  if (!v) return padrao;
  return !['0', 'false', 'nao', 'não', 'off', 'no'].includes(v);
}

/** O que a tela precisa saber para montar as etapas */
function configuracao() {
  const canal = String(process.env.CADASTRO_CELULAR_CANAL || 'auto').trim().toLowerCase();
  return {
    confirmarEmail: ligado('CADASTRO_CONFIRMAR_EMAIL'),
    confirmarCelular: ligado('CADASTRO_CONFIRMAR_CELULAR'),
    canalCelular: ['whatsapp', 'sms'].includes(canal) ? canal : 'auto'
  };
}

async function garantirTabela() {
  if (tabelaPronta) return;
  await dbGlobal.exec(`CREATE TABLE IF NOT EXISTS cadastro_verificacoes (
    id VARCHAR(64) PRIMARY KEY,
    canal VARCHAR(10) NOT NULL,
    destino VARCHAR(255) NOT NULL,
    codigoHash VARCHAR(128) NOT NULL,
    expiraEm BIGINT NOT NULL,
    tentativas INT NOT NULL DEFAULT 0,
    enviadoEm BIGINT NOT NULL,
    envios INT NOT NULL DEFAULT 1,
    ip VARCHAR(64),
    comprovanteHash VARCHAR(128),
    confirmadoEm BIGINT
  )`);
  tabelaPronta = true;
}

const hash = (...partes) => crypto.createHash('sha256').update(partes.join(':')).digest('hex');
const novoCodigo = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// ---------- Normalização e máscara ----------
function normalizarEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

/** Celular brasileiro → 55 + DDD + 9 dígitos (ou null) */
function normalizarCelular(telefone) {
  let d = String(telefone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) return null;
  // Celular: 11 dígitos depois do 55, começando por 9
  if (d.length === 13 && d[4] !== '9') return null;
  if (d.length === 12) return null; // fixo (8 dígitos) não recebe WhatsApp/SMS
  return d;
}

function mascararEmail(email) {
  const [nome, dominio] = email.split('@');
  const visivel = nome.length <= 2 ? nome[0] : nome.slice(0, 2);
  return `${visivel}${'•'.repeat(Math.max(1, Math.min(6, nome.length - visivel.length)))}@${dominio}`;
}

function mascararCelular(numero) {
  return `(${numero.slice(2, 4)}) •••••-${numero.slice(-4)}`;
}

// ---------- Envio ----------
function nomeDoSistema() {
  return String(process.env.CADASTRO_NOME_SISTEMA || 'EasyClin').trim();
}

let transporte = null;
function transporteEmail() {
  if (transporte) return transporte;
  const host = String(process.env.SMTP_HOST || '').trim();
  if (!host) {
    throw erro(503,
    'O envio de e-mails ainda não está configurado neste servidor. Avise o suporte do EasyClin.',
    'EMAIL_NAO_CONFIGURADO');
  }
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (e) {
    throw erro(503, 'O envio de e-mails não está instalado neste servidor (rode "npm run instalar"). Avise o suporte.', 'EMAIL_NAO_CONFIGURADO');
  }
  const porta = Number(process.env.SMTP_PORT) || 587;
  const seguro = process.env.SMTP_SECURE ? ligado('SMTP_SECURE', false) : porta === 465;
  transporte = nodemailer.createTransport({
    host,
    port: porta,
    secure: seguro,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
  return transporte;
}

async function enviarEmail(email, codigo) {
  const sistema = nomeDoSistema();
  const de = String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
  const texto =
  `Olá!\n\nSeu código para confirmar o e-mail no ${sistema} é: ${codigo}\n\n` +
  'Ele vale por 10 minutos. Se você não pediu este código, pode ignorar esta mensagem.\n';
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
    <h2 style="color:#0d9488;margin:0 0 12px">${sistema}</h2>
    <p>Olá! Use o código abaixo para confirmar o seu e-mail:</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px;text-align:center;margin:20px 0">${codigo}</p>
    <p style="color:#6b7280;font-size:14px">O código vale por 10 minutos. Se você não pediu este código, pode ignorar este e-mail.</p>
  </div>`;
  try {
    await transporteEmail().sendMail({
      from: de ? de.includes('<') ? de : `"${sistema}" <${de}>` : undefined,
      to: email,
      subject: `${codigo} é o seu código de confirmação do ${sistema}`,
      text: texto,
      html
    });
  } catch (err) {
    if (err.status) throw err;
    console.error(`📧 ❌ [cadastro] Falha ao enviar e-mail para ${mascararEmail(email)}:`, err.message);
    transporte = null; // reabre a conexão na próxima tentativa
    throw erro(502, 'Não conseguimos enviar o e-mail agora. Confira o endereço e tente de novo em instantes.', 'EMAIL_FALHOU');
  }
}

async function enviarWhatsApp(numero, codigo) {
  const { enviarMensagemRobusta, getWahaApiKey } = require('../routes/whatsapp-shared');
  const serverUrlBruta = (
  process.env.CADASTRO_WAHA_SERVER_URL ||
  process.env.WAHA_2FA_SERVER_URL ||
  process.env.WAHA_SERVER_URL ||
  process.env.VITE_WAHA_SERVER_URL ||
  'https://whatsapp2.x-star.com.br').
  trim().replace(/\/+$/, '');
  const serverUrl = /^https?:\/\//i.test(serverUrlBruta) ? serverUrlBruta : `https://${serverUrlBruta}`;
  const sessao = String(process.env.CADASTRO_WAHA_SESSION || process.env.WAHA_2FA_SESSION || 'edssolution').trim();
  const texto =
  `*${nomeDoSistema()}* — seu código de confirmação é *${codigo}*.\n\n` +
  'Ele vale por 10 minutos. Não compartilhe com ninguém.';
  const r = await enviarMensagemRobusta(serverUrl, getWahaApiKey(), `${numero}@c.us`, texto, sessao);
  if (!r || !r.success) throw new Error(`WhatsApp (sessão "${sessao}") não enviou: ${r?.error || 'sem detalhe'}`);
}

async function enviarSmsCodigo(numero, codigo) {
  const sms = require('../routes/sms');
  const credenciais = {
    apiKey: String(process.env.SMSGO_API_KEY || '').trim(),
    bearerToken: String(process.env.SMSGO_BEARER_TOKEN || '').trim(),
    baseUrl: String(process.env.SMSGO_API_URL || 'https://api.smsgo.com.br').trim().replace(/\/+$/, '')
  };
  if (!credenciais.apiKey && !credenciais.bearerToken) throw new Error('SMS sem SMSGO_API_KEY/SMSGO_BEARER_TOKEN no .env.local');
  const corpo = { phone: `+${numero}`, message: `${nomeDoSistema()}: seu codigo de confirmacao e ${codigo}. Vale por 10 minutos.` };
  const remetente = String(process.env.SMSGO_REMETENTE || '').trim();
  if (remetente) corpo.from = remetente;
  await sms.chamarSmsGo(credenciais, '/v1/sms/send/single', { method: 'POST', body: corpo });
}

/** Envia pelo canal configurado; devolve 'whatsapp' ou 'sms' (por onde foi) */
async function enviarCelular(numero, codigo, preferido) {
  const canal = configuracao().canalCelular;
  const ordem =
  canal === 'whatsapp' ? ['whatsapp'] :
  canal === 'sms' ? ['sms'] :
  preferido === 'sms' ? ['sms', 'whatsapp'] : ['whatsapp', 'sms'];
  const falhas = [];
  for (const via of ordem) {
    try {
      if (via === 'whatsapp') await enviarWhatsApp(numero, codigo);else
      await enviarSmsCodigo(numero, codigo);
      return via;
    } catch (err) {
      falhas.push(err.message);
    }
  }
  console.error(`📱 ❌ [cadastro] Código não enviado para ${mascararCelular(numero)}: ${falhas.join(' | ')}`);
  throw erro(502,
  'Não conseguimos enviar o código para este celular agora. Confira o número e tente de novo em instantes.',
  'CELULAR_FALHOU');
}

// ---------- Fluxo ----------
/**
 * Gera e envia um código. `id` (opcional) = reenviar para o mesmo pedido.
 * Devolve o que a tela mostra: { id, canal, via, destino, expiraEmSeg, reenvioEmSeg }
 */
async function enviarCodigo({ canal, destino, id, ip, preferido }) {
  await garantirTabela();
  const cfg = configuracao();
  if (canal !== 'email' && canal !== 'celular') throw erro(400, 'Canal inválido.');
  if (canal === 'email' && !cfg.confirmarEmail || canal === 'celular' && !cfg.confirmarCelular) {
    throw erro(400, 'Esta confirmação não está ativada.');
  }

  const normal = canal === 'email' ? normalizarEmail(destino) : normalizarCelular(destino);
  if (!normal) {
    throw erro(400, canal === 'email' ?
    'Este e-mail não parece válido. Confira se digitou certinho (ex.: nome@clinica.com.br).' :
    'Informe um celular com DDD, por exemplo (11) 98765-4321.');
  }
  if (canal === 'email') {
    const existe = await dbGlobal.prepare('SELECT id FROM usuarios WHERE LOWER(email) = ?').get(normal);
    if (existe) throw erro(409, 'Já existe uma conta com este e-mail. Use "Esqueci minha senha" ou entre com ele.', 'EMAIL_DUPLICADO');
  }

  const agora = Date.now();
  await dbGlobal.prepare('DELETE FROM cadastro_verificacoes WHERE expiraEm < ? AND (confirmadoEm IS NULL OR confirmadoEm < ?)').
  run(agora - 24 * 3600 * 1000, agora - 24 * 3600 * 1000);

  // Limite por destino (evita usar o cadastro para mandar mensagens a terceiros)
  const recentes = await dbGlobal.prepare(
    'SELECT COALESCE(SUM(envios), 0) AS n FROM cadastro_verificacoes WHERE canal = ? AND destino = ? AND enviadoEm > ?'
  ).get(canal, normal, agora - 3600 * 1000);
  if (Number(recentes?.n || 0) >= MAX_ENVIOS_POR_DESTINO_HORA) {
    throw erro(429, 'Já enviamos vários códigos para este destino. Aguarde um pouco antes de pedir outro.');
  }

  let pedido = id ? await dbGlobal.prepare('SELECT * FROM cadastro_verificacoes WHERE id = ?').get(String(id)) : null;
  if (pedido && (pedido.canal !== canal || pedido.destino !== normal || pedido.confirmadoEm)) pedido = null;
  if (pedido) {
    const espera = Number(pedido.enviadoEm) + INTERVALO_REENVIO_MS - agora;
    if (espera > 0) throw erro(429, `Aguarde ${Math.ceil(espera / 1000)} segundos para pedir outro código.`);
  }

  const codigo = novoCodigo();
  let via = 'email';
  if (canal === 'email') await enviarEmail(normal, codigo);else
  via = await enviarCelular(normal, codigo, preferido);

  if (process.env.CADASTRO_CODIGO_NO_LOG === '1') {
    console.log(`🧪 [cadastro] (CADASTRO_CODIGO_NO_LOG) código ${canal} ${normal}: ${codigo}`);
  }

  if (pedido) {
    await dbGlobal.prepare(
      'UPDATE cadastro_verificacoes SET codigoHash = ?, expiraEm = ?, tentativas = 0, enviadoEm = ?, envios = envios + 1 WHERE id = ?'
    ).run(hash(pedido.id, codigo), agora + VALIDADE_CODIGO_MS, agora, pedido.id);
  } else {
    const novoId = crypto.randomBytes(24).toString('hex');
    await dbGlobal.prepare(
      'INSERT INTO cadastro_verificacoes (id, canal, destino, codigoHash, expiraEm, tentativas, enviadoEm, envios, ip) VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?)'
    ).run(novoId, canal, normal, hash(novoId, codigo), agora + VALIDADE_CODIGO_MS, agora, String(ip || '').slice(0, 64));
    pedido = { id: novoId };
  }
  const destinoMascarado = canal === 'email' ? mascararEmail(normal) : mascararCelular(normal);
  console.log(`✉️ [cadastro] Código de ${canal} enviado (${via}) para ${destinoMascarado}`);
  return {
    id: pedido.id,
    canal,
    via,
    destino: destinoMascarado,
    expiraEmSeg: VALIDADE_CODIGO_MS / 1000,
    reenvioEmSeg: INTERVALO_REENVIO_MS / 1000
  };
}

/** Confere o código. Devolve { comprovante } para usar no POST /cadastro. */
async function confirmarCodigo({ id, codigo }) {
  await garantirTabela();
  const pedido = id ? await dbGlobal.prepare('SELECT * FROM cadastro_verificacoes WHERE id = ?').get(String(id)) : null;
  if (!pedido || pedido.confirmadoEm) throw erro(410, 'Este código não vale mais. Peça um novo.');
  if (Number(pedido.expiraEm) < Date.now()) throw erro(410, 'O código expirou. Toque em "Enviar outro código".');
  if (Number(pedido.tentativas) >= MAX_TENTATIVAS) throw erro(429, 'Muitas tentativas com código errado. Peça um novo código.');
  const limpo = String(codigo || '').replace(/\D/g, '');
  const certo = limpo.length === 6 &&
  crypto.timingSafeEqual(Buffer.from(hash(pedido.id, limpo)), Buffer.from(pedido.codigoHash));
  if (!certo) {
    const usadas = Number(pedido.tentativas) + 1;
    await dbGlobal.prepare('UPDATE cadastro_verificacoes SET tentativas = ? WHERE id = ?').run(usadas, pedido.id);
    const restam = MAX_TENTATIVAS - usadas;
    throw erro(401, restam > 0 ?
    `Código incorreto. ${restam === 1 ? 'Resta 1 tentativa' : `Restam ${restam} tentativas`}.` :
    'Código incorreto. Peça um novo código.');
  }
  const comprovante = crypto.randomBytes(32).toString('hex');
  await dbGlobal.prepare('UPDATE cadastro_verificacoes SET comprovanteHash = ?, confirmadoEm = ? WHERE id = ?').
  run(hash('comprovante', comprovante), Date.now(), pedido.id);
  return { comprovante, canal: pedido.canal };
}

/**
 * No POST /cadastro: o comprovante precisa ser deste canal e deste destino.
 * Devolve o destino normalizado (e-mail em minúsculas / celular 55DDD...).
 * Com a confirmação desligada, só valida o formato.
 */
async function exigirComprovante(canal, destino, comprovante) {
  const cfg = configuracao();
  const normal = canal === 'email' ? normalizarEmail(destino) : normalizarCelular(destino);
  const ativo = canal === 'email' ? cfg.confirmarEmail : cfg.confirmarCelular;
  if (!ativo) return { destino: normal, confirmado: false };
  if (!normal) throw erro(400, canal === 'email' ? 'E-mail inválido.' : 'Celular inválido.');
  await garantirTabela();
  const pedido = comprovante ?
  await dbGlobal.prepare('SELECT * FROM cadastro_verificacoes WHERE comprovanteHash = ?').get(hash('comprovante', String(comprovante))) :
  null;
  if (!pedido || pedido.canal !== canal || pedido.destino !== normal ||
  Number(pedido.confirmadoEm) + VALIDADE_COMPROVANTE_MS < Date.now()) {
    throw erro(403, canal === 'email' ?
    'Confirme o seu e-mail com o código enviado antes de criar a conta.' :
    'Confirme o seu celular com o código enviado antes de criar a conta.', 'CONFIRMACAO_PENDENTE');
  }
  return { destino: normal, confirmado: true, pedidoId: pedido.id };
}

/** Depois de criar a conta: comprovantes não servem mais */
async function consumir(ids) {
  for (const id of ids.filter(Boolean)) {
    await dbGlobal.prepare('DELETE FROM cadastro_verificacoes WHERE id = ?').run(id).catch(() => {});
  }
}

module.exports = {
  configuracao,
  enviarCodigo,
  confirmarCodigo,
  exigirComprovante,
  consumir,
  normalizarEmail,
  normalizarCelular,
  mascararEmail,
  mascararCelular
};
