
// ==================== ROTAS DE PADRÕES DE RELATÓRIOS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// GET /api/padroes-relatorios?clinicaId=X&profissionalId=Y
router.get('/', (req, res) => {
  const { clinicaId, profissionalId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  // Se não tem profissionalId, retorna TODOS os padrões
  if (!profissionalId) {
    console.log(`🔍 [padroes-relatorios] Buscando TODOS os padrões (sem filtro de profissional)`);
    db.all('SELECT * FROM padroes_relatorios ORDER BY nome ASC', [], (err, rows) => {
      if (err) {console.error('❌ [padroes-relatorios] Erro SQL:', err.message);return res.status(500).json({ error: err.message });}
      console.log(`✅ [padroes-relatorios] ${(rows || []).length} padrões retornados (todos)`);
      res.json(rows || []);
    });
    return;
  }

  // ⭐ Busca padrões do profissional específico, com fallback para TODOS se não encontrar
  console.log(`🔍 [padroes-relatorios] Buscando padrões do profissionalId: "${profissionalId}" | clinicaId: "${clinicaId}"`);

  db.all(
    'SELECT * FROM padroes_relatorios WHERE profissionalId = ? ORDER BY nome ASC',
    [profissionalId],
    (err, rows) => {
      if (err) {
        console.error('❌ [padroes-relatorios] Erro SQL:', err.message);
        return res.status(500).json({ error: err.message });
      }

      const resultado = rows || [];

      // ⭐ FALLBACK: Se não encontrou nada com o profissionalId (possível mismatch de ID antigo vs novo),
      // retorna TODOS os padrões da clínica para não deixar o médico sem acesso
      if (resultado.length === 0) {
        console.warn(`⚠️ [padroes-relatorios] 0 padrões para profissionalId "${profissionalId}" — buscando TODOS como fallback`);
        db.all('SELECT * FROM padroes_relatorios ORDER BY nome ASC', [], (err2, allRows) => {
          if (err2) {
            console.error('❌ [padroes-relatorios] Erro SQL fallback:', err2.message);
            return res.status(500).json({ error: err2.message });
          }
          const todos = allRows || [];
          console.log(`✅ [padroes-relatorios] Fallback: ${todos.length} padrões retornados (todos da clínica)`);
          res.json(todos);
        });
        return;
      }

      console.log(`✅ [padroes-relatorios] ${resultado.length} padrões encontrados para "${profissionalId}"`);
      res.json(resultado);
    }
  );
});

// GET /api/padroes-relatorios/:id?clinicaId=X
router.get('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.get('SELECT * FROM padroes_relatorios WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Padrão não encontrado' });
    res.json(row);
  });
});

// POST /api/padroes-relatorios
router.post('/', (req, res) => {
  const { clinicaId, ...dados } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!dados.nome) return res.status(400).json({ error: 'nome é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const id = dados.id || `padrel_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  db.run(
    `INSERT INTO padroes_relatorios (id, profissionalId, nome, titulo, tipo, destinatario, conteudo, cid10, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, dados.profissionalId || null, dados.nome,
    dados.titulo || null, dados.tipo || null, dados.destinatario || null,
    dados.conteudo || null, dados.cid10 || null,
    agora, agora],
    function (err) {
      if (err) {console.error('❌ Erro ao criar padrão de relatório:', err);return res.status(500).json({ error: err.message });}
      console.log(`✅ Padrão de relatório criado: ${id} - ${dados.nome}`);
      res.json({ success: true, id });
    }
  );
});

// PUT /api/padroes-relatorios/:id
router.put('/:id', (req, res) => {
  const { clinicaId, ...updates } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const campos = Object.keys(updates).filter((k) => k !== 'id');
  if (campos.length === 0) return res.json({ success: true });

  const setClause = campos.map((k) => `${k} = ?`).join(', ');
  const valores = campos.map((k) => updates[k]);

  db.run(`UPDATE padroes_relatorios SET ${setClause}, atualizadoEm = ? WHERE id = ?`, [...valores, agora, req.params.id], function (err) {
    if (err) {console.error('❌ Erro ao atualizar padrão de relatório:', err);return res.status(500).json({ error: err.message });}
    console.log(`✅ Padrão de relatório atualizado: ${req.params.id}`);
    res.json({ success: true });
  });
});

// DELETE /api/padroes-relatorios/:id?clinicaId=X
router.delete('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.run('DELETE FROM padroes_relatorios WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    console.log(`✅ Padrão de relatório excluído: ${req.params.id}`);
    res.json({ success: true });
  });
});

module.exports = router;