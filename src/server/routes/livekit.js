// ⭐ Consulta Online via LiveKit (servidor próprio da clínica)
//
// O LiveKit não usa "link de sala": o acesso é concedido por um TOKEN JWT
// assinado com a API Key + Secret. Essa assinatura acontece SEMPRE aqui no
// servidor — a Secret nunca chega ao navegador.
//
// ⚠️ SEM DEPENDÊNCIA EXTERNA: o token do LiveKit é um JWT HS256 comum, então
// ele é assinado com o módulo `crypto` nativo do Node. Isso evita exigir
// `npm install` de um SDK neste ambiente (onde o npm da raiz não instala as
// dependências deste app).
//
// Credenciais (server/.env.local):
//   LIVEKIT_URL=wss://video.sky9.com.br
//   LIVEKIT_API_KEY=...
//   LIVEKIT_API_SECRET=...
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// ⚠️ O ENDEREÇO DO SERVIDOR DE VÍDEO É FIXO NO CÓDIGO — DE PROPÓSITO.
// Neste ambiente a variável LIVEKIT_URL acaba sendo preenchida com o host da
// APLICAÇÃO (team./consulta.sky9.com.br), o que aponta o cliente para o lugar
// errado e trava a negociação de mídia em `pub-ice:new`. O endereço do servidor
// LiveKit não é segredo (só a Key/Secret são), então fica aqui, estável.
// Só é sobrescrito se LIVEKIT_URL apontar explicitamente para um host de vídeo.
const LIVEKIT_URL_PADRAO = 'wss://video.sky9.com.br';
const LIVEKIT_URL_ENV = String(process.env.LIVEKIT_URL || '').trim();
const LIVEKIT_URL = /(^|\.)video\./.test(LIVEKIT_URL_ENV) ?
LIVEKIT_URL_ENV :
LIVEKIT_URL_PADRAO;
const LIVEKIT_API_KEY = String(process.env.LIVEKIT_API_KEY || '').trim();
const LIVEKIT_API_SECRET = String(process.env.LIVEKIT_API_SECRET || '').trim();

if (LIVEKIT_URL_ENV && LIVEKIT_URL !== LIVEKIT_URL_ENV) {
  console.warn(
    `⚠️ [LiveKit] LIVEKIT_URL="${LIVEKIT_URL_ENV}" não parece um servidor de vídeo — usando ${LIVEKIT_URL_PADRAO}.`
  );
}

// A URL usada pelo cliente é sempre WebSocket. Aceita https:// no .env por
// conveniência e converte.
function urlWebSocket() {
  if (!LIVEKIT_URL) return '';
  return LIVEKIT_URL.replace(/^http:/, 'ws:').
  replace(/^https:/, 'wss:').
  replace(/\/+$/, '');
}

function configurado() {
  return Boolean(urlWebSocket() && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

function base64url(input) {
  return Buffer.from(input).
  toString('base64').
  replace(/\+/g, '-').
  replace(/\//g, '_').
  replace(/=+$/, '');
}

/** Assina um JWT HS256 no formato esperado pelo LiveKit. */
function assinarToken({ sala, identidade, nome, moderador, segundos = 4 * 60 * 60 }) {
  const agora = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  const payload = {
    iss: LIVEKIT_API_KEY, // a API Key identifica quem assinou
    sub: identidade,
    nbf: agora - 10, // tolerância de relógio entre servidores
    exp: agora + segundos,
    name: nome || identidade,
    video: {
      room: sala,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Só o profissional cria/administra a sala.
      roomCreate: Boolean(moderador),
      roomAdmin: Boolean(moderador)
    }
  };
  const conteudo = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const assinatura = crypto.
  createHmac('sha256', LIVEKIT_API_SECRET).
  update(conteudo).
  digest('base64').
  replace(/\+/g, '-').
  replace(/\//g, '_').
  replace(/=+$/, '');
  return `${conteudo}.${assinatura}`;
}

// Nome de sala determinístico por (clínica + consulta): médico e paciente
// entram exatamente na mesma sala, sem precisar combinar nada.
function nomeSala(clinicaId, consultaId) {
  const limpar = (v) =>
  String(v || '').
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '').
  replace(/[^A-Za-z0-9-]/g, '').
  slice(0, 40);
  return ['easyclin', limpar(clinicaId) || 'clinica', limpar(consultaId) || 'sala'].join('-');
}

// GET /api/livekit/status — o frontend consulta antes de escolher o provedor
router.get('/status', (req, res) => {
  res.json({
    configurado: configurado(),
    url: configurado() ? urlWebSocket() : '',
    // Ajuda o diagnóstico sem expor segredo algum
    faltando: {
      apiKey: !LIVEKIT_API_KEY,
      apiSecret: !LIVEKIT_API_SECRET
    }
  });
});

// POST /api/livekit/token — token do PROFISSIONAL (área autenticada do sistema)
router.post('/token', (req, res) => {
  try {
    if (!configurado()) {
      return res.status(503).json({
        error:
        'LiveKit não configurado no servidor. Defina LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET em server/.env.local.'
      });
    }
    const { clinicaId, consultaId, nome, role } = req.body || {};
    if (!consultaId) {
      return res.status(400).json({ error: 'consultaId é obrigatório' });
    }
    const sala = nomeSala(clinicaId, consultaId);
    const moderador = role !== 'attendee';
    const token = assinarToken({
      sala,
      identidade: `${moderador ? 'prof' : 'pac'}-${consultaId}-${Date.now().toString(36)}`,
      nome: nome || (moderador ? 'Profissional' : 'Paciente'),
      moderador
    });
    res.json({ url: urlWebSocket(), token, sala });
  } catch (err) {
    console.error('❌ [LiveKit] Erro ao gerar token:', err);
    res.status(500).json({ error: err.message || 'Falha ao gerar token de vídeo' });
  }
});

// GET /api/livekit/paciente/:clinicaId/:consultaId — token do PACIENTE
// Rota pública: é o link enviado por WhatsApp/SMS. O paciente entra sem poder
// administrar a sala, e o token vale apenas para a sala daquela consulta.
router.get('/paciente/:clinicaId/:consultaId', (req, res) => {
  try {
    if (!configurado()) {
      return res.status(503).json({ error: 'Sala de vídeo indisponível no momento.' });
    }
    const { clinicaId, consultaId } = req.params;
    const sala = nomeSala(clinicaId, consultaId);
    const token = assinarToken({
      sala,
      identidade: `pac-${consultaId}-${Date.now().toString(36)}`,
      nome: String(req.query.nome || 'Paciente').slice(0, 60),
      moderador: false
    });
    res.json({ url: urlWebSocket(), token, sala });
  } catch (err) {
    console.error('❌ [LiveKit] Erro ao gerar token do paciente:', err);
    res.status(500).json({ error: 'Falha ao entrar na sala de vídeo.' });
  }
});

module.exports = router;