// ==================== ROTAS DE AVALIAÇÕES DO PRONTUÁRIO ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// Gera ID único sem dependência externa
function generateId() {
  return 'aval_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Helper: garante que a tabela existe e tem todas as colunas
function ensureTable(db, callback) {
  db.run(`
    CREATE TABLE IF NOT EXISTS avaliacoes_prontuario (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      data VARCHAR(20),
      procedimentoId VARCHAR(191),
      procedimentoNome VARCHAR(500),
      complemento TEXT,
      valor REAL DEFAULT 0,
      tempo INTEGER DEFAULT 0,
      profissionalId VARCHAR(191),
      profissionalNome VARCHAR(500),
      assinaturaBase64 LONGTEXT,
      assinadoEm VARCHAR(50),
      bloqueado TINYINT(1) DEFAULT 0,
      criadoEm VARCHAR(50)
    )
  `, (createErr) => {
    if (createErr) {
      console.error('❌ Erro ao criar tabela avaliacoes_prontuario:', createErr);
    }
    // Sempre tenta adicionar colunas que podem estar faltando (migração segura)
    const migrations = [
    `ALTER TABLE avaliacoes_prontuario ADD COLUMN bloqueado TINYINT(1) DEFAULT 0`,
    `ALTER TABLE avaliacoes_prontuario ADD COLUMN assinaturaBase64 LONGTEXT`,
    `ALTER TABLE avaliacoes_prontuario ADD COLUMN assinadoEm VARCHAR(50)`];

    let pending = migrations.length;
    if (pending === 0) {if (callback) callback(null);return;}
    migrations.forEach((sql) => {
      db.run(sql, (alterErr) => {
        // Ignora erro de coluna duplicada (já existe)
        if (alterErr && !alterErr.message.includes('Duplicate column')) {
          console.warn('⚠️ Migration avaliacoes_prontuario:', alterErr.message);
        }
        pending--;
        if (pending === 0) {
          if (callback) callback(null);
        }
      });
    });
  });
}

// GET /api/avaliacoes-prontuario
router.get('/', (req, res) => {
  const { clinicaId, consultaId, pacienteId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  ensureTable(db, () => {
    let sql = 'SELECT * FROM avaliacoes_prontuario';
    const params = [];
    const conditions = [];

    if (consultaId) {
      conditions.push('consultaId = ?');
      params.push(consultaId);
    }
    if (pacienteId) {
      conditions.push('pacienteId = ?');
      params.push(pacienteId);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' OR ');
    }
    sql += ' ORDER BY data ASC, criadoEm ASC';

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar avaliacoes_prontuario:', err);
        return res.status(500).json({ error: err.message });
      }
      // Normaliza bloqueado para boolean
      const normalized = (rows || []).map((r) => ({ ...r, bloqueado: !!r.bloqueado }));
      res.json(normalized);
    });
  });
});

// POST /api/avaliacoes-prontuario
router.post('/', (req, res) => {
  const { clinicaId, consultaId, pacienteId, data, procedimentoId, procedimentoNome, complemento, valor, tempo, profissionalId, profissionalNome } = req.body;
  if (!clinicaId || !consultaId || !pacienteId) {
    return res.status(400).json({ error: 'clinicaId, consultaId e pacienteId são obrigatórios' });
  }

  const db = getClinicaDB(clinicaId);
  const id = generateId();
  const criadoEm = new Date().toISOString();

  ensureTable(db, () => {
    db.run(
      `INSERT INTO avaliacoes_prontuario (id, consultaId, pacienteId, data, procedimentoId, procedimentoNome, complemento, valor, tempo, profissionalId, profissionalNome, assinaturaBase64, assinadoEm, bloqueado, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', 0, ?)`,
      [id, consultaId, pacienteId, data || new Date().toISOString().split('T')[0], procedimentoId || '', procedimentoNome || '', complemento || '', valor || 0, tempo || 0, profissionalId || '', profissionalNome || '', criadoEm],
      function (err) {
        if (err) {
          console.error('❌ Erro ao inserir avaliacoes_prontuario:', err);
          return res.status(500).json({ error: err.message });
        }
        res.json({ id, consultaId, pacienteId, data, procedimentoId, procedimentoNome, complemento, valor: valor || 0, tempo: tempo || 0, profissionalId, profissionalNome, assinaturaBase64: '', assinadoEm: '', bloqueado: false, criadoEm });
      }
    );
  });
});

// PUT /api/avaliacoes-prontuario/:id
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId, data, procedimentoId, procedimentoNome, complemento, valor, tempo, profissionalId, profissionalNome, assinaturaBase64, assinadoEm, bloqueado } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  ensureTable(db, () => {
    db.run(
      `UPDATE avaliacoes_prontuario SET data=?, procedimentoId=?, procedimentoNome=?, complemento=?, valor=?, tempo=?, profissionalId=?, profissionalNome=?, assinaturaBase64=?, assinadoEm=?, bloqueado=? WHERE id=?`,
      [data, procedimentoId || '', procedimentoNome || '', complemento || '', valor || 0, tempo || 0, profissionalId || '', profissionalNome || '', assinaturaBase64 || '', assinadoEm || '', bloqueado ? 1 : 0, id],
      function (err) {
        if (err) {
          console.error('❌ Erro ao atualizar avaliacoes_prontuario:', err);
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Avaliação não encontrada' });
        res.json({ success: true, id, data, procedimentoId, procedimentoNome, complemento, valor, tempo, profissionalId, profissionalNome, assinaturaBase64, assinadoEm, bloqueado: !!bloqueado });
      }
    );
  });
});

// PATCH /api/avaliacoes-prontuario/:id/assinatura
router.patch('/:id/assinatura', (req, res) => {
  const { id } = req.params;
  const { clinicaId, assinaturaBase64 } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const assinadoEm = new Date().toISOString();

  ensureTable(db, () => {
    db.run(
      `UPDATE avaliacoes_prontuario SET assinaturaBase64=?, assinadoEm=? WHERE id=?`,
      [assinaturaBase64 || '', assinadoEm, id],
      function (err) {
        if (err) {
          console.error('❌ Erro ao salvar assinatura:', err);
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Avaliação não encontrada' });
        res.json({ success: true, assinadoEm });
      }
    );
  });
});

// DELETE /api/avaliacoes-prontuario/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  ensureTable(db, () => {
    db.run('DELETE FROM avaliacoes_prontuario WHERE id=?', [id], function (err) {
      if (err) {
        console.error('❌ Erro ao deletar avaliacoes_prontuario:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    });
  });
});

module.exports = router;