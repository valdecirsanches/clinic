// ============ VÍDEO DE DEMONSTRAÇÃO — NARRAÇÃO ELEVENLABS (SUPER ADMIN) ============
// Chave e modelo da ElevenLabs: ver services/elevenLabs.js. No .env.local:
//   DEMO_CLINICA_ID=c123...                   (clínica com dados fictícios
//                                              liberada para gravação)
// A chave NUNCA vai ao navegador: a tela pede o áudio e o servidor o gera.

const express = require('express');
const router = express.Router();
const { exigirSuperAdmin, lerCorpoTexto } = require('../services/superAdmin');

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

const elevenLabs = require('../services/elevenLabs');

router.get('/status', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  res.json({
    elevenLabs: elevenLabs.statusPublico(),
    demoClinicaId: String(process.env.DEMO_CLINICA_ID || '').trim() || null
  });
});

router.get('/vozes', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  if (!elevenLabs.configurado()) {
    return res.status(400).json({ error: 'Defina ELEVENLABS_API_KEY no server/.env.local' });
  }
  res.json(await elevenLabs.carregarVozes());
});

// POST /api/video-demo/narracao → audio/mpeg
router.post('/narracao', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  if (!elevenLabs.configurado()) {
    return res.status(400).json({ error: 'Defina ELEVENLABS_API_KEY no server/.env.local' });
  }
  const { voiceId, texto, ajustes = {} } = req.body || {};
  const fala = String(texto || '').trim();
  if (!elevenLabs.vozValida(voiceId)) {
    return res.status(400).json({ error: 'Voz inválida' });
  }
  if (!fala) return res.status(400).json({ error: 'Texto vazio' });
  if (fala.length > 2500) return res.status(400).json({ error: 'Texto acima de 2.500 caracteres por cena' });

  try {
    const audio = await elevenLabs.sintetizar(voiceId, fala, ajustes);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'no-store');
    res.send(audio);
  } catch (err) {
    const status = /^ElevenLabs:/.test(err.message) ? 400 : 502;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
