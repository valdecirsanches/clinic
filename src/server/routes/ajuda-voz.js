// ==================== AJUDA POR VOZ (ELEVENLABS) ====================
// Cada tela do sistema tem um texto de ajuda (server/ajuda/ajudaTelas.json).
// O super admin escolhe, nas Configurações Globais, se a ajuda é narrada e
// com qual voz da ElevenLabs. Os usuários só pedem "fale o tópico X": o
// servidor monta o texto a partir do catálogo, gera o MP3 UMA vez e guarda
// em disco (server/cache/ajuda-voz). Os pedidos seguintes saem do cache, sem
// gastar cota.
//
// Configuração guardada em configuracoes_globais, chave `ajuda_voz`:
//   { ativo, vozId, vozNome, ajustes: { estabilidade, similaridade, estilo, velocidade } }
// A chave da ElevenLabs continua só no server/.env.local (ELEVENLABS_API_KEY).

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { exigirSuperAdmin, lerCorpoTexto } = require('../services/superAdmin');
const elevenLabs = require('../services/elevenLabs');
const { buscarTopico, textoNarracao } = require('../ajuda/catalogo');
const { lerConfig, gravarConfig, normalizarConfig } = require('../ajuda/configVoz');

router.use(lerCorpoTexto);

const PASTA_CACHE = process.env.AJUDA_VOZ_CACHE_DIR ||
path.join(__dirname, '..', 'cache', 'ajuda-voz');
const FRASE_TESTE = 'Olá! Esta é a voz que vai explicar as telas do EasyClin para a sua equipe.';

// ---------- cache em disco ----------

function nomeCache(vozId, ajustes, texto) {
  const assinatura = JSON.stringify([vozId, elevenLabs.modelo(), ajustes, texto]);
  return `${crypto.createHash('sha256').update(assinatura).digest('hex').slice(0, 40)}.mp3`;
}

// Pedidos simultâneos do mesmo áudio esperam a MESMA geração.
const emAndamento = new Map();

async function obterAudio(vozId, ajustes, texto) {
  const arquivo = path.join(PASTA_CACHE, nomeCache(vozId, ajustes, texto));
  try {
    return { audio: await fs.promises.readFile(arquivo), doCache: true };
  } catch (e) {/* ainda não gerado */}

  if (!emAndamento.has(arquivo)) {
    const tarefa = (async () => {
      const audio = await elevenLabs.sintetizar(vozId, texto, ajustes);
      try {
        await fs.promises.mkdir(PASTA_CACHE, { recursive: true });
        const temporario = `${arquivo}.${process.pid}.tmp`;
        await fs.promises.writeFile(temporario, audio);
        await fs.promises.rename(temporario, arquivo);
      } catch (err) {
        console.warn('🎙️ ⚠️ [ajuda-voz] Não foi possível guardar o áudio em cache:', err.message);
      }
      return audio;
    })();
    emAndamento.set(arquivo, tarefa);
    tarefa.finally(() => emAndamento.delete(arquivo)).catch(() => {});
  }
  return { audio: await emAndamento.get(arquivo), doCache: false };
}

function enviarAudio(res, audio, doCache) {
  res.set('Content-Type', 'audio/mpeg');
  res.set('Cache-Control', 'private, max-age=86400');
  res.set('X-Ajuda-Cache', doCache ? 'sim' : 'nao');
  res.send(audio);
}

function statusErro(err) {
  return /^ElevenLabs:/.test(err.message) ? 400 : 502;
}

// ---------- rotas ----------

// GET /api/ajuda-voz/config — qualquer usuário logado. Sem segredo nenhum.
router.get('/config', async (req, res) => {
  const config = await lerConfig();
  res.json({
    ativo: config.ativo && elevenLabs.configurado(),
    vozNome: config.vozNome || null
  });
});

// GET /api/ajuda-voz/admin — configuração completa (super admin)
router.get('/admin', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  res.json({ config: await lerConfig(), elevenLabs: elevenLabs.statusPublico() });
});

// POST /api/ajuda-voz/admin — grava a configuração (super admin)
router.post('/admin', async (req, res) => {
  const usuario = await exigirSuperAdmin(req, res);
  if (!usuario) return;
  const corpo = req.body || {};
  if (corpo.ativo && !elevenLabs.vozValida(corpo.vozId)) {
    return res.status(400).json({ error: 'Escolha uma voz antes de ativar a ajuda por voz.' });
  }
  const config = normalizarConfig(corpo);
  try {
    await gravarConfig(config);
    console.log(`🎙️ [ajuda-voz] Configuração salva por ${usuario.email}: ${config.ativo ? `ativa, voz ${config.vozNome || config.vozId}` : 'desativada'}`);
    res.json({ config });
  } catch (err) {
    console.error('❌ [ajuda-voz] Erro ao salvar configuração:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ajuda-voz/vozes — vozes da conta ElevenLabs (super admin)
router.get('/vozes', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  if (!elevenLabs.configurado()) {
    return res.status(400).json({ error: 'Defina ELEVENLABS_API_KEY no server/.env.local e reinicie o servidor.' });
  }
  res.json(await elevenLabs.carregarVozes({ forcar: req.query.atualizar === '1' }));
});

// POST /api/ajuda-voz/teste — ouve uma voz antes de salvar (super admin)
router.post('/teste', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  if (!elevenLabs.configurado()) {
    return res.status(400).json({ error: 'Defina ELEVENLABS_API_KEY no server/.env.local e reinicie o servidor.' });
  }
  const { vozId, ajustes } = req.body || {};
  if (!elevenLabs.vozValida(vozId)) return res.status(400).json({ error: 'Voz inválida' });
  try {
    const { audio, doCache } = await obterAudio(vozId, elevenLabs.normalizarAjustes(ajustes), FRASE_TESTE);
    enviarAudio(res, audio, doCache);
  } catch (err) {
    res.status(statusErro(err)).json({ error: err.message });
  }
});

// POST /api/ajuda-voz/falar { topico } → audio/mpeg (usuário logado)
router.post('/falar', async (req, res) => {
  const topico = buscarTopico(req.body && req.body.topico);
  if (!topico) return res.status(404).json({ error: 'Tópico de ajuda não encontrado.' });
  const config = await lerConfig();
  if (!config.ativo) return res.status(409).json({ error: 'A ajuda por voz está desativada.' });
  if (!elevenLabs.configurado()) {
    return res.status(503).json({ error: 'A voz da ajuda não está disponível no servidor.' });
  }
  try {
    const { audio, doCache } = await obterAudio(config.vozId, config.ajustes, textoNarracao(topico));
    enviarAudio(res, audio, doCache);
  } catch (err) {
    console.error(`❌ [ajuda-voz] Falha ao narrar "${topico.id}":`, err.message);
    res.status(statusErro(err)).json({ error: err.message });
  }
});

module.exports = router;
// Para testes
module.exports._interno = { normalizarConfig, nomeCache };
