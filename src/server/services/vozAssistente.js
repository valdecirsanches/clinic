// ==================== VOZ DO ASSISTENTE (OUVIR E FALAR) ====================
// O assistente tem três partes: OUVIR (fala → texto), ENTENDER (modelo de
// linguagem, assistenteOpenAI.js) e FALAR (texto → voz). Ouvir e falar usam
// a ElevenLabs quando ELEVENLABS_API_KEY está definida; senão, a OpenAI.
// Para forçar: ASSISTENTE_VOZ=elevenlabs | openai.
//
// A voz é a mesma da ajuda das telas (escolhida pelo super admin em
// Configurações Globais → Ajuda por voz). Sem voz escolhida, usa
// ELEVENLABS_VOZ_ASSISTENTE ou a voz padrão (Sarah).

const elevenLabs = require('./elevenLabs');
const IA = require('./assistenteOpenAI');
const { lerConfig } = require('../ajuda/configVoz');

const VOZ_PADRAO_ELEVENLABS = 'EXAVITQu4vr4xnSDxMaL'; // Sarah (multilíngue)

/** 'elevenlabs' | 'openai' | null (nenhum configurado) */
function provedor() {
  const pedido = String(process.env.ASSISTENTE_VOZ || '').trim().toLowerCase();
  if (pedido === 'openai') return IA.configurado() ? 'openai' : null;
  if (pedido === 'elevenlabs') return elevenLabs.configurado() ? 'elevenlabs' : null;
  if (elevenLabs.configurado()) return 'elevenlabs';
  if (IA.configurado()) return 'openai';
  return null;
}

async function vozEscolhida() {
  const config = await lerConfig();
  if (config.vozId) return { vozId: config.vozId, ajustes: config.ajustes };
  const doEnv = String(process.env.ELEVENLABS_VOZ_ASSISTENTE || '').trim();
  return {
    vozId: elevenLabs.vozValida(doEnv) ? doEnv : VOZ_PADRAO_ELEVENLABS,
    ajustes: config.ajustes
  };
}

async function transcrever(audioBase64, mime, contexto = 'agenda') {
  const p = provedor();
  if (p === 'elevenlabs') {
    return elevenLabs.transcrever(Buffer.from(String(audioBase64 || ''), 'base64'), mime);
  }
  if (p === 'openai') return IA.transcrever(audioBase64, mime, contexto);
  throw new Error('Nenhum serviço de voz configurado: defina ELEVENLABS_API_KEY no server/.env.local.');
}

async function falar(texto) {
  const p = provedor();
  if (p === 'elevenlabs') {
    const limpo = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    if (!limpo) throw new Error('Nada para falar.');
    const { vozId, ajustes } = await vozEscolhida();
    try {
      const audio = await elevenLabs.sintetizar(vozId, limpo, ajustes);
      return { audioBase64: audio.toString('base64'), mime: 'audio/mpeg' };
    } catch (err) {
      // Créditos da ElevenLabs acabaram etc.: se houver OpenAI, a resposta ainda sai falada.
      if (IA.configurado() && !process.env.ASSISTENTE_VOZ) {
        console.warn('🔊 ⚠️ [assistente] ElevenLabs falhou, usando a voz da OpenAI:', err.message);
        return IA.falar(limpo);
      }
      throw err;
    }
  }
  if (p === 'openai') return IA.falar(texto);
  throw new Error('Nenhum serviço de voz configurado: defina ELEVENLABS_API_KEY no server/.env.local.');
}

module.exports = { provedor, transcrever, falar, VOZ_PADRAO_ELEVENLABS };
