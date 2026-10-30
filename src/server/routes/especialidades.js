const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');

// ⭐ Tabela especialidades já é criada em databaseGlobal.initGlobalDatabase()
// Não precisa criar aqui (o pool MySQL ainda não existe no momento do require)

// GET /
router.get('/', async (req, res) => {
  try {
    const { tipo, ativas } = req.query;
    let query = 'SELECT * FROM especialidades';
    const params = [];
    const conditions = [];
    if (tipo) {conditions.push('(tipo = ? OR tipo = ?)');params.push(tipo, 'ambas');}
    if (ativas === 'true') {conditions.push('ativa = 1');}
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY tipo, nome';
    const rows = await dbGlobal.prepare(query).all(...params);
    res.json(rows || []);
  } catch (err) {
    console.error('❌ Erro ao buscar especialidades:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const row = await dbGlobal.prepare('SELECT * FROM especialidades WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Especialidade não encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /
router.post('/', async (req, res) => {
  try {
    const { nome, descricao, tipo, ativa } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const id = `esp_${Date.now()}`;
    const criadoEm = new Date().toISOString();
    await dbGlobal.prepare(`INSERT INTO especialidades (id, nome, descricao, tipo, ativa, criadoEm) VALUES (?, ?, ?, ?, ?, ?)`).
    run(id, nome, descricao || null, tipo || 'medica', ativa !== false ? 1 : 0, criadoEm);
    res.status(201).json({ id, nome, descricao, tipo: tipo || 'medica', ativa: ativa !== false, criadoEm });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, tipo, ativa } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const atualizadoEm = new Date().toISOString();
    const result = await dbGlobal.prepare(`UPDATE especialidades SET nome=?,descricao=?,tipo=?,ativa=?,atualizadoEm=? WHERE id=?`).
    run(nome, descricao || null, tipo || 'medica', ativa !== false ? 1 : 0, atualizadoEm, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Especialidade não encontrada' });
    res.json({ id, nome, descricao, tipo: tipo || 'medica', ativa: ativa !== false, atualizadoEm });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await dbGlobal.prepare('DELETE FROM especialidades WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Especialidade não encontrada' });
    res.json({ message: 'Especialidade excluída com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id/toggle
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const row = await dbGlobal.prepare('SELECT ativa FROM especialidades WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Especialidade não encontrada' });
    const novoStatus = row.ativa ? 0 : 1;
    const atualizadoEm = new Date().toISOString();
    await dbGlobal.prepare('UPDATE especialidades SET ativa=?,atualizadoEm=? WHERE id=?').run(novoStatus, atualizadoEm, id);
    res.json({ id, ativa: novoStatus === 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;