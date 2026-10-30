// ==================== ROTAS DE EVOLUÇÕES ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// ⭐ Auto-criação da tabela se não existir (MySQL compatível).
//    IMPORTANTE: a coluna do texto é `evolucao` — é ela que o INSERT/UPDATE e o
//    frontend usam. Versões antigas desta rota criavam a coluna como `descricao`,
//    o que provocava "Unknown column 'evolucao'" no INSERT e fazia a evolução
//    NÃO salvar. Por isso garantimos a coluna `evolucao` via ALTER idempotente.
function ensureTable(db, callback) {
  db.run(`
    CREATE TABLE IF NOT EXISTS evolucoes (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191),
      pacienteId VARCHAR(191) NOT NULL,
      evolucao TEXT,
      observacoes TEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      data VARCHAR(50),
      criadoEm VARCHAR(50),
      atualizadoEm VARCHAR(50)
    )
  `, (err) => {
    if (err && err.code !== 'ER_TABLE_EXISTS_ERROR') {
      console.error('❌ Erro ao criar tabela evolucoes:', err.message);
    }
    // Bancos antigos: garante que a coluna `evolucao` exista mesmo em tabelas
    // criadas por versões anteriores do schema (CREATE TABLE IF NOT EXISTS não
    // altera tabelas já existentes). ALTER idempotente — ignora se já existe.
    db.run('ALTER TABLE evolucoes ADD COLUMN evolucao TEXT', () => {
      // Migra conteúdo legado salvo em `descricao` para `evolucao`, quando aplicável.
      db.run(
        "UPDATE evolucoes SET evolucao = descricao WHERE (evolucao IS NULL OR evolucao = '') AND descricao IS NOT NULL",
        () => {
          if (callback) callback();
        }
      );
    });
  });
}

// GET /api/evolucoes?clinicaId=X&pacienteId=Y
router.get('/', (req, res) => {
  const { clinicaId, pacienteId, consultaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  ensureTable(db, () => {
    let query = 'SELECT * FROM evolucoes';
    let params = [];

    if (consultaId) {query += ' WHERE consultaId = ?';params.push(consultaId);} else
    if (pacienteId) {
      query += ' WHERE pacienteId = ? OR consultaId COLLATE utf8mb4_unicode_ci IN (SELECT id COLLATE utf8mb4_unicode_ci FROM consultas WHERE pacienteId = ?)';
      params.push(pacienteId, pacienteId);
    }

    query += ' ORDER BY data DESC, criadoEm DESC';

    db.all(query, params, (err, rows) => {
      if (err) {console.error('❌ Erro ao buscar evoluções:', err);return res.status(500).json({ error: err.message });}
      res.json(rows || []);
    });
  });
});

// GET /api/evolucoes/:id?clinicaId=X
router.get('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.get('SELECT * FROM evolucoes WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Evolução não encontrada' });
    res.json(row);
  });
});

// POST /api/evolucoes
router.post('/', (req, res) => {
  const { clinicaId, consultaId, pacienteId, ...dados } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!consultaId) return res.status(400).json({ error: 'consultaId é obrigatório' });
  if (!pacienteId) return res.status(400).json({ error: 'pacienteId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const id = dados.id || `evol_${Date.now()}`;

  ensureTable(db, () => {
    db.run(
      `INSERT INTO evolucoes (id, consultaId, pacienteId, evolucao, observacoes, profissionalId, profissional, data, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, consultaId, pacienteId, dados.evolucao || null, dados.observacoes || null,
      dados.profissionalId || null, dados.profissional || null, dados.data || agora.split('T')[0], agora, agora],
      function (err) {
        if (err) {console.error('❌ Erro ao criar evolução:', err);return res.status(500).json({ error: err.message });}
        console.log(`✅ Evolução criada: ${id}`);
        res.json({ success: true, id });
      }
    );
  });
});

// PUT /api/evolucoes/:id
router.put('/:id', (req, res) => {
  const { clinicaId, ...updates } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const campos = Object.keys(updates).filter((k) => k !== 'id');
  if (campos.length === 0) return res.json({ success: true });

  const setClause = campos.map((k) => `${k} = ?`).join(', ');
  const valores = campos.map((k) => updates[k]);

  ensureTable(db, () => {
    db.run(`UPDATE evolucoes SET ${setClause}, atualizadoEm = ? WHERE id = ?`, [...valores, agora, req.params.id], function (err) {
      if (err) {console.error('❌ Erro ao atualizar evolução:', err);return res.status(500).json({ error: err.message });}
      console.log(`✅ Evolução atualizada: ${req.params.id}`);
      res.json({ success: true });
    });
  });
});

// DELETE /api/evolucoes/:id?clinicaId=X
router.delete('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.run('DELETE FROM evolucoes WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;