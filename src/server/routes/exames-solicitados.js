

// ==================== ROTAS DE EXAMES SOLICITADOS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// GET /api/exames-solicitados?clinicaId=X&pacienteId=Y
router.get('/', (req, res) => {
  const { clinicaId, pacienteId, consultaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  let query = 'SELECT * FROM atendimento_exames_solicitados';
  let params = [];

  if (consultaId) {
    // Busca por consultaId específica
    query += ' WHERE consultaId = ?';
    params.push(consultaId);
  } else if (pacienteId) {
    // ⭐ Busca por pacienteId direto OU via consultas do paciente
    // Isso garante que encontra exames mesmo se pacienteId não foi salvo no registro
    // Usa COLLATE para evitar conflito de collation entre tabelas
    query += ' WHERE pacienteId = ? OR consultaId COLLATE utf8mb4_unicode_ci IN (SELECT id COLLATE utf8mb4_unicode_ci FROM consultas WHERE pacienteId = ?)';
    params.push(pacienteId, pacienteId);
  }

  query += ' ORDER BY data DESC, criadoEm DESC';

  db.all(query, params, (err, rows) => {
    if (err) {console.error('❌ Erro ao buscar exames solicitados:', err);return res.status(500).json({ error: err.message });}
    console.log(`📋 [exames-solicitados] clinicaId=${clinicaId} pacienteId=${pacienteId || ''} consultaId=${consultaId || ''} → ${(rows || []).length} resultados`);
    res.json(rows || []);
  });
});

// GET /api/exames-solicitados/:id?clinicaId=X
router.get('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.get('SELECT * FROM atendimento_exames_solicitados WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Exame solicitado não encontrado' });
    res.json(row);
  });
});

// POST /api/exames-solicitados
router.post('/', (req, res) => {
  const { clinicaId, consultaId, pacienteId, ...dados } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!consultaId) return res.status(400).json({ error: 'consultaId é obrigatório' });
  if (!pacienteId) return res.status(400).json({ error: 'pacienteId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const id = dados.id || `exsol_${Date.now()}`;

  db.run(
    `INSERT INTO atendimento_exames_solicitados (id, consultaId, pacienteId, descricao, pedido, justificativa, cid10, profissionalId, data, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, consultaId, pacienteId,
    dados.descricao || null, dados.pedido || null,
    dados.justificativa || null, dados.cid10 || null,
    dados.profissionalId || null,
    dados.data || agora.split('T')[0], agora, agora],
    function (err) {
      if (err) {console.error('❌ Erro ao criar exame solicitado:', err);return res.status(500).json({ error: err.message });}
      console.log(`✅ Exame solicitado criado: ${id}`);
      res.json({ success: true, id });
    }
  );
});

// PUT /api/exames-solicitados/:id
router.put('/:id', (req, res) => {
  const { clinicaId, ...updates } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const campos = Object.keys(updates).filter((k) => k !== 'id');
  if (campos.length === 0) return res.json({ success: true });

  const setClause = campos.map((k) => `${k} = ?`).join(', ');
  const valores = campos.map((k) => updates[k]);

  db.run(`UPDATE atendimento_exames_solicitados SET ${setClause}, atualizadoEm = ? WHERE id = ?`, [...valores, agora, req.params.id], function (err) {
    if (err) {console.error('❌ Erro ao atualizar exame solicitado:', err);return res.status(500).json({ error: err.message });}
    console.log(`✅ Exame solicitado atualizado: ${req.params.id}`);
    res.json({ success: true });
  });
});

// DELETE /api/exames-solicitados/:id?clinicaId=X
router.delete('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.run('DELETE FROM atendimento_exames_solicitados WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;