// ============ VÍDEO DE DEMONSTRAÇÃO — NARRAÇÃO ELEVENLABS (SUPER ADMIN) ============
// Configuração FIXA no server/.env.local:
//   ELEVENLABS_API_KEY=sk_...
//   ELEVENLABS_MODEL=eleven_multilingual_v2   (opcional)
//   DEMO_CLINICA_ID=c123...                   (clínica com dados fictícios
//                                              liberada para gravação)
// A chave NUNCA vai ao navegador: a tela pede o áudio e o servidor o gera.

const express = require('express');
const router = express.Router();
const { exigirSuperAdmin, lerCorpoTexto } = require('../services/superAdmin');
const { requisitar, motivoErro, marcarSegredo } = require('../services/httpJson');

// POST /api/video-demo/converter-mp4 — recebe o WebM gravado e devolve MP4.
// Declarada ANTES do leitor de texto: o corpo é binário (vai como text/plain
// só para evitar o preflight que o proxy não repassa).
router.post(
  '/converter-mp4',
  express.raw({ type: () => true, limit: '1gb' }),
  async (req, res) => {
    if (!(await exigirSuperAdmin(req, res))) return;
    const corpo = req.body;
    if (!Buffer.isBuffer(corpo) || corpo.length < 1024) {
      return res.status(400).json({ error: 'Vídeo não recebido pelo servidor.' });
    }
    const fs = require('fs');
    let saida = null;
    try {
      console.log(`🎬 [Vídeo] Convertendo ${(corpo.length / 1048576).toFixed(1)} MB de WebM para MP4...`);
      saida = await require('../services/conversorMp4').converter(corpo);
      const tamanho = fs.statSync(saida).size;
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', String(tamanho));
      res.setHeader('Content-Disposition', 'attachment; filename="apresentacao-easyclin.mp4"');
      const leitura = fs.createReadStream(saida);
      const limpar = () => saida && fs.rm(saida, { force: true }, () => {});
      leitura.on('error', limpar);
      res.on('close', limpar);
      leitura.pipe(res);
      console.log(`🎬 [Vídeo] MP4 pronto: ${(tamanho / 1048576).toFixed(1)} MB`);
    } catch (err) {
      if (saida) fs.rm(saida, { force: true }, () => {});
      console.error('❌ [Vídeo] Conversão MP4:', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  }
);

router.use(lerCorpoTexto);

const API = 'https://api.elevenlabs.io/v1';

function chave() {
  return String(process.env.ELEVENLABS_API_KEY || '').trim();
}

function modelo() {
  return String(process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2').trim();
}

function limitar(valor, min, max, padrao) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

router.get('/status', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  res.json({
    elevenLabs: { configurado: Boolean(chave()), chave: marcarSegredo(chave()), modelo: modelo() },
    demoClinicaId: String(process.env.DEMO_CLINICA_ID || '').trim() || null
  });
});

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

async function carregarVozes() {
  const k = chave();
  if (cacheVozes && cacheVozes.chave === k) return cacheVozes.vozes;
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
    console.warn(`🎙️ ⚠️ [video-demo] Lista de vozes da conta indisponível (${aviso || 'vazia'}); usando as vozes padrão.`);
    vozes = VOZES_PADRAO;
  }
  cacheVozes = { chave: k, vozes };
  return vozes;
}

router.get('/vozes', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  if (!chave()) {
    return res.status(400).json({ error: 'Defina ELEVENLABS_API_KEY no server/.env.local' });
  }
  res.json(await carregarVozes());
});

// POST /api/video-demo/narracao → audio/mpeg
router.post('/narracao', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  if (!chave()) {
    return res.status(400).json({ error: 'Defina ELEVENLABS_API_KEY no server/.env.local' });
  }
  const { voiceId, texto, ajustes = {} } = req.body || {};
  const fala = String(texto || '').trim();
  if (!voiceId || !/^[A-Za-z0-9]+$/.test(String(voiceId))) {
    return res.status(400).json({ error: 'Voz inválida' });
  }
  if (!fala) return res.status(400).json({ error: 'Texto vazio' });
  if (fala.length > 2500) return res.status(400).json({ error: 'Texto acima de 2.500 caracteres por cena' });

  try {
    const resposta = await requisitar(
      `${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': chave(), Accept: 'audio/mpeg' },
        body: {
          text: fala,
          model_id: modelo(),
          voice_settings: {
            stability: limitar(ajustes.estabilidade, 0, 1, 0.5),
            similarity_boost: limitar(ajustes.similaridade, 0, 1, 0.75),
            style: limitar(ajustes.estilo, 0, 1, 0.2),
            speed: limitar(ajustes.velocidade, 0.7, 1.2, 1),
            use_speaker_boost: true
          }
        },
        binario: true,
        timeoutMs: 60000
      }
    );
    if (!resposta.ok || !resposta.buffer) {
      return res.status(400).json({ error: `ElevenLabs: ${motivoErro(resposta)}` });
    }
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(resposta.buffer);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;