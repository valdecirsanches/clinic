// ==================== ROTAS DE PLANOS DO SISTEMA ====================

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');

// GET /api/planos
router.get('/', async (req, res) => {
  try {
    const rows = await dbGlobal.prepare('SELECT * FROM planos WHERE ativo = 1 ORDER BY ordem ASC').all();
    const planos = rows.map((row) => ({
      ...row,
      recursos: JSON.parse(row.recursos || '[]'),
      destaque: Boolean(row.destaque),
      ativo: Boolean(row.ativo)
    }));
    console.log(`✅ Retornando ${planos.length} planos do sistema`);
    res.json(planos);
  } catch (err) {
    console.error('❌ Erro ao buscar planos:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/planos/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await dbGlobal.prepare('SELECT * FROM planos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Plano não encontrado' });
    res.json({ ...row, recursos: JSON.parse(row.recursos || '[]'), destaque: Boolean(row.destaque), ativo: Boolean(row.ativo) });
  } catch (err) {
    console.error('❌ Erro ao buscar plano:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/planos
router.post('/', async (req, res) => {
  try {
    const { id, nome, preco, limitePacientes, recursos, destaque, ordem } = req.body;
    if (!id || !nome) return res.status(400).json({ error: 'ID e nome são obrigatórios' });
    const agora = new Date().toISOString();
    await dbGlobal.prepare(`
      INSERT INTO planos (id, nome, preco, limitePacientes, recursos, destaque, ativo, ordem, criadoEm, atualizadoEm)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, nome, preco || 0, limitePacientes || null, JSON.stringify(recursos || []), destaque ? 1 : 0, ordem || 0, agora, agora);
    console.log(`✅ Plano criado: ${id}`);
    res.json({ id, nome, preco: preco || 0, limitePacientes: limitePacientes || null, recursos: recursos || [], destaque: Boolean(destaque), ativo: true, ordem: ordem || 0, criadoEm: agora, atualizadoEm: agora });
  } catch (err) {
    console.error('❌ Erro ao criar plano:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/planos/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, preco, limitePacientes, recursos, destaque, ordem } = req.body;
    const atualizadoEm = new Date().toISOString();
    await dbGlobal.prepare(`
      UPDATE planos SET nome=?,preco=?,limitePacientes=?,recursos=?,destaque=?,ordem=?,atualizadoEm=? WHERE id=?
    `).run(nome, preco || 0, limitePacientes || null, JSON.stringify(recursos || []), destaque ? 1 : 0, ordem || 0, atualizadoEm, id);
    console.log(`✅ Plano atualizado: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao atualizar plano:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/planos/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const check = await dbGlobal.prepare('SELECT COUNT(*) as count FROM operadoras WHERE planoId = ?').get(id);
    if (check && check.count > 0) {
      return res.status(400).json({
        error: `Não é possível excluir este plano. ${check.count} operadora(s) estão usando este plano.`,
        message: 'Altere o plano das operadoras antes de excluir.'
      });
    }
    await dbGlobal.prepare('DELETE FROM planos WHERE id = ?').run(id);
    console.log(`✅ Plano deletado: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao deletar plano:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;