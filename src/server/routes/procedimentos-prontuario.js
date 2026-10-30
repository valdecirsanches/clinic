
// ==================== ROTAS DE PROCEDIMENTOS DO PRONTUÁRIO ====================
// Múltiplos procedimentos por consulta (atendimento)

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// Gera ID único sem dependência externa
function generateId() {
  return 'proc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Helper: garante que a tabela existe (MySQL compatível)
// ⭐ Cache para evitar ALTER TABLE repetido a cada request
const _tabelaVerificada = new Set();

function ensureTable(db, callback) {
  const dbId = db.clinicaId || db._clinicaId || 'default';
  if (_tabelaVerificada.has(dbId)) {
    if (callback) callback(null);
    return;
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS procedimentos_prontuario (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191) NOT NULL,
      pacienteId VARCHAR(191) NOT NULL,
      data VARCHAR(20),
      procedimentoId VARCHAR(191),
      procedimentoNome VARCHAR(500),
      complemento TEXT,
      profissionalId VARCHAR(191),
      profissionalNome VARCHAR(500),
      assinaturaBase64 LONGTEXT,
      assinadoEm VARCHAR(50),
      criadoEm VARCHAR(50),
      bloqueado INTEGER DEFAULT 0
    )
  `, (err) => {
    if (err && err.code !== 'ER_TABLE_EXISTS_ERROR') {
      console.error('❌ Erro ao criar tabela procedimentos_prontuario:', err.message);
    }
    // Tenta adicionar coluna bloqueado (ignora se já existe)
    db.run('ALTER TABLE procedimentos_prontuario ADD COLUMN bloqueado INTEGER DEFAULT 0', (alterErr) => {
      if (alterErr && !alterErr.message?.includes('Duplicate')) {
















        // Ignora erro de coluna duplicada
      }_tabelaVerificada.add(dbId);if (callback) callback(null);});});} // GET /api/procedimentos-prontuario?clinicaId=X&consultaId=Y&pacienteId=Z
router.get('/', (req, res) => {const { clinicaId, consultaId, pacienteId } = req.query;if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });console.log(`🔍 [procedimentos-prontuario] GET clinicaId=${clinicaId} consultaId=${consultaId || 'N/A'} pacienteId=${pacienteId || 'N/A'}`);const db = getClinicaDB(clinicaId);ensureTable(db, () => {let sql = 'SELECT * FROM procedimentos_prontuario';const params = [];
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
        sql += ' ORDER BY data ASC, criadoEm ASC LIMIT 200';

        console.log(`🔍 [procedimentos-prontuario] SQL: ${sql} | params: ${JSON.stringify(params)}`);

        db.all(sql, params, (err, rows) => {
          if (err) {
            console.error('❌ Erro ao buscar procedimentos_prontuario:', err.message);
            return res.status(500).json({ error: err.message });
          }
          console.log(`✅ [procedimentos-prontuario] Retornando ${(rows || []).length} registros`);
          res.json(rows || []);
        });
      });
  });

// POST /api/procedimentos-prontuario - Cria novo procedimento
router.post('/', (req, res) => {
  const { clinicaId, consultaId, pacienteId, data, procedimentoId, procedimentoNome, complemento, profissionalId, profissionalNome } = req.body;
  if (!clinicaId || !consultaId || !pacienteId) {
    return res.status(400).json({ error: 'clinicaId, consultaId e pacienteId são obrigatórios' });
  }

  const db = getClinicaDB(clinicaId);
  const id = generateId();
  const criadoEm = new Date().toISOString();

  ensureTable(db, () => {
    db.run(
      `INSERT INTO procedimentos_prontuario (id, consultaId, pacienteId, data, procedimentoId, procedimentoNome, complemento, profissionalId, profissionalNome, assinaturaBase64, assinadoEm, criadoEm, bloqueado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, 0)`,
      [id, consultaId, pacienteId, data || new Date().toISOString().split('T')[0], procedimentoId || '', procedimentoNome || '', complemento || '', profissionalId || '', profissionalNome || '', criadoEm],
      function (err) {
        if (err) {
          console.error('❌ Erro ao inserir procedimento_prontuario:', err);
          return res.status(500).json({ error: err.message });
        }
        res.json({ id, consultaId, pacienteId, data, procedimentoId, procedimentoNome, complemento, profissionalId, profissionalNome, assinaturaBase64: '', assinadoEm: '', criadoEm, bloqueado: 0 });
      }
    );
  });
});

// PUT /api/procedimentos-prontuario/:id - Atualiza procedimento
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId, data, procedimentoId, procedimentoNome, complemento, profissionalId, profissionalNome, assinaturaBase64, assinadoEm, bloqueado } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  console.log(`💾 [procedimentos-prontuario] PUT id=${id} procedimentoId=${procedimentoId} procedimentoNome=${procedimentoNome} profissionalId=${profissionalId} profissionalNome=${profissionalNome}`);

  const db = getClinicaDB(clinicaId);
  ensureTable(db, () => {
    db.run(
      `UPDATE procedimentos_prontuario SET data=?, procedimentoId=?, procedimentoNome=?, complemento=?, profissionalId=?, profissionalNome=?, assinaturaBase64=?, assinadoEm=?, bloqueado=? WHERE id=?`,
      [data || '', procedimentoId || '', procedimentoNome || '', complemento || '', profissionalId || '', profissionalNome || '', assinaturaBase64 || '', assinadoEm || '', bloqueado ? 1 : 0, id],
      function (err) {
        if (err) {
          console.error('❌ Erro ao atualizar procedimento_prontuario:', err.message);
          return res.status(500).json({ error: err.message });
        }
        const changes = this.changes || this.affectedRows || 0;
        if (changes === 0) {
          console.error(`❌ [procedimentos-prontuario] PUT id=${id} — registro NÃO encontrado (0 changes)`);
          return res.status(404).json({ error: 'Procedimento não encontrado' });
        }
        console.log(`✅ [procedimentos-prontuario] PUT id=${id} — ${changes} registro(s) atualizado(s)`);
        // ⭐ Retorna o registro atualizado para confirmar ao frontend
        db.all('SELECT * FROM procedimentos_prontuario WHERE id = ?', [id], (err2, rows) => {
          if (err2 || !rows || rows.length === 0) {
            res.json({ success: true, id });
          } else {
            res.json(rows[0]);
          }
        });
      }
    );
  });
});

// PATCH /api/procedimentos-prontuario/:id/assinatura - Salva assinatura
router.patch('/:id/assinatura', (req, res) => {
  const { id } = req.params;
  const { clinicaId, assinaturaBase64 } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const assinadoEm = new Date().toISOString();

  ensureTable(db, () => {
    db.run(
      `UPDATE procedimentos_prontuario SET assinaturaBase64=?, assinadoEm=? WHERE id=?`,
      [assinaturaBase64 || '', assinadoEm, id],
      function (err) {
        if (err) {
          console.error('❌ Erro ao salvar assinatura:', err);
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Procedimento não encontrado' });
        res.json({ success: true, assinadoEm });
      }
    );
  });
});

// PATCH /api/procedimentos-prontuario/:id/bloquear - Bloqueia procedimento permanentemente
router.patch('/:id/bloquear', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  ensureTable(db, () => {
    db.run(
      `UPDATE procedimentos_prontuario SET bloqueado=1 WHERE id=?`,
      [id],
      function (err) {
        if (err) {
          console.error('❌ Erro ao bloquear procedimento_prontuario:', err);
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) return res.status(404).json({ error: 'Procedimento não encontrado' });
        console.log(`🔒 Procedimento bloqueado: ${id}`);
        res.json({ success: true });
      }
    );
  });
});

// DELETE /api/procedimentos-prontuario/:id?clinicaId=X
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  ensureTable(db, () => {
    // Verifica se está bloqueado antes de deletar
    db.get('SELECT bloqueado FROM procedimentos_prontuario WHERE id=?', [id], (err, row) => {
      if (err) {
        console.error('❌ Erro ao verificar bloqueio:', err);
        return res.status(500).json({ error: err.message });
      }
      if (row && row.bloqueado) {
        return res.status(403).json({ error: 'Procedimento bloqueado não pode ser excluído' });
      }
      db.run('DELETE FROM procedimentos_prontuario WHERE id=?', [id], function (err2) {
        if (err2) {
          console.error('❌ Erro ao deletar procedimento_prontuario:', err2);
          return res.status(500).json({ error: err2.message });
        }
        res.json({ success: true });
      });
    });
  });
});

module.exports = router;