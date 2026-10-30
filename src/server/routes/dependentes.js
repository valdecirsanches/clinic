
// ==================== ROTAS DE DEPENDENTES ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// GET /api/dependentes?clinicaId=c1 - Lista dependentes de uma clínica
router.get('/', (req, res) => {
  const { clinicaId, titularId } = req.query;

  console.log('🔍 GET /api/dependentes - clinicaId:', clinicaId, 'titularId:', titularId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  // Garante que a tabela existe.
  // MySQL recusa TEXT em PRIMARY KEY (ER_BLOB_KEY_WITHOUT_LENGTH) — colunas
  // indexadas precisam de VARCHAR com tamanho.
  db.run(`
    CREATE TABLE IF NOT EXISTS dependentes (
      id VARCHAR(191) PRIMARY KEY,
      titularId VARCHAR(191) NOT NULL,
      nome VARCHAR(255) NOT NULL,
      cpf VARCHAR(20),
      dataNascimento VARCHAR(50),
      parentesco VARCHAR(100),
      telefone VARCHAR(30),
      email VARCHAR(191),
      observacoes TEXT,
      criadoEm VARCHAR(50),
      INDEX idx_dependentes_titular (titularId)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erro ao criar tabela dependentes:', err);
    }

    let query = 'SELECT * FROM dependentes';
    let params = [];

    if (titularId) {
      query += ' WHERE titularId = ?';
      params.push(titularId);
    }

    query += ' ORDER BY nome ASC';

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar dependentes:', err);
        return res.status(500).json({ error: err.message });
      }

      console.log(`✅ Retornando ${(rows || []).length} dependentes`);
      res.json(rows || []);
    });
  });
});

// GET /api/dependentes/:id - Busca dependente por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM dependentes WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar dependente:', err);
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: 'Dependente não encontrado' });
    }

    res.json(row);
  });
});

// POST /api/dependentes - Cria novo dependente
router.post('/', (req, res) => {
  const { clinicaId, titularId, nome, cpf, dataNascimento, parentesco, telefone, email, observacoes } = req.body;

  console.log('📝 POST /api/dependentes - clinicaId:', clinicaId, 'titularId:', titularId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!titularId) {
    return res.status(400).json({ error: 'titularId é obrigatório' });
  }

  if (!nome) {
    return res.status(400).json({ error: 'nome é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  const id = `dep_${Date.now()}`;
  const criadoEm = new Date().toISOString();

  // Garante que a tabela existe
  db.run(`
    CREATE TABLE IF NOT EXISTS dependentes (
      id VARCHAR(191) PRIMARY KEY,
      titularId VARCHAR(191) NOT NULL,
      nome VARCHAR(255) NOT NULL,
      cpf VARCHAR(20),
      dataNascimento VARCHAR(50),
      parentesco VARCHAR(100),
      telefone VARCHAR(30),
      email VARCHAR(191),
      observacoes TEXT,
      criadoEm VARCHAR(50),
      INDEX idx_dependentes_titular (titularId)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erro ao criar tabela dependentes:', err);
    }

    db.run(
      `INSERT INTO dependentes (id, titularId, nome, cpf, dataNascimento, parentesco, telefone, email, observacoes, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, titularId, nome, cpf || null, dataNascimento || null, parentesco || null, telefone || null, email || null, observacoes || null, criadoEm],
      function (err) {
        if (err) {
          console.error('❌ Erro ao criar dependente:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Dependente criado: ${id}`);
        res.json({ id, titularId, nome, cpf, dataNascimento, parentesco, telefone, email, observacoes, criadoEm });
      }
    );
  });
});

// PUT /api/dependentes/:id - Atualiza dependente
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId, nome, cpf, dataNascimento, parentesco, telefone, email, observacoes } = req.body;

  console.log('📝 PUT /api/dependentes/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run(
    `UPDATE dependentes SET nome = ?, cpf = ?, dataNascimento = ?, parentesco = ?, telefone = ?, email = ?, observacoes = ? WHERE id = ?`,
    [nome, cpf || null, dataNascimento || null, parentesco || null, telefone || null, email || null, observacoes || null, id],
    function (err) {
      if (err) {
        console.error('❌ Erro ao atualizar dependente:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Dependente atualizado: ${id}`);
      res.json({ success: true });
    }
  );
});

// DELETE /api/dependentes/:id - Deleta dependente
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  console.log('🗑️ DELETE /api/dependentes/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run('DELETE FROM dependentes WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ Erro ao deletar dependente:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Dependente deletado: ${id}`);
    res.json({ success: true });
  });
});

module.exports = router;