
// ==================== ROTAS DE SESSÕES DE USUÁRIOS (MySQL) ====================
// Rastreia quem está conectado, quando conectou, última atividade
// Usa a API do databaseGlobal: dbGlobal.prepare(sql).get/all/run(...params)

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');

// ==================== INICIALIZAÇÃO DA TABELA ====================
let tabelaCriada = false;

async function garantirTabela() {
  if (tabelaCriada) return;
  try {
    await dbGlobal.prepare(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        usuarioId VARCHAR(191) NOT NULL,
        usuarioNome VARCHAR(255),
        usuarioEmail VARCHAR(255),
        usuarioTipo VARCHAR(50),
        clinicaId VARCHAR(191),
        clinicaNome VARCHAR(255),
        operadoraId VARCHAR(191),
        operadoraNome VARCHAR(255),
        loginEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ultimaAtividade DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        logoutEm DATETIME,
        ip VARCHAR(100),
        userAgent TEXT,
        ativo TINYINT(1) DEFAULT 1,
        INDEX idx_sessions_usuario (usuarioId),
        INDEX idx_sessions_ativo (ativo),
        INDEX idx_sessions_ultima (ultimaAtividade),
        INDEX idx_sessions_login (loginEm)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).run();
    tabelaCriada = true;
    console.log('✅ [Sessions] Tabela user_sessions verificada/criada');
  } catch (err) {
    if (!err.message.includes('Duplicate')) {
      console.error('❌ [Sessions] Erro ao criar tabela:', err.message);
    }
    tabelaCriada = true; // Assume que já existe
  }
}

// ==================== POST /api/sessions/login ====================
router.post('/login', async (req, res) => {
  try {
    await garantirTabela();
    const { usuarioId, usuarioNome, usuarioEmail, usuarioTipo, clinicaId, clinicaNome, operadoraId, operadoraNome } = req.body;

    if (!usuarioId) {
      return res.status(400).json({ error: 'usuarioId obrigatório' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    // Marca sessões anteriores do mesmo usuário como inativas
    await dbGlobal.prepare(
      `UPDATE user_sessions SET ativo = 0, logoutEm = NOW() WHERE usuarioId = ? AND ativo = 1`
    ).run(usuarioId);

    // Cria nova sessão
    const result = await dbGlobal.prepare(
      `INSERT INTO user_sessions (usuarioId, usuarioNome, usuarioEmail, usuarioTipo, clinicaId, clinicaNome, operadoraId, operadoraNome, loginEm, ultimaAtividade, ip, userAgent, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, 1)`
    ).run(usuarioId, usuarioNome || '', usuarioEmail || '', usuarioTipo || '', clinicaId || null, clinicaNome || null, operadoraId || null, operadoraNome || null, ip, userAgent);

    console.log(`🔐 [Sessions] Login registrado: ${usuarioNome} (${usuarioTipo})`);
    res.json({ success: true, sessionId: result?.lastInsertRowid });
  } catch (err) {
    console.error('❌ [Sessions] Erro ao registrar login:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== POST /api/sessions/heartbeat ====================
router.post('/heartbeat', async (req, res) => {
  try {
    await garantirTabela();
    const { usuarioId, usuarioNome, usuarioEmail, usuarioTipo, clinicaId, clinicaNome, operadoraId, operadoraNome } = req.body;

    if (!usuarioId) {
      return res.status(400).json({ error: 'usuarioId obrigatório' });
    }

    // Busca sessão ativa mais recente
    const sessaoAtiva = await dbGlobal.prepare(
      `SELECT id FROM user_sessions WHERE usuarioId = ? AND ativo = 1 ORDER BY loginEm DESC LIMIT 1`
    ).get(usuarioId);

    if (sessaoAtiva) {
      // Atualiza última atividade, clínica e operadora atuais
      await dbGlobal.prepare(
        `UPDATE user_sessions SET ultimaAtividade = NOW(), clinicaId = COALESCE(?, clinicaId), clinicaNome = COALESCE(?, clinicaNome), operadoraId = COALESCE(?, operadoraId), operadoraNome = COALESCE(?, operadoraNome) WHERE id = ?`
      ).run(clinicaId || null, clinicaNome || null, operadoraId || null, operadoraNome || null, sessaoAtiva.id);
    } else {
      // Não tem sessão ativa — cria uma (reconexão após restart do servidor)
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';
      await dbGlobal.prepare(
        `INSERT INTO user_sessions (usuarioId, usuarioNome, usuarioEmail, usuarioTipo, clinicaId, clinicaNome, operadoraId, operadoraNome, loginEm, ultimaAtividade, ip, userAgent, ativo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, 1)`
      ).run(usuarioId, usuarioNome || '', usuarioEmail || '', usuarioTipo || '', clinicaId || null, clinicaNome || null, operadoraId || null, operadoraNome || null, ip, userAgent);
      console.log(`🔐 [Sessions] Sessão recriada via heartbeat: ${usuarioNome}`);
    }

    res.json({ success: true });
  } catch (err) {
    // Heartbeat silencioso - não deve bloquear o uso
    console.error('⚠️ [Sessions] Erro no heartbeat:', err.message);
    res.json({ success: false });
  }
});

// ==================== POST /api/sessions/logout ====================
router.post('/logout', async (req, res) => {
  try {
    await garantirTabela();
    const { usuarioId } = req.body;

    if (!usuarioId) {
      return res.status(400).json({ error: 'usuarioId obrigatório' });
    }

    await dbGlobal.prepare(
      `UPDATE user_sessions SET ativo = 0, logoutEm = NOW() WHERE usuarioId = ? AND ativo = 1`
    ).run(usuarioId);

    console.log(`🔐 [Sessions] Logout registrado: ${usuarioId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('⚠️ [Sessions] Erro no logout:', err.message);
    res.json({ success: false });
  }
});

// ==================== GET /api/sessions ====================
router.get('/', async (req, res) => {
  try {
    await garantirTabela();
    const { filtro } = req.query; // 'agora', 'hoje', 'semana', 'mes'

    let whereClause = '';
    switch (filtro) {
      case 'agora':
        whereClause = `WHERE ultimaAtividade >= DATE_SUB(NOW(), INTERVAL 2 MINUTE) AND ativo = 1`;
        break;
      case 'hoje':
        whereClause = `WHERE DATE(loginEm) = CURDATE()`;
        break;
      case 'semana':
        whereClause = `WHERE loginEm >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
        break;
      case 'mes':
        whereClause = `WHERE loginEm >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
        break;
      default:
        whereClause = `WHERE loginEm >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
    }

    const sessions = await dbGlobal.prepare(
      `SELECT id, usuarioId, usuarioNome, usuarioEmail, usuarioTipo, 
              clinicaId, clinicaNome, operadoraId, operadoraNome,
              loginEm, ultimaAtividade, logoutEm, ip, ativo,
              CASE WHEN ultimaAtividade >= DATE_SUB(NOW(), INTERVAL 2 MINUTE) AND ativo = 1 
                   THEN 1 ELSE 0 END AS \`online\`
       FROM user_sessions
       ${whereClause}
       ORDER BY ultimaAtividade DESC
       LIMIT 500`
    ).all();

    // Estatísticas
    const stats = await dbGlobal.prepare(
      `SELECT 
        COUNT(DISTINCT CASE WHEN ultimaAtividade >= DATE_SUB(NOW(), INTERVAL 2 MINUTE) AND ativo = 1 THEN usuarioId END) AS onlineAgora,
        COUNT(DISTINCT CASE WHEN DATE(loginEm) = CURDATE() THEN usuarioId END) AS loginHoje,
        COUNT(DISTINCT CASE WHEN loginEm >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN usuarioId END) AS loginSemana,
        COUNT(DISTINCT CASE WHEN loginEm >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN usuarioId END) AS loginMes,
        COUNT(CASE WHEN DATE(loginEm) = CURDATE() THEN 1 END) AS totalSessoesHoje
       FROM user_sessions`
    ).get();

    res.json({
      sessions: sessions || [],
      stats: stats || { onlineAgora: 0, loginHoje: 0, loginSemana: 0, loginMes: 0, totalSessoesHoje: 0 }
    });
  } catch (err) {
    console.error('❌ [Sessions] Erro ao listar sessões:', err.message);
    res.status(500).json({ error: err.message, sessions: [], stats: {} });
  }
});

module.exports = router;