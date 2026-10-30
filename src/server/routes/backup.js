// ============ BACKUP DAS CLÍNICAS (SUPER ADMIN) ============
//   GET  /api/backup                       → config, próxima execução, histórico
//   POST /api/backup/config                → salva pasta/horário/dias/clínicas/retenção
//   POST /api/backup/executar {clinicaId?} → executa agora (em segundo plano)
//   GET  /api/backup/arquivos?clinicaId=   → arquivos existentes
//   GET  /api/backup/download?clinicaId=&nome= → baixa um arquivo

const express = require('express');
const router = express.Router();
const backup = require('../services/backupClinica');
const dbGlobal = require('../databaseGlobal');
const { exigirSuperAdmin, lerCorpoTexto } = require('../services/superAdmin');

router.use(lerCorpoTexto);

router.get('/', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  try {
    const config = await backup.lerConfig();
    const clinicas = await dbGlobal.prepare('SELECT id, nome FROM clinicas WHERE ativa = 1 ORDER BY nome').all();
    let pasta = { ok: false, livreBytes: null, erro: null };
    if (config.pasta) {
      try {
        pasta = { ok: true, ...backup.verificarPasta(config.pasta), erro: null };
      } catch (err) {
        pasta = { ok: false, livreBytes: null, erro: err.message };
      }
    }
    res.json({
      config,
      pasta,
      proximaExecucao: backup.proximaExecucao(config),
      emExecucao: backup.clinicasEmExecucao(),
      clinicas: clinicas || [],
      historico: (await backup.lerHistorico()).slice(0, 50),
      horaServidor: new Date().toString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  try {
    const { usuarioId, ...entrada } = req.body || {};
    const config = await backup.salvarConfig(entrada);
    res.json({ config, proximaExecucao: backup.proximaExecucao(config) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/executar', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  const clinicaId = req.body && req.body.clinicaId || null;
  try {
    const config = await backup.lerConfig();
    if (!config.pasta) return res.status(400).json({ error: 'Configure e salve a pasta de destino antes de executar.' });
    backup.verificarPasta(config.pasta);
  } catch (err) {
    return res.status(400).json({ error: `Pasta inacessível: ${err.message}` });
  }
  // Responde já: backups grandes passam do tempo limite do proxy
  res.status(202).json({ iniciado: true });
  backup.executarRotina('manual', clinicaId).catch((err) =>
  console.error(`💾 ❌ [backup] Execução manual: ${err.message}`)
  );
});

router.get('/arquivos', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  try {
    const config = await backup.lerConfig();
    res.json(backup.listarArquivos(config.pasta, String(req.query.clinicaId || '')));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/download', async (req, res) => {
  if (!(await exigirSuperAdmin(req, res))) return;
  const config = await backup.lerConfig();
  const alvo = backup.caminhoArquivo(config.pasta, String(req.query.clinicaId || ''), String(req.query.nome || ''));
  if (!alvo) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  res.download(alvo);
});

backup.iniciarAgendador();

module.exports = router;