// ==================== ROTAS DE PADRÕES DE EXAMES ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// GET /api/padroes-exames?clinicaId=X&profissionalId=Y
router.get('/', (req, res) => {
  const { clinicaId, profissionalId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);

  // Se não tem profissionalId, retorna TODOS os padrões
  if (!profissionalId) {
    console.log(`🔍 [padroes-exames] Buscando TODOS os padrões (sem filtro de profissional)`);
    db.all('SELECT * FROM padroes_exames ORDER BY nome ASC', [], (err, rows) => {
      if (err) {console.error('❌ [padroes-exames] Erro SQL:', err.message);return res.status(500).json({ error: err.message });}
      console.log(`✅ [padroes-exames] ${(rows || []).length} padrões retornados (todos)`);
      res.json(rows || []);
    });
    return;
  }

  // ⭐ SEGURANÇA: Só retorna padrões do profissional específico (NÃO inclui globais)
  // Cada profissional só vê seus próprios padrões
  console.log(`🔍 [padroes-exames] Buscando padrões APENAS do profissionalId: "${profissionalId}" | clinicaId: "${clinicaId}"`);

  db.all(
    'SELECT * FROM padroes_exames WHERE profissionalId = ? ORDER BY nome ASC',
    [profissionalId],
    (err, rows) => {
      if (err) {
        console.error('❌ [padroes-exames] Erro SQL:', err.message);
        return res.status(500).json({ error: err.message });
      }

      const resultado = rows || [];
      console.log(`✅ [padroes-exames] ${resultado.length} padrões encontrados para "${profissionalId}"`);

      // Se não encontrou nada com match direto, loga os IDs que existem no banco para diagnóstico
      if (resultado.length === 0) {
        db.all('SELECT DISTINCT profissionalId FROM padroes_exames LIMIT 10', [], (err2, distinctRows) => {
          const idsNoBanco = (distinctRows || []).map((r) => r.profissionalId).filter(Boolean);
          console.log(`⚠️ [padroes-exames] NENHUM padrão encontrado!`);
          console.log(`   profissionalId enviado: "${profissionalId}"`);
          console.log(`   profissionalIds NO BANCO: [${idsNoBanco.map((id) => `"${id}"`).join(', ')}]`);
          if (idsNoBanco.length > 0 && !idsNoBanco.includes(profissionalId)) {
            console.log(`   ❌ O ID "${profissionalId}" NÃO existe na tabela padroes_exames!`);
            console.log(`   💡 Possível solução: atualizar os padrões com o ID correto`);
          }
        });
      }

      res.json(resultado);
    }
  );
});

// GET /api/padroes-exames/diagnostico?clinicaId=X - Rota de diagnóstico
router.get('/diagnostico', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const { getDbPathForClinica } = require('../databaseClinica');
  const dbPath = getDbPathForClinica(clinicaId);
  const db = getClinicaDB(clinicaId);

  db.all('SELECT COUNT(*) as total FROM padroes_exames', [], (err, countRows) => {
    if (err) return res.json({ erro: err.message, tabelaExiste: false, dbPath });

    const total = countRows?.[0]?.total || 0;

    db.all('SELECT id, profissionalId, nome FROM padroes_exames LIMIT 10', [], (err2, amostra) => {
      res.json({
        clinicaId,
        dbPath,
        dbNome: require('path').basename(dbPath),
        tabelaExiste: true,
        totalPadroes: total,
        amostra: amostra || [],
        mensagem: total === 0 ?
        '⚠️ Tabela existe mas está VAZIA! Rode: cd server && node migrate-padrao-exame-mysql.js' :
        `✅ ${total} padrões encontrados`,
        dica: total === 0 ?
        'Verifique se o script de migração aponta para o mesmo arquivo: ' + require('path').basename(dbPath) :
        null
      });
    });
  });
});

// GET /api/padroes-exames/:id?clinicaId=X
router.get('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.get('SELECT * FROM padroes_exames WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Padrão não encontrado' });
    res.json(row);
  });
});

// POST /api/padroes-exames
router.post('/', (req, res) => {
  const { clinicaId, ...dados } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!dados.nome) return res.status(400).json({ error: 'nome é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const id = dados.id || `padex_${Date.now()}`;

  db.run(
    `INSERT INTO padroes_exames (id, profissionalId, nome, descricao, pedido, justificativa, cid10, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, dados.profissionalId || null, dados.nome,
    dados.descricao || null, dados.pedido || null,
    dados.justificativa || null, dados.cid10 || null,
    agora, agora],
    function (err) {
      if (err) {console.error('❌ Erro ao criar padrão de exame:', err);return res.status(500).json({ error: err.message });}
      console.log(`✅ Padrão de exame criado: ${id} - ${dados.nome}`);
      res.json({ success: true, id });
    }
  );
});

// PUT /api/padroes-exames/:id
router.put('/:id', (req, res) => {
  const { clinicaId, ...updates } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const campos = Object.keys(updates).filter((k) => k !== 'id');
  if (campos.length === 0) return res.json({ success: true });

  const setClause = campos.map((k) => `${k} = ?`).join(', ');
  const valores = campos.map((k) => updates[k]);

  db.run(`UPDATE padroes_exames SET ${setClause}, atualizadoEm = ? WHERE id = ?`, [...valores, agora, req.params.id], function (err) {
    if (err) {console.error('❌ Erro ao atualizar padrão de exame:', err);return res.status(500).json({ error: err.message });}
    console.log(`✅ Padrão de exame atualizado: ${req.params.id}`);
    res.json({ success: true });
  });
});

// DELETE /api/padroes-exames/:id?clinicaId=X
router.delete('/:id', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.run('DELETE FROM padroes_exames WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    console.log(`✅ Padrão de exame excluído: ${req.params.id}`);
    res.json({ success: true });
  });
});

module.exports = router;