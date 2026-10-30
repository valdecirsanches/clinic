// ==================== ROTAS DE ANAMNESES ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// ⭐ Auto-criação da tabela se não existir (MySQL compatível)
function ensureTable(db, callback) {
  db.run(`
    CREATE TABLE IF NOT EXISTS anamneses (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191),
      pacienteId VARCHAR(191) NOT NULL,
      queixaPrincipal TEXT,
      historiaQueixa TEXT,
      historicoDoencas TEXT,
      alergias TEXT,
      medicamentosEmUso TEXT,
      historicoFamiliar TEXT,
      habitosVida TEXT,
      observacoes TEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      data VARCHAR(50),
      criadoEm VARCHAR(50),
      atualizadoEm VARCHAR(50)
    )
  `, (err) => {
    if (err && err.code !== 'ER_TABLE_EXISTS_ERROR') {
      console.error('❌ Erro ao criar tabela anamneses:', err.message);
    }
    if (callback) callback();
  });
}

// GET /api/anamneses?clinicaId=X&pacienteId=Y - Lista anamneses de um paciente
// GET /api/anamneses?clinicaId=X&consultaId=Y - Busca anamnese de uma consulta
router.get('/', (req, res) => {
  const { clinicaId, pacienteId, consultaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  ensureTable(db, () => {
    let query = 'SELECT * FROM anamneses';
    let params = [];

    if (consultaId) {
      query += ' WHERE consultaId = ?';
      params.push(consultaId);
    } else if (pacienteId) {
      query += ' WHERE pacienteId = ? OR consultaId COLLATE utf8mb4_unicode_ci IN (SELECT id COLLATE utf8mb4_unicode_ci FROM consultas WHERE pacienteId = ?)';
      params.push(pacienteId, pacienteId);
    }

    query += ' ORDER BY data DESC, criadoEm DESC';

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar anamneses:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(rows || []);
    });
  });
});

// GET /api/anamneses/:id?clinicaId=X - Busca anamnese por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM anamneses WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar anamnese:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Anamnese não encontrada' });
    }
    res.json(row);
  });
});

// POST /api/anamneses - Cria nova anamnese
router.post('/', (req, res) => {
  const { clinicaId, consultaId, pacienteId, ...dados } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }
  if (!consultaId) {
    return res.status(400).json({ error: 'consultaId é obrigatório' });
  }
  if (!pacienteId) {
    return res.status(400).json({ error: 'pacienteId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const id = dados.id || `anam_${Date.now()}`;

  db.run(
    `INSERT INTO anamneses (id, consultaId, pacienteId, queixaPrincipal, historiaQueixa, historicoDoencas, alergias, medicamentosEmUso, historicoFamiliar, habitosVida, observacoes, profissionalId, profissional, data, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    id, consultaId, pacienteId,
    dados.queixaPrincipal || null,
    dados.historiaQueixa || null,
    dados.historicoDoencas || null,
    dados.alergias || null,
    dados.medicamentosEmUso || null,
    dados.historicoFamiliar || null,
    dados.habitosVida || null,
    dados.observacoes || null,
    dados.profissionalId || null,
    dados.profissional || null,
    dados.data || agora.split('T')[0],
    agora, agora],

    function (err) {
      if (err) {
        console.error('❌ Erro ao criar anamnese:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Anamnese criada: ${id} → consulta ${consultaId}`);
      res.json({ success: true, id });
    }
  );
});

// PUT /api/anamneses/:id - Atualiza anamnese
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId, ...updates } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();

  const campos = Object.keys(updates).filter((k) => k !== 'id');
  if (campos.length === 0) {
    return res.json({ success: true });
  }

  const setClause = campos.map((k) => `${k} = ?`).join(', ');
  const valores = campos.map((k) => updates[k]);

  db.run(
    `UPDATE anamneses SET ${setClause}, atualizadoEm = ? WHERE id = ?`,
    [...valores, agora, id],
    function (err) {
      if (err) {
        console.error('❌ Erro ao atualizar anamnese:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Anamnese atualizada: ${id}`);
      res.json({ success: true });
    }
  );
});

// DELETE /api/anamneses/:id?clinicaId=X - Deleta anamnese
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run('DELETE FROM anamneses WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ Erro ao deletar anamnese:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Anamnese deletada: ${id}`);
    res.json({ success: true });
  });
});

module.exports = router;