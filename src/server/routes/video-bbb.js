// ==================== ROTAS DE VÍDEO — BigBlueButton (BBB) ====================
// Integração com um servidor BigBlueButton para a CONSULTA ONLINE (telemedicina).
//
// Por que BBB (opção "profissional"): diferente do Jitsi público, o BBB roda no
// SEU servidor, sem limite de tempo, com SALA DE ESPERA (o médico admite o
// paciente), gravação da consulta e controle de moderador. A contrapartida é que
// o BBB NÃO gera link direto: cada participante entra por uma URL ASSINADA
// (checksum SHA1 com o "shared secret"), gerada aqui no backend — o segredo NUNCA
// vai para o frontend.
//
// Fluxo:
//   1. `create` (idempotente) — cria a sala da consulta se ainda não existe.
//   2. `join` (assinado) — devolve a URL de entrada para o papel (moderador =
//      médico, attendee = paciente). Esta rota faz um 302 REDIRECT para essa URL,
//      então o link fica ESTÁVEL e compartilhável (o mesmo link do WhatsApp
//      funciona sempre, pois a assinatura é refeita a cada acesso).
//
// Configuração (.env.local):
//   BBB_URL=https://bbb.sky9.com.br            (sem barra final)
//   BBB_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (o "shared secret" do BBB)
//   (opcional) BBB_WELCOME="Bem-vindo(a) à sua consulta online"
//
// Obtenha a URL e o secret no servidor BBB com: `bbb-conf --secret`.

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// ⭐⭐⭐ Garante que o .env.local seja carregado AQUI TAMBÉM (mesma estratégia da
// rota do WhatsApp). Assim, independentemente da ordem de carregamento em
// start-server.js, esta rota SEMPRE enxerga BBB_URL/BBB_SECRET. As variáveis são
// lidas de process.env A CADA REQUISIÇÃO (getters abaixo), nunca "congeladas" no
// carregamento do módulo — corrige o caso em que o secret existe no arquivo mas
// não era visto pela rota.
try {
  const dotenv = require('dotenv');
  const searchPaths = [
  path.join(__dirname, '..', '.env.local'), // server/.env.local
  path.resolve(__dirname, '..', '..', '.env.local'), // 1 nível acima (src/)
  path.resolve(__dirname, '..', '..', '..', '.env.local'), // 2 níveis acima
  path.join(process.cwd(), '.env.local') // diretório de execução
  ];
  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      console.log(`🔑 [video-bbb] .env.local carregado de: ${p}`);
      break;
    }
  }
} catch (e) {
  console.log(`⚠️ [video-bbb] dotenv não disponível: ${e.message}`);
}

// fetch robusto (mesma estratégia do start-server.js)
let fetch;
try {
  fetch = require('node-fetch');
} catch (e) {
  fetch = (...args) => import('node-fetch').then((mod) => mod.default(...args));
}

// ⭐ Getters lidos A CADA REQUISIÇÃO (não no carregamento do módulo). Se o
// .env.local for ajustado e o servidor reiniciado, os valores atualizam sem
// depender da ordem de require. Host padrão do BBB: bbb.sky9.com.br.
function getBbbUrl() {
  return (process.env.BBB_URL || 'https://bbb.sky9.com.br').replace(/\/+$/, '');
}
function getBbbSecret() {
  return process.env.BBB_SECRET || '';
}
function getBbbWelcome() {
  return process.env.BBB_WELCOME || 'Bem-vindo(a) à sua consulta online.';
}
// ⭐ FALLBACK: enquanto o BBB não estiver 100% configurado (falta o secret) ou
// se ele falhar, NÃO deixamos o paciente na mão — redirecionamos para uma sala
// Jitsi pública ABERTA (mesma usada no provedor 'jitsi'). O nome da sala é
// determinístico por (clínica + consulta), então médico e paciente caem na
// MESMA sala. Configurável por VIDEO_FALLBACK_URL no .env.local.
function getFallbackJitsiUrl() {
  return (process.env.VIDEO_FALLBACK_URL || 'https://meet.ffmuc.net').replace(
    /\/+$/,
    ''
  );
}

function bbbConfigurado() {
  return !!(getBbbUrl() && getBbbSecret());
}

// Nome de sala determinístico compatível com o frontend (utils/videoConsulta.ts):
// EasyClin-<clinica>-<consulta>. Garante que a sala de fallback seja a mesma
// para todos os participantes da consulta.
function salaJitsiFallback(clinicaId, consultaId) {
  const slug = (v) =>
  (v || '').
  toString().
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  replace(/[^A-Za-z0-9-]/g, '').
  slice(0, 40);
  const room = ['EasyClin', slug(clinicaId) || 'clinica', slug(consultaId)].
  filter(Boolean).
  join('-');
  return `${getFallbackJitsiUrl()}/${room}`;
}

// Monta uma URL assinada da API do BBB para uma ação (create, join, etc.).
function montarUrlAssinada(action, params) {
  const query = new URLSearchParams(params).toString();
  const checksum = crypto.
  createHash('sha1').
  update(action + query + getBbbSecret()).
  digest('hex');
  return `${getBbbUrl()}/bigbluebutton/api/${action}?${query}&checksum=${checksum}`;
}

// Senhas determinísticas por sala (derivadas do secret) — assim o `join` sempre
// recompõe a mesma senha sem precisar guardar nada no banco.
function senhaSala(meetingID, papel) {
  return crypto.
  createHash('sha1').
  update(`${papel}:${meetingID}:${getBbbSecret()}`).
  digest('hex').
  slice(0, 16);
}

function meetingIdDe(clinicaId, consultaId) {
  const limpa = (v) =>
  (v || '').
  toString().
  replace(/[^A-Za-z0-9-]/g, '').
  slice(0, 60);
  return `EasyClin-${limpa(clinicaId) || 'clinica'}-${limpa(consultaId) || 'sala'}`;
}

// Garante que a sala existe (create é idempotente no BBB: recriar uma sala já
// existente retorna sucesso, sem duplicar).
async function garantirSala(meetingID, nomeAmigavel) {
  const params = {
    meetingID,
    name: nomeAmigavel || meetingID,
    attendeePW: senhaSala(meetingID, 'attendee'),
    moderatorPW: senhaSala(meetingID, 'moderator'),
    welcome: getBbbWelcome(),
    // ⭐ SEM sala de espera: paciente e médico entram DIRETO na mesma sala.
    // Com ASK_MODERATOR o paciente que chegava ANTES do médico ficava preso num
    // lobby de convidado que o cliente HTML5 do BBB não consegue estabelecer
    // cross-origin → mostrava "Oops, something went wrong". ALWAYS_ACCEPT libera
    // a entrada imediata, sem gate que quebra. (Único ajuste vs. a versão que já
    // funcionava para o médico — o resto do fluxo permanece idêntico.)
    guestPolicy: 'ALWAYS_ACCEPT',
    record: 'false',
    autoStartRecording: 'false',
    allowStartStopRecording: 'true'
  };
  const url = montarUrlAssinada('create', params);
  const resp = await fetch(url, { method: 'GET' });
  const texto = await resp.text();
  // BBB responde XML. Sucesso = <returncode>SUCCESS</returncode> (inclui o caso
  // "idNotUnique"/duplicado, que também vem como SUCCESS).
  if (!/<returncode>\s*SUCCESS\s*<\/returncode>/i.test(texto)) {
    throw new Error(`BBB create falhou: ${texto.slice(0, 300)}`);
  }
}

// GET /api/video/bbb/status — informa se o BBB está configurado (sem expor o
// secret). O frontend usa isto para decidir o provedor de vídeo.
router.get('/status', (req, res) => {
  const configurado = bbbConfigurado();
  // Log diagnóstico (sem vazar o secret) — ajuda a confirmar no console do
  // servidor se o .env.local foi de fato lido por ESTE processo.
  console.log(
    `ℹ️ [video-bbb] status: configurado=${configurado} url=${getBbbUrl()} secret=${
    getBbbSecret() ? 'definido' : 'VAZIO'}`

  );
  res.json({ configurado, url: getBbbUrl() || null });
});

// GET /api/video/bbb/join — cria a sala (se preciso) e REDIRECIONA para a URL
// de entrada assinada. Query:
//   clinicaId, consultaId  → identificam a sala (determinístico)
//   role = 'moderator' | 'attendee' (padrão: attendee)
//   nome  → nome exibido do participante
router.get('/join', async (req, res) => {
  const { clinicaId, consultaId } = req.query;
  // ⭐ BBB não configurado (falta o secret): em vez de mostrar erro ao paciente,
  // cai na sala Jitsi de fallback — a consulta SEMPRE conecta.
  if (!bbbConfigurado()) {
    console.warn(
      '⚠️ [video-bbb] BBB sem secret configurado — usando fallback Jitsi.'
    );
    return res.redirect(302, salaJitsiFallback(clinicaId, consultaId));
  }
  try {
    const role = req.query.role === 'moderator' ? 'moderator' : 'attendee';
    const nome = (
    req.query.nome || (role === 'moderator' ? 'Profissional' : 'Paciente')).

    toString().
    slice(0, 80);
    const meetingID = meetingIdDe(clinicaId, consultaId);
    const nomeAmigavel = `Consulta ${consultaId || ''}`.trim();

    await garantirSala(meetingID, nomeAmigavel);

    // ⭐ Entra DIRETO no cliente: redirect=true faz o próprio BBB responder com
    // 302 para a sessão de entrada. Este era o comportamento que já funcionava
    // para o médico — mantemos assim. O que resolve o "Oops" do paciente é a
    // sala NÃO ter mais lobby (guestPolicy=ALWAYS_ACCEPT no create acima).
    const joinUrl = montarUrlAssinada('join', {
      meetingID,
      fullName: nome,
      password: senhaSala(meetingID, role),
      redirect: 'true',
      // ⭐ Idioma: força o cliente em Português do Brasil.
      'userdata-bbb_override_default_locale': 'pt-BR',
      // ⭐ Pula as telas de "apresentação"/checagem de áudio: entra direto com
      // microfone (sem o echo test e sem a escolha ouvir-somente).
      'userdata-bbb_auto_join_audio': 'true',
      'userdata-bbb_listen_only_mode': 'false',
      'userdata-bbb_skip_check_audio': 'true',
      'userdata-bbb_skip_check_audio_on_first_join': 'true',
      // ⭐ Entra direto no vídeo, sem passos intermediários.
      'userdata-bbb_auto_share_webcam': 'true',
      'userdata-bbb_hide_presentation_on_join': 'true'
    });
    return res.redirect(302, joinUrl);
  } catch (err) {
    // ⭐ BBB configurado mas falhou (servidor fora do ar, secret errado, etc.):
    // também cai no fallback Jitsi para não deixar a consulta sem sala.
    console.error(
      '❌ [video-bbb] Erro no join, usando fallback Jitsi:',
      err.message
    );
    return res.redirect(302, salaJitsiFallback(clinicaId, consultaId));
  }
});

module.exports = router;