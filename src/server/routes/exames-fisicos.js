// ==================== ROTAS DE EXAMES FÍSICOS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// ⭐ Auto-criação da tabela se não existir (MySQL compatível)
function ensureTable(db, callback) {
  db.run(`
    CREATE TABLE IF NOT EXISTS exames_fisicos (
      id VARCHAR(191) PRIMARY KEY,
      consultaId VARCHAR(191),
      pacienteId VARCHAR(191) NOT NULL,
      altura VARCHAR(20),
      peso VARCHAR(20),
      imc VARCHAR(20),
      pressaoArterial VARCHAR(20),
      pulso VARCHAR(20),
      temperatura VARCHAR(20),
      saturacaoO2 VARCHAR(20),
      frequenciaRespiratoria VARCHAR(20),
      glicemia VARCHAR(20),
      observacoesGerais TEXT,
      profissionalId VARCHAR(191),
      profissional VARCHAR(255),
      data VARCHAR(50),
      criadoEm VARCHAR(50),
      atualizadoEm VARCHAR(50)
    )
  `, (err) => {
    if (err && err.code !== 'ER_TABLE_EXISTS_ERROR') {
      console.error('❌ Erro ao criar tabela exames_fisicos:', err.message);
    }
    if (callback) callback();
  });
}

// GET /api/exames-fisicos?clinicaId=X&pacienteId=Y
router.get('/', (req, res) => {
  const { clinicaId, pacienteId, consultaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  ensureTable(db, () => {
    let query = 'SELECT * FROM exames_fisicos';
    let params = [];

    if (consultaId) {query += ' WHERE consultaId = ?';params.push(consultaId);} else
    if (pacienteId) {
      query += ' WHERE pacienteId = ? OR consultaId COLLATE utf8mb4_unicode_ci IN (SELECT id COLLATE utf8mb4_unicode_ci FROM consultas WHERE pacienteId = ?)';
      params.push(pacienteId, pacienteId);
    }

    query += ' ORDER BY data DESC, criadoEm DESC';

    db.all(query, params, (err, rows) => {
      if (err) {console.error('❌ Erro ao buscar exames físicos:', err);return res.status(500).json({ error: err.message });}
      res.json(rows || []);
    });
  });
});

// GET /api/exames-fisicos/:id?clinicaId=X
router.get('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.get('SELECT * FROM exames_fisicos WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Exame físico não encontrado' });
    res.json(row);
  });
});

// POST /api/exames-fisicos
router.post('/', (req, res) => {
  const { clinicaId, consultaId, pacienteId, ...dados } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!consultaId) return res.status(400).json({ error: 'consultaId é obrigatório' });
  if (!pacienteId) return res.status(400).json({ error: 'pacienteId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const id = dados.id || `exfis_${Date.now()}`;

  db.run(
    `INSERT INTO exames_fisicos (id, consultaId, pacienteId, altura, peso, imc, pressaoArterial, pulso, temperatura, saturacaoO2, frequenciaRespiratoria, glicemia, observacoesGerais, profissionalId, profissional, data, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, consultaId, pacienteId,
    dados.altura || null, dados.peso || null, dados.imc || null,
    dados.pressaoArterial || null, dados.pulso || null, dados.temperatura || null,
    dados.saturacaoO2 || null, dados.frequenciaRespiratoria || null, dados.glicemia || null,
    dados.observacoesGerais || null, dados.profissionalId || null, dados.profissional || null,
    dados.data || agora.split('T')[0], agora, agora],
    function (err) {
      if (err) {console.error('❌ Erro ao criar exame físico:', err);return res.status(500).json({ error: err.message });}
      console.log(`✅ Exame físico criado: ${id}`);
      res.json({ success: true, id });
    }
  );
});

// PUT /api/exames-fisicos/:id
router.put('/:id', (req, res) => {
  const { clinicaId, ...updates } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const campos = Object.keys(updates).filter((k) => k !== 'id');
  if (campos.length === 0) return res.json({ success: true });

  const setClause = campos.map((k) => `${k} = ?`).join(', ');
  const valores = campos.map((k) => updates[k]);

  db.run(`UPDATE exames_fisicos SET ${setClause}, atualizadoEm = ? WHERE id = ?`, [...valores, agora, req.params.id], function (err) {
    if (err) {console.error('❌ Erro ao atualizar exame físico:', err);return res.status(500).json({ error: err.message });}
    console.log(`✅ Exame físico atualizado: ${req.params.id}`);
    res.json({ success: true });
  });
});

// DELETE /api/exames-fisicos/:id?clinicaId=X
router.delete('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.run('DELETE FROM exames_fisicos WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;