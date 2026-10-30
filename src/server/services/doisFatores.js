// ==================== VERIFICAÇÃO EM DUAS ETAPAS (WhatsApp) ====================
// Depois de e-mail e senha corretos, o usuário com a verificação ativada
// recebe um código de 6 dígitos no WhatsApp (WAHA, sessão "edssolution").
//
// Variáveis do server/.env.local (todas opcionais):
//   WAHA_2FA_SESSION     sessão do WAHA que envia o código (padrão: edssolution)
//   WAHA_2FA_SERVER_URL  servidor WAHA (padrão: WAHA_SERVER_URL / VITE_WAHA_SERVER_URL)
//   WAHA_API_KEY         chave do WAHA (a mesma usada no resto do sistema)
//
// O desafio fica no banco (tabela login_desafios), não na memória: com o
// servidor em vários processos, a confirmação pode cair em outro processo.
// O código não é guardado: só o hash dele.

const crypto = require('crypto');
const dbGlobal = require('../databaseGlobal');

const VALIDADE_MS = 5 * 60 * 1000;
const MAX_TENTATIVAS = 5;
const INTERVALO_REENVIO_MS = 60 * 1000;

let tabelaPronta = false;

function erro(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

async function garantirTabela() {
  if (tabelaPronta) return;
  await dbGlobal.exec(`CREATE TABLE IF NOT EXISTS login_desafios (
    id VARCHAR(64) PRIMARY KEY,
    usuarioId VARCHAR(191) NOT NULL,
    codigoHash VARCHAR(128) NOT NULL,
    telefone VARCHAR(30) NOT NULL,
    expiraEm BIGINT NOT NULL,
    tentativas INT NOT NULL DEFAULT 0,
    enviadoEm BIGINT NOT NULL
  )`);
  tabelaPronta = true;
}

function configWaha() {
  const serverUrl = (
  process.env.WAHA_2FA_SERVER_URL ||
  process.env.WAHA_SERVER_URL ||
  process.env.VITE_WAHA_SERVER_URL ||
  'https://whatsapp2.x-star.com.br').
  trim().replace(/\/+$/, '');
  // Aceita "whatsapp2.x-star.com.br" sem o protocolo (sem isso o envio falhava)
  return { serverUrl: /^https?:\/\//i.test(serverUrl) ? serverUrl : `https://${serverUrl}`, sessao: (process.env.WAHA_2FA_SESSION || 'edssolution').trim() };
}

/** Telefone do cadastro → número com DDI 55, ou null se não for um celular válido */
function normalizarTelefone(telefone) {
  let d = String(telefone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

function mascarar(numero) {
  return `(${numero.slice(2, 4)}) •••••-${numero.slice(-4)}`;
}

function hashCodigo(desafioId, codigo) {
  return crypto.createHash('sha256').update(`${desafioId}:${codigo}`).digest('hex');
}

async function enviarCodigo(numero, codigo) {
  // Carregado só aqui: o módulo do WhatsApp é grande e não é preciso no login comum
  const { enviarMensagemRobusta, getWahaApiKey } = require('../routes/whatsapp-shared');
  const { serverUrl, sessao } = configWaha();
  const texto =
  `*EasyClin* — seu código de acesso é *${codigo}*.\n\n` +
  'Ele vale por 5 minutos. Não compartilhe com ninguém.\n' +
  'Se não foi você que tentou entrar, troque sua senha.';
  const r = await enviarMensagemRobusta(serverUrl, getWahaApiKey(), `${numero}@c.us`, texto, sessao);
  if (!r || !r.success) {
    throw erro(
      422,
      `Não foi possível enviar o código pelo WhatsApp (sessão "${sessao}"). ` +
      'Confira se a sessão está conectada no WAHA ou peça ao administrador para desativar a verificação em duas etapas do seu usuário.'
    );
  }
}

/** Cria o desafio, envia o código e devolve o que a tela precisa mostrar */
async function criarDesafio(usuario) {
  const numero = normalizarTelefone(usuario.telefone);
  if (!numero) {
    throw erro(
      422,
      'A verificação em duas etapas está ativada, mas o seu usuário não tem um celular (WhatsApp) válido cadastrado. Peça ao administrador para corrigir o telefone.'
    );
  }
  await garantirTabela();
  const agora = Date.now();
  await dbGlobal.prepare('DELETE FROM login_desafios WHERE expiraEm < ? OR usuarioId = ?').run(agora - 60 * 60 * 1000, usuario.id);

  const id = crypto.randomBytes(24).toString('hex');
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await enviarCodigo(numero, codigo);
  await dbGlobal.
  prepare('INSERT INTO login_desafios (id, usuarioId, codigoHash, telefone, expiraEm, tentativas, enviadoEm) VALUES (?, ?, ?, ?, ?, 0, ?)').
  run(id, usuario.id, hashCodigo(id, codigo), numero, agora + VALIDADE_MS, agora);
  console.log(`🔐 [2FA] Código enviado para ${mascarar(numero)} (usuário ${usuario.id})`);
  return { id, destino: mascarar(numero), expiraEmSeg: VALIDADE_MS / 1000, reenvioEmSeg: INTERVALO_REENVIO_MS / 1000 };
}

/** Confere o código; devolve o id do usuário ou lança o motivo */
async function verificar(desafioId, codigo) {
  return (await conferirDesafio(desafioId, codigo)).usuarioId;
}

/** Confere o código e devolve { usuarioId, telefone } do desafio */
async function conferirDesafio(desafioId, codigo) {
  await garantirTabela();
  const limpo = String(codigo || '').replace(/\D/g, '');
  const desafio = desafioId ?
  await dbGlobal.prepare('SELECT * FROM login_desafios WHERE id = ?').get(String(desafioId)) :
  null;
  if (!desafio || Number(desafio.expiraEm) < Date.now()) {
    if (desafio) await dbGlobal.prepare('DELETE FROM login_desafios WHERE id = ?').run(desafio.id);
    throw erro(410, 'O código expirou. Entre de novo com e-mail e senha para receber outro.');
  }
  if (Number(desafio.tentativas) >= MAX_TENTATIVAS) {
    await dbGlobal.prepare('DELETE FROM login_desafios WHERE id = ?').run(desafio.id);
    throw erro(429, 'Muitas tentativas com código errado. Entre de novo com e-mail e senha.');
  }
  const certo =
  limpo.length === 6 &&
  crypto.timingSafeEqual(Buffer.from(hashCodigo(desafio.id, limpo)), Buffer.from(desafio.codigoHash));
  if (!certo) {
    const usadas = Number(desafio.tentativas) + 1;
    await dbGlobal.prepare('UPDATE login_desafios SET tentativas = ? WHERE id = ?').run(usadas, desafio.id);
    const restam = MAX_TENTATIVAS - usadas;
    throw erro(
      401,
      restam > 0 ?
      `Código incorreto. ${restam === 1 ? 'Resta 1 tentativa' : `Restam ${restam} tentativas`}.` :
      'Código incorreto. Entre de novo com e-mail e senha.'
    );
  }
  await dbGlobal.prepare('DELETE FROM login_desafios WHERE id = ?').run(desafio.id);
  return { usuarioId: desafio.usuarioId, telefone: desafio.telefone };
}

/** Gera e envia um código novo para o mesmo desafio */
async function reenviar(desafioId) {
  await garantirTabela();
  const desafio = desafioId ?
  await dbGlobal.prepare('SELECT * FROM login_desafios WHERE id = ?').get(String(desafioId)) :
  null;
  if (!desafio || Number(desafio.expiraEm) < Date.now()) {
    throw erro(410, 'O código expirou. Entre de novo com e-mail e senha para receber outro.');
  }
  const espera = Number(desafio.enviadoEm) + INTERVALO_REENVIO_MS - Date.now();
  if (espera > 0) throw erro(429, `Aguarde ${Math.ceil(espera / 1000)} segundos para pedir outro código.`);
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await enviarCodigo(desafio.telefone, codigo);
  const agora = Date.now();
  await dbGlobal.
  prepare('UPDATE login_desafios SET codigoHash = ?, tentativas = 0, expiraEm = ?, enviadoEm = ? WHERE id = ?').
  run(hashCodigo(desafio.id, codigo), agora + VALIDADE_MS, agora, desafio.id);
  return { destino: mascarar(desafio.telefone), expiraEmSeg: VALIDADE_MS / 1000, reenvioEmSeg: INTERVALO_REENVIO_MS / 1000 };
}

module.exports = { criarDesafio, verificar, conferirDesafio, reenviar, normalizarTelefone };