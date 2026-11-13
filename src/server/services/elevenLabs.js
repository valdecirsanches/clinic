// ==================== ELEVENLABS (TEXTO → VOZ) ====================
// Usado pelo Vídeo de Demonstração e pela Ajuda por voz.
// Configuração FIXA no server/.env.local:
//   ELEVENLABS_API_KEY=sk_...
//   ELEVENLABS_MODEL=eleven_multilingual_v2   (opcional)
// A chave NUNCA vai ao navegador: as telas pedem o áudio e o servidor o gera.

const { requisitar, motivoErro, marcarSegredo } = require('./httpJson');

const API = 'https://api.elevenlabs.io/v1';

function chave() {
  return String(process.env.ELEVENLABS_API_KEY || '').trim();
}

function modelo() {
  return String(process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2').trim();
}

function configurado() {
  return Boolean(chave());
}

function statusPublico() {
  return { configurado: configurado(), chave: marcarSegredo(chave()), modelo: modelo() };
}

function limitar(valor, min, max, padrao) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

/** Ajustes da voz no formato da tela → valores válidos (com padrões). */
function normalizarAjustes(ajustes = {}) {
  const a = ajustes || {};
  return {
    estabilidade: limitar(a.estabilidade, 0, 1, 0.5),
    similaridade: limitar(a.similaridade, 0, 1, 0.75),
    estilo: limitar(a.estilo, 0, 1, 0.2),
    velocidade: limitar(a.velocidade, 0.7, 1.2, 1)
  };
}

function vozValida(voiceId) {
  return Boolean(voiceId) && /^[A-Za-z0-9]{8,40}$/.test(String(voiceId));
}

// Vozes pré-definidas da ElevenLabs (públicas, funcionam com qualquer chave).
// Usadas quando a chave não tem a permissão "voices_read" — comum em chaves
// restritas, que só fazem text-to-speech. Assim basta a API key.
const VOZES_PADRAO = [
{ id: 'EXAVITQu4vr4xnSDxMaL', nome: 'Sarah', genero: 'female' },
{ id: 'XB0fDUnXU5powFXDhCwa', nome: 'Charlotte', genero: 'female' },
{ id: 'Xb7hH8MSUJpSbSDYk0k2', nome: 'Alice', genero: 'female' },
{ id: 'pFZP5JQG7iQjIQuC4Bku', nome: 'Lily', genero: 'female' },
{ id: '21m00Tcm4TlvDq8ikWAM', nome: 'Rachel', genero: 'female' },
{ id: 'JBFqnCBsd6RMkjVDRZzb', nome: 'George', genero: 'male' },
{ id: 'onwK4e9ZLuTAKqWW03F9', nome: 'Daniel', genero: 'male' },
{ id: 'TxGEqnHWrfWFTfGW9XCG', nome: 'Josh', genero: 'male' },
{ id: 'pNInz6obpgDQGcFmaJgB', nome: 'Adam', genero: 'male' },
{ id: 'ErXwobaYiN019PkySvjV', nome: 'Antoni', genero: 'male' }].
map((v) => ({ ...v, categoria: 'premade', sotaque: 'multilíngue', previewUrl: null }));

// ⭐ Carregadas UMA vez por execução do servidor (por chave). A lista muda
// raramente; buscar a cada abertura da tela só gastava cota e tempo.
let cacheVozes = null; // { chave, vozes }

async function carregarVozes({ forcar = false } = {}) {
  const k = chave();
  if (!forcar && cacheVozes && cacheVozes.chave === k) return cacheVozes.vozes;
  let vozes = [];
  let aviso = '';
  try {
    const resposta = await requisitar(`${API}/voices`, {
      headers: { 'xi-api-key': k },
      timeoutMs: 15000
    });
    if (resposta.ok) {
      vozes = (resposta.dados && resposta.dados.voices || []).map((v) => ({
        id: v.voice_id,
        nome: v.name,
        categoria: v.category || null,
        sotaque: v.labels && (v.labels.accent || v.labels.language) || null,
        genero: v.labels && v.labels.gender || null,
        previewUrl: v.preview_url || null
      }));
    } else {
      aviso = motivoErro(resposta);
    }
  } catch (err) {
    aviso = err.message;
  }
  if (!vozes.length) {
    console.warn(`🎙️ ⚠️ [ElevenLabs] Lista de vozes da conta indisponível (${aviso || 'vazia'}); usando as vozes padrão.`);
    vozes = VOZES_PADRAO;
  }
  cacheVozes = { chave: k, vozes };
  return vozes;
}

/**
 * Gera o MP3 da fala. Lança Error com motivo legível em caso de falha.
 * @returns {Promise<Buffer>}
 */
async function sintetizar(voiceId, texto, ajustes = {}) {
  if (!configurado()) throw new Error('Defina ELEVENLABS_API_KEY no server/.env.local');
  if (!vozValida(voiceId)) throw new Error('Voz inválida');
  const fala = String(texto || '').trim();
  if (!fala) throw new Error('Texto vazio');
  const a = normalizarAjustes(ajustes);
  const resposta = await requisitar(
    `${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': chave(), Accept: 'audio/mpeg' },
      body: {
        text: fala,
        model_id: modelo(),
        voice_settings: {
          stability: a.estabilidade,
          similarity_boost: a.similaridade,
          style: a.estilo,
          speed: a.velocidade,
          use_speaker_boost: true
        }
      },
      binario: true,
      timeoutMs: 60000
    }
  );
  if (!resposta.ok || !resposta.buffer) {
    throw new Error(`ElevenLabs: ${motivoErro(resposta)}`);
  }
  return resposta.buffer;
}

const EXTENSOES = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a' };

/**
 * Fala → texto (Scribe). Lança Error com motivo legível em caso de falha.
 * Modelo: ELEVENLABS_STT_MODEL (padrão scribe_v2).
 * @returns {Promise<string>}
 */
async function transcrever(buffer, mime = 'audio/webm', { idioma = 'pt' } = {}) {
  if (!configurado()) throw new Error('Defina ELEVENLABS_API_KEY no server/.env.local');
  if (!Buffer.isBuffer(buffer) || buffer.length < 1000) {
    throw new Error('Áudio muito curto. Segure o microfone e fale o pedido.');
  }
  const tipo = String(mime || 'audio/webm').split(';')[0];
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: tipo }), `pedido.${EXTENSOES[tipo] || 'webm'}`);
  form.append('model_id', String(process.env.ELEVENLABS_STT_MODEL || 'scribe_v2').trim());
  if (idioma) form.append('language_code', idioma);
  form.append('tag_audio_events', 'false');

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 45000);
  try {
    const r = await fetch(`${API}/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': chave(), Accept: 'application/json' },
      body: form,
      signal: controle.signal
    });
    const texto = await r.text();
    let dados = null;
    try {dados = JSON.parse(texto);} catch (e) {}
    if (!r.ok) {
      const detalhe = dados && dados.detail;
      const motivo = typeof detalhe === 'string' ? detalhe :
      detalhe && (detalhe.message || detalhe.status) || `HTTP ${r.status}`;
      if (r.status === 401) throw new Error('ElevenLabs: chave recusada. Confira ELEVENLABS_API_KEY.');
      if (r.status === 429) throw new Error('ElevenLabs: limite ou créditos esgotados. Confira a conta.');
      throw new Error(`ElevenLabs: ${motivo}`);
    }
    return String(dados && dados.text || '').trim();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('A ElevenLabs demorou demais para transcrever. Tente de novo.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  chave,
  modelo,
  configurado,
  statusPublico,
  normalizarAjustes,
  vozValida,
  carregarVozes,
  sintetizar,
  transcrever,
  VOZES_PADRAO
};
