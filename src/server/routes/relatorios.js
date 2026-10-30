
// ==================== ROTAS DE RELATÓRIOS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// GET /api/relatorios?clinicaId=X&pacienteId=Y - Lista relatórios de um paciente
// GET /api/relatorios?clinicaId=X&consultaId=Y - Busca relatório de uma consulta
router.get('/', (req, res) => {
  const { clinicaId, pacienteId, consultaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  let query = 'SELECT * FROM atendimento_relatorios';
  let params = [];

  if (consultaId) {
    query += ' WHERE consultaId = ?';
    params.push(consultaId);
  } else if (pacienteId) {
    query += ' WHERE pacienteId = ?';
    params.push(pacienteId);
  }

  query += ' ORDER BY data DESC, criadoEm DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('❌ Erro ao buscar relatórios:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// GET /api/relatorios/:id?clinicaId=X - Busca relatório por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM atendimento_relatorios WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar relatório:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Relatório não encontrado' });
    }
    res.json(row);
  });
});

// POST /api/relatorios - Cria novo relatório
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
  const id = dados.id || `rel_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  db.run(
    `INSERT INTO atendimento_relatorios (id, consultaId, pacienteId, titulo, tipo, destinatario, conteudo, cid10, profissionalId, profissional, data, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    id, consultaId, pacienteId,
    dados.titulo || '',
    dados.tipo || '',
    dados.destinatario || '',
    dados.conteudo || '',
    dados.cid10 || '',
    dados.profissionalId || null,
    dados.profissional || null,
    dados.data || agora.split('T')[0],
    agora, agora],

    function (err) {
      if (err) {
        console.error('❌ Erro ao criar relatório:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Relatório criado: ${id} → consulta ${consultaId} | tipo: "${dados.tipo || ''}" | dest: "${dados.destinatario || ''}"`);
      res.json({ success: true, id });
    }
  );
});

// PUT /api/relatorios/:id - Atualiza relatório
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
    `UPDATE atendimento_relatorios SET ${setClause}, atualizadoEm = ? WHERE id = ?`,
    [...valores, agora, id],
    function (err) {
      if (err) {
        console.error('❌ Erro ao atualizar relatório:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Relatório atualizado: ${id}`);
      res.json({ success: true });
    }
  );
});

// DELETE /api/relatorios/:id?clinicaId=X - Deleta relatório
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run('DELETE FROM atendimento_relatorios WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ Erro ao deletar relatório:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Relatório deletado: ${id}`);
    res.json({ success: true });
  });
});

module.exports = router;