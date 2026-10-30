
// ==================== ROTAS DE LOG DE AUDITORIA (LGPD) ====================
// Registra quem acessou, quando, onde e o que fez no prontuário
// Exigência: Resolução CFM 2.299/2021 + LGPD (Lei 13.709/2018)

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// ==================== HELPER: Garante que a tabela existe ====================
async function garantirTabela(db) {
  return new Promise((resolve) => {
    db.run(`CREATE TABLE IF NOT EXISTS audit_log (
      id VARCHAR(191) PRIMARY KEY,
      usuarioId VARCHAR(191) NOT NULL,
      usuarioNome VARCHAR(255) NOT NULL,
      usuarioTipo VARCHAR(50),
      acao VARCHAR(50) NOT NULL,
      entidade VARCHAR(100) NOT NULL,
      entidadeId VARCHAR(191),
      pacienteId VARCHAR(191),
      pacienteNome VARCHAR(255),
      detalhes TEXT,
      ip VARCHAR(50),
      criadoEm VARCHAR(50) NOT NULL
    )`, [], (err) => {
      if (err) console.warn('⚠️ [AuditLog] Tabela já existe ou erro:', err.message);
      resolve();
    });
  });
}

// ==================== POST /api/audit-log ====================
// Registra uma ação de auditoria
router.post('/', async (req, res) => {
  const {
    clinicaId,
    usuarioId,
    usuarioNome,
    usuarioTipo,
    acao,
    entidade,
    entidadeId,
    pacienteId,
    pacienteNome,
    detalhes
  } = req.body;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!usuarioId) return res.status(400).json({ error: 'usuarioId é obrigatório' });
  if (!acao) return res.status(400).json({ error: 'acao é obrigatória' });
  if (!entidade) return res.status(400).json({ error: 'entidade é obrigatória' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Captura IP do cliente
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection?.remoteAddress || '';

  try {
    await garantirTabela(db);

    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO audit_log (id, usuarioId, usuarioNome, usuarioTipo, acao, entidade, entidadeId, pacienteId, pacienteNome, detalhes, ip, criadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, usuarioId, usuarioNome || '', usuarioTipo || '', acao, entidade, entidadeId || null, pacienteId || null, pacienteNome || null, detalhes || null, ip, agora],
        (err) => {
          if (err) reject(err);else
          resolve();
        }
      );
    });

    res.json({ success: true, id });
  } catch (err) {
    console.error('❌ [AuditLog] Erro ao registrar:', err);
    // Não retorna erro 500 — auditoria não deve bloquear o fluxo principal
    res.json({ success: false, error: err.message });
  }
});

// ==================== GET /api/audit-log ====================
// Consulta logs de auditoria com filtros
// Query params: clinicaId, pacienteId, usuarioId, entidade, acao, dataInicio, dataFim, limit, offset
router.get('/', async (req, res) => {
  const { clinicaId, pacienteId, usuarioId, entidade, acao, dataInicio, dataFim, limit, offset } = req.query;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  try {
    await garantirTabela(db);

    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];

    if (pacienteId) {
      query += ' AND pacienteId = ?';
      params.push(pacienteId);
    }

    if (usuarioId) {
      query += ' AND usuarioId = ?';
      params.push(usuarioId);
    }

    if (entidade) {
      query += ' AND entidade = ?';
      params.push(entidade);
    }

    if (acao) {
      query += ' AND acao = ?';
      params.push(acao);
    }

    if (dataInicio) {
      query += ' AND criadoEm >= ?';
      params.push(dataInicio);
    }

    if (dataFim) {
      query += ' AND criadoEm <= ?';
      params.push(dataFim);
    }

    query += ' ORDER BY criadoEm DESC';

    const limitNum = parseInt(limit) || 100;
    const offsetNum = parseInt(offset) || 0;
    query += ` LIMIT ${limitNum} OFFSET ${offsetNum}`;

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('❌ [AuditLog] Erro ao consultar:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(rows || []);
    });
  } catch (err) {
    console.error('❌ [AuditLog] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET /api/audit-log/stats ====================
// Estatísticas de auditoria para um paciente
router.get('/stats', async (req, res) => {
  const { clinicaId, pacienteId } = req.query;

  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  try {
    await garantirTabela(db);

    let query = `
      SELECT 
        acao,
        COUNT(*) as total,
        MAX(criadoEm) as ultimaVez
      FROM audit_log
      WHERE 1=1
    `;
    const params = [];

    if (pacienteId) {
      query += ' AND pacienteId = ?';
      params.push(pacienteId);
    }

    query += ' GROUP BY acao ORDER BY total DESC';

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('❌ [AuditLog] Erro ao buscar stats:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(rows || []);
    });
  } catch (err) {
    console.error('❌ [AuditLog] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;