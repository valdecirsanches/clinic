
// ==================== ROTAS DE PROCEDIMENTOS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// GET /api/procedimentos?clinicaId=c1 - Lista procedimentos de uma clínica
router.get('/', (req, res) => {
  const { clinicaId } = req.query;

  console.log('🔍 GET /api/procedimentos - clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  // Garante que a tabela existe
  db.run(`
    CREATE TABLE IF NOT EXISTS procedimentos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      duracao INTEGER DEFAULT 30,
      valor REAL DEFAULT 0,
      descricao TEXT,
      ativo INTEGER DEFAULT 1,
      criadoEm TEXT
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erro ao criar tabela procedimentos:', err);
    }

    db.all('SELECT * FROM procedimentos ORDER BY nome ASC', [], (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar procedimentos:', err);
        return res.status(500).json({ error: err.message });
      }

      const procedimentos = (rows || []).map((row) => ({
        ...row,
        ativo: Boolean(row.ativo)
      }));

      console.log(`✅ Retornando ${procedimentos.length} procedimentos`);
      res.json(procedimentos);
    });
  });
});

// GET /api/procedimentos/:id - Busca procedimento por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM procedimentos WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar procedimento:', err);
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: 'Procedimento não encontrado' });
    }

    res.json({
      ...row,
      ativo: Boolean(row.ativo)
    });
  });
});

// POST /api/procedimentos - Cria novo procedimento
router.post('/', (req, res) => {
  const { clinicaId, nome, tipo, duracao, valor, descricao, ativo } = req.body;

  console.log('📝 POST /api/procedimentos - clinicaId:', clinicaId, 'nome:', nome);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!nome) {
    return res.status(400).json({ error: 'nome é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  const id = `proc_${Date.now()}`;
  const criadoEm = new Date().toISOString();

  // Garante que a tabela existe
  db.run(`
    CREATE TABLE IF NOT EXISTS procedimentos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      duracao INTEGER DEFAULT 30,
      valor REAL DEFAULT 0,
      descricao TEXT,
      ativo INTEGER DEFAULT 1,
      criadoEm TEXT
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erro ao criar tabela procedimentos:', err);
    }

    db.run(
      `INSERT INTO procedimentos (id, nome, tipo, duracao, valor, descricao, ativo, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nome, tipo || 'medica', duracao || 30, valor || 0, descricao || null, ativo !== false ? 1 : 0, criadoEm],
      function (err) {
        if (err) {
          console.error('❌ Erro ao criar procedimento:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Procedimento criado: ${id}`);
        res.json({ id, nome, tipo, duracao, valor, descricao, ativo: ativo !== false, criadoEm });
      }
    );
  });
});

// PUT /api/procedimentos/:id - Atualiza procedimento
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId, nome, tipo, duracao, valor, descricao, ativo } = req.body;

  console.log('📝 PUT /api/procedimentos/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run(
    `UPDATE procedimentos SET nome = ?, tipo = ?, duracao = ?, valor = ?, descricao = ?, ativo = ? WHERE id = ?`,
    [nome, tipo, duracao || 30, valor || 0, descricao || null, ativo !== false ? 1 : 0, id],
    function (err) {
      if (err) {
        console.error('❌ Erro ao atualizar procedimento:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Procedimento atualizado: ${id}`);
      res.json({ success: true });
    }
  );
});

// DELETE /api/procedimentos/:id - Deleta procedimento
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  console.log('🗑️ DELETE /api/procedimentos/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run('DELETE FROM procedimentos WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ Erro ao deletar procedimento:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Procedimento deletado: ${id}`);
    res.json({ success: true });
  });
});

module.exports = router;