
// ==================== ROTAS DE ATESTADOS (Lei 14.724/2023) ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// GET /api/atestados?clinicaId=X&pacienteId=Y - Lista atestados de um paciente
// GET /api/atestados?clinicaId=X&consultaId=Y - Busca atestado de uma consulta
router.get('/', (req, res) => {
  const { clinicaId, pacienteId, consultaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  let query = 'SELECT * FROM atendimento_atestados';
  let params = [];

  if (consultaId) {
    query += ' WHERE consultaId = ?';
    params.push(consultaId);
  } else if (pacienteId) {
    query += ' WHERE pacienteId = ?';
    params.push(pacienteId);
  }

  query += ' ORDER BY dataEmissao DESC, criadoEm DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('❌ Erro ao buscar atestados:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// GET /api/atestados/:id?clinicaId=X - Busca atestado por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM atendimento_atestados WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar atestado:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Atestado não encontrado' });
    }
    res.json(row);
  });
});

// POST /api/atestados - Cria novo atestado
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
  const id = dados.id || `atest_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  db.run(
    `INSERT INTO atendimento_atestados (id, consultaId, pacienteId, profissionalId, profissional, medico, dataEmissao, dataReferencia, solicitante, horaChegada, horaSaida, finalidadePresenca, outrosComunicamos, cid10, qtdeDias, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    id, consultaId, pacienteId,
    dados.profissionalId || null,
    dados.profissional || null,
    dados.medico || '',
    agora.split('T')[0],
    dados.dataReferencia || agora.split('T')[0],
    dados.solicitante || '',
    dados.horaChegada || '',
    dados.horaSaida || '',
    dados.finalidadePresenca || 'consulta',
    dados.outrosComunicamos || 'pode_voltar',
    dados.cid10 || '',
    dados.qtdeDias || 0,
    agora, agora],

    function (err) {
      if (err) {
        console.error('❌ Erro ao criar atestado:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Atestado criado: ${id} → consulta ${consultaId} | CID: "${dados.cid10 || ''}" | Dias: ${dados.qtdeDias || 0}`);
      res.json({ success: true, id });
    }
  );
});

// PUT /api/atestados/:id - Atualiza atestado
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
    `UPDATE atendimento_atestados SET ${setClause}, atualizadoEm = ? WHERE id = ?`,
    [...valores, agora, id],
    function (err) {
      if (err) {
        console.error('❌ Erro ao atualizar atestado:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Atestado atualizado: ${id}`);
      res.json({ success: true });
    }
  );
});

// DELETE /api/atestados/:id?clinicaId=X - Deleta atestado
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run('DELETE FROM atendimento_atestados WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ Erro ao deletar atestado:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Atestado deletado: ${id}`);
    res.json({ success: true });
  });
});

module.exports = router;