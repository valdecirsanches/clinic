

// ==================== ROTAS DE EXAMES DE ROTINA ====================
// CRUD de exames de rotina por clínica

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// Garante que a tabela existe
function garantirTabela(db) {
  return new Promise((resolve) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS atendimento_exames_rotina (
        id VARCHAR(191) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        criadoEm DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizadoEm DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, [], () => resolve());
  });
}

// GET /api/exames-gratuitos?clinicaId=X
router.get('/', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  await garantirTabela(db);

  db.all('SELECT * FROM atendimento_exames_rotina ORDER BY nome ASC', [], (err, rows) => {
    if (err) {
      console.error('❌ Erro ao buscar exames de rotina:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// POST /api/exames-gratuitos
router.post('/', async (req, res) => {
  const { clinicaId, nome } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'nome é obrigatório' });

  const db = getClinicaDB(clinicaId);
  await garantirTabela(db);

  const id = `exrot_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');

  db.run(
    'INSERT INTO atendimento_exames_rotina (id, nome, criadoEm, atualizadoEm) VALUES (?, ?, ?, ?)',
    [id, nome.trim().toUpperCase(), agora, agora],
    function (err) {
      if (err) {
        console.error('❌ Erro ao criar exame de rotina:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Exame de rotina criado: ${id} - ${nome}`);
      res.json({ success: true, id, nome: nome.trim().toUpperCase() });
    }
  );
});

// PUT /api/exames-gratuitos/:id
router.put('/:id', async (req, res) => {
  const { clinicaId, nome } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'nome é obrigatório' });

  const db = getClinicaDB(clinicaId);
  await garantirTabela(db);

  const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');

  db.run(
    'UPDATE atendimento_exames_rotina SET nome = ?, atualizadoEm = ? WHERE id = ?',
    [nome.trim().toUpperCase(), agora, req.params.id],
    function (err) {
      if (err) {
        console.error('❌ Erro ao atualizar exame de rotina:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Exame de rotina atualizado: ${req.params.id} - ${nome}`);
      res.json({ success: true });
    }
  );
});

// DELETE /api/exames-gratuitos/:id?clinicaId=X
router.delete('/:id', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  await garantirTabela(db);

  db.run('DELETE FROM atendimento_exames_rotina WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      console.error('❌ Erro ao excluir exame de rotina:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Exame de rotina excluído: ${req.params.id}`);
    res.json({ success: true });
  });
});

module.exports = router;