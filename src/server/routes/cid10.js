// ==================== ROTAS DE CID-10 ====================

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');

// ⭐ Tabela cid10 já é criada em databaseGlobal.initGlobalDatabase()
// Não precisa criar aqui (o pool MySQL ainda não existe no momento do require)

// GET /api/cid10
router.get('/', async (req, res) => {
  try {
    const { search, limit = 100, offset = 0 } = req.query;
    let query = 'SELECT * FROM cid10';
    let countQuery = 'SELECT COUNT(*) as total FROM cid10';
    const params = [];

    if (search) {
      const s = `%${search}%`;
      query += ' WHERE codigo LIKE ? OR descricao LIKE ?';
      countQuery += ' WHERE codigo LIKE ? OR descricao LIKE ?';
      params.push(s, s);
    }

    query += ' ORDER BY codigo ASC LIMIT ? OFFSET ?';

    const countRow = await dbGlobal.prepare(countQuery).get(...params);
    const rows = await dbGlobal.prepare(query).all(...params, parseInt(limit), parseInt(offset));

    res.json({ cids: rows || [], total: countRow?.total || 0, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error('❌ Erro ao buscar CIDs:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cid10/buscar
router.get('/buscar', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const s = `%${q}%`;
    const rows = await dbGlobal.prepare(`
      SELECT id, codigo, descricao, categoria FROM cid10
      WHERE codigo LIKE ? OR descricao LIKE ?
      ORDER BY CASE WHEN codigo LIKE ? THEN 0 ELSE 1 END, codigo ASC
      LIMIT ?
    `).all(s, s, `${q}%`, parseInt(limit));
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cid10/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await dbGlobal.prepare('SELECT * FROM cid10 WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'CID não encontrado' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cid10
router.post('/', async (req, res) => {
  try {
    const { codigo, descricao, categoria } = req.body;
    if (!codigo || !descricao) return res.status(400).json({ error: 'Código e descrição são obrigatórios' });
    const id = `cid_${Date.now()}`;
    const criadoEm = new Date().toISOString();
    await dbGlobal.prepare('INSERT INTO cid10 (id, codigo, descricao, categoria, criadoEm) VALUES (?, ?, ?, ?, ?)').
    run(id, codigo.toUpperCase(), descricao, categoria || null, criadoEm);
    console.log(`✅ CID criado: ${codigo}`);
    res.json({ id, codigo, descricao, categoria, criadoEm });
  } catch (err) {
    if (err.message?.includes('Duplicate entry')) return res.status(400).json({ error: 'CID com este código já existe' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cid10/importar
router.post('/importar', async (req, res) => {
  try {
    const { cids } = req.body;
    if (!cids || !Array.isArray(cids) || cids.length === 0) return res.status(400).json({ error: 'Lista de CIDs é obrigatória' });
    console.log(`📥 Importando ${cids.length} CIDs...`);
    const criadoEm = new Date().toISOString();
    let importados = 0,erros = 0;

    // MySQL: usa INSERT ... ON DUPLICATE KEY UPDATE em loop
    for (const cid of cids) {
      if (!cid.codigo || !cid.descricao) {erros++;continue;}
      const id = `cid_${cid.codigo.replace(/\./g, '_')}`;
      try {
        await dbGlobal.prepare(
          'INSERT INTO cid10 (id, codigo, descricao, categoria, criadoEm) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE descricao=VALUES(descricao), categoria=VALUES(categoria)'
        ).run(id, cid.codigo.toUpperCase(), cid.descricao, cid.categoria || null, criadoEm);
        importados++;
      } catch (e) {erros++;}
    }

    const total = await dbGlobal.prepare('SELECT COUNT(*) as count FROM cid10').get();
    console.log(`✅ Importação concluída: ${importados} importados, ${erros} erros`);
    res.json({ importados, erros, total: cids.length, totalFinal: total?.count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cid10/limpar
router.delete('/limpar', async (req, res) => {
  try {
    const result = await dbGlobal.prepare('DELETE FROM cid10').run();
    console.log(`✅ Todos os CIDs foram excluídos (${result.changes} registros)`);
    res.json({ success: true, excluidos: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cid10/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await dbGlobal.prepare('DELETE FROM cid10 WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'CID não encontrado' });
    console.log(`✅ CID excluído: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;