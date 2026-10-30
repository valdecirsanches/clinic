// ==================== ARQUIVOS DOS PACIENTES (/uploads) ====================
// Fotos, documentos, mídias do WhatsApp e carteirinhas ficavam abertos para
// qualquer um que tivesse o link. Agora /uploads exige:
//   • a sessão do sistema (cookie easyclin_token, ?_auth= ou Bearer) de alguém
//     com acesso à clínica dona do arquivo (o caminho traz o id da clínica); OU
//   • um link ASSINADO e com validade (?exp=&ass=), usado quando o arquivo vai
//     para fora — WAHA/Meta baixam a carteirinha ou o anexo por esse link.
// O segredo das assinaturas fica em UPLOADS_SEGREDO (.env.local); sem ele, é
// gerado uma vez e guardado em server/.uploads-segredo.local.
// AUTH_MODE=log também vale aqui: registra e deixa passar.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const autenticacao = require('./autenticacao');

const ARQUIVO_SEGREDO = path.join(__dirname, '..', '.uploads-segredo.local');

let segredo = null;
function obterSegredo() {
  if (segredo) return segredo;
  if (process.env.UPLOADS_SEGREDO && process.env.UPLOADS_SEGREDO.length >= 16) {
    segredo = process.env.UPLOADS_SEGREDO;
    return segredo;
  }
  try {
    const salvo = fs.readFileSync(ARQUIVO_SEGREDO, 'utf8').trim();
    if (salvo.length >= 32) {
      segredo = salvo;
      return segredo;
    }
  } catch (e) {/* ainda não existe */}
  segredo = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(ARQUIVO_SEGREDO, segredo, { mode: 0o600 });
  } catch (err) {
    console.warn('⚠️ [uploads] Não foi possível gravar o segredo dos links; links assinados valem até reiniciar:', err.message);
  }
  return segredo;
}

function assinatura(caminho, exp) {
  return crypto.createHmac('sha256', obterSegredo()).update(`${caminho}|${exp}`).digest('base64url').slice(0, 32);
}

/**
 * Link assinado para um arquivo de /uploads.
 * Aceita "/uploads/x/y.png" ou uma URL completa ("https://api.../uploads/x/y.png").
 * @param {number} validadeSeg padrão: 24 horas
 */
function assinarUrlUpload(urlOuCaminho, validadeSeg = 24 * 3600) {
  if (!urlOuCaminho) return urlOuCaminho;
  const texto = String(urlOuCaminho);
  const inicio = texto.indexOf('/uploads/');
  if (inicio < 0) return texto;
  const [semQuery] = texto.split('?');
  const caminho = decodeURIComponent(semQuery.slice(semQuery.indexOf('/uploads/')));
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, validadeSeg);
  return `${semQuery}?exp=${exp}&ass=${assinatura(caminho, exp)}`;
}

function assinaturaValida(req) {
  const exp = Number(req.query.exp);
  const ass = String(req.query.ass || '');
  if (!exp || !ass || exp < Math.floor(Date.now() / 1000)) return false;
  const caminho = decodeURIComponent(`/uploads${req.path}`);
  const esperado = assinatura(caminho, exp);
  return esperado.length === ass.length && crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(ass));
}

async function middleware(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  try {
    if (assinaturaValida(req)) return next();

    const token = autenticacao.tokenDaRequisicao(req);
    const usuario = token ? await autenticacao.usuarioDoToken(token) : null;
    if (usuario) {
      // O caminho traz a clínica: /uploads/<operadora>/<clinica>/...
      const segmentos = req.path.split('/').filter(Boolean);
      for (const s of segmentos.slice(0, 3)) {
        if (await autenticacao.ehClinicaConhecida(s) && !(await autenticacao.podeAcessarClinica(usuario, s))) {
          if (autenticacao.MODO === 'log') {
            console.warn(`🔓 [AUTH:log] /uploads${req.path} seria bloqueado (clínica ${s})`);
            return next();
          }
          return res.status(403).json({ error: 'Sem acesso a este arquivo.', codigo: 'CLINICA_NEGADA' });
        }
      }
      return next();
    }

    if (autenticacao.MODO === 'log') {
      console.warn(`🔓 [AUTH:log] /uploads${req.path} seria bloqueado (sem sessão)`);
      return next();
    }
    return res.status(401).json({ error: 'Arquivo protegido. Entre no sistema para abrir.', codigo: 'NAO_AUTENTICADO' });
  } catch (err) {
    console.error('🔐 ❌ [uploads] Falha ao validar acesso:', err.message);
    return res.status(503).json({ error: 'Não foi possível validar o acesso agora.' });
  }
}

module.exports = { middleware, assinarUrlUpload };
