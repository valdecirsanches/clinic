
// ==================== ROTAS DE PADRÕES DE PRESCRIÇÕES ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// ⭐ Garante que a tabela existe (auto-criação para bancos antigos)
function garantirTabela(db) {
  return new Promise((resolve) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS padroes_prescricoes (
        id VARCHAR(191) PRIMARY KEY,
        profissionalId VARCHAR(191),
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        controleEspecial TINYINT(1) DEFAULT 0,
        medicamentos LONGTEXT,
        generico TEXT,
        criadoEm VARCHAR(50) NOT NULL,
        atualizadoEm VARCHAR(50) NOT NULL
      )
    `, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('⚠️ Erro ao criar tabela padroes_prescricoes:', err.message);
      }
      resolve();
    });
  });
}

// GET /api/padroes-prescricoes?clinicaId=X&profissionalId=Y
router.get('/', async (req, res) => {
  const { clinicaId, profissionalId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  await garantirTabela(db);

  // Se não tem profissionalId, retorna TODOS os padrões
  if (!profissionalId) {
    console.log(`🔍 [padroes-prescricoes] Buscando TODOS os padrões (sem filtro de profissional)`);
    db.all('SELECT * FROM padroes_prescricoes ORDER BY nome ASC', [], (err, rows) => {
      if (err) {console.error('❌ [padroes-prescricoes] Erro SQL:', err.message);return res.status(500).json({ error: err.message });}
      const resultado = (rows || []).map(parseMedicamentos);
      console.log(`✅ [padroes-prescricoes] ${resultado.length} padrões retornados (todos)`);
      res.json(resultado);
    });
    return;
  }

  // Busca padrões do profissional específico
  console.log(`🔍 [padroes-prescricoes] Buscando padrões do profissionalId: "${profissionalId}" | clinicaId: "${clinicaId}"`);

  db.all(
    'SELECT * FROM padroes_prescricoes WHERE profissionalId = ? ORDER BY nome ASC',
    [profissionalId],
    (err, rows) => {
      if (err) {
        console.error('❌ [padroes-prescricoes] Erro SQL:', err.message);
        return res.status(500).json({ error: err.message });
      }

      const resultado = (rows || []).map(parseMedicamentos);

      // ⭐ FALLBACK: Se não encontrou nada, retorna TODOS os padrões da clínica
      if (resultado.length === 0) {
        console.warn(`⚠️ [padroes-prescricoes] 0 padrões para profissionalId "${profissionalId}" — buscando TODOS como fallback`);
        db.all('SELECT * FROM padroes_prescricoes ORDER BY nome ASC', [], (err2, allRows) => {
          if (err2) {
            console.error('❌ [padroes-prescricoes] Erro SQL fallback:', err2.message);
            return res.status(500).json({ error: err2.message });
          }
          const todos = (allRows || []).map(parseMedicamentos);
          console.log(`✅ [padroes-prescricoes] Fallback: ${todos.length} padrões retornados (todos da clínica)`);
          res.json(todos);
        });
        return;
      }

      console.log(`✅ [padroes-prescricoes] ${resultado.length} padrões encontrados para "${profissionalId}"`);
      res.json(resultado);
    }
  );
});

// GET /api/padroes-prescricoes/:id?clinicaId=X
router.get('/:id', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  await garantirTabela(db);

  db.get('SELECT * FROM padroes_prescricoes WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Padrão não encontrado' });
    res.json(parseMedicamentos(row));
  });
});

// POST /api/padroes-prescricoes
router.post('/', async (req, res) => {
  const { clinicaId, ...dados } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });
  if (!dados.nome) return res.status(400).json({ error: 'nome é obrigatório' });

  const db = getClinicaDB(clinicaId);
  await garantirTabela(db);

  const agora = new Date().toISOString();
  const id = dados.id || `padpresc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Serializa medicamentos como JSON
  const medicamentosJSON = dados.medicamentos ?
  typeof dados.medicamentos === 'string' ? dados.medicamentos : JSON.stringify(dados.medicamentos) :
  '[]';

  db.run(
    `INSERT INTO padroes_prescricoes (id, profissionalId, nome, descricao, controleEspecial, medicamentos, generico, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
    id,
    dados.profissionalId || null,
    dados.nome,
    dados.descricao || null,
    dados.controleEspecial ? 1 : 0,
    medicamentosJSON,
    dados.generico || null,
    agora,
    agora],

    function (err) {
      if (err) {
        console.error('❌ Erro ao criar padrão de prescrição:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Padrão de prescrição criado: ${id} - ${dados.nome}`);
      res.json({ success: true, id });
    }
  );
});

// PUT /api/padroes-prescricoes/:id
router.put('/:id', async (req, res) => {
  const { clinicaId, ...updates } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  await garantirTabela(db);

  const agora = new Date().toISOString();

  // Serializa medicamentos se presente
  if (updates.medicamentos && typeof updates.medicamentos !== 'string') {
    updates.medicamentos = JSON.stringify(updates.medicamentos);
  }

  // Converte controleEspecial para INTEGER
  if ('controleEspecial' in updates) {
    updates.controleEspecial = updates.controleEspecial ? 1 : 0;
  }

  const campos = Object.keys(updates).filter((k) => k !== 'id');
  if (campos.length === 0) return res.json({ success: true });

  const setClause = campos.map((k) => `${k} = ?`).join(', ');
  const valores = campos.map((k) => updates[k]);

  db.run(
    `UPDATE padroes_prescricoes SET ${setClause}, atualizadoEm = ? WHERE id = ?`,
    [...valores, agora, req.params.id],
    function (err) {
      if (err) {
        console.error('❌ Erro ao atualizar padrão de prescrição:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Padrão de prescrição atualizado: ${req.params.id}`);
      res.json({ success: true });
    }
  );
});

// DELETE /api/padroes-prescricoes/:id?clinicaId=X
router.delete('/:id', async (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  await garantirTabela(db);

  db.run('DELETE FROM padroes_prescricoes WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    console.log(`✅ Padrão de prescrição excluído: ${req.params.id}`);
    res.json({ success: true });
  });
});

// ⭐ Helper: parse medicamentos JSON → array
function parseMedicamentos(row) {
  if (!row) return row;
  try {
    if (row.medicamentos && typeof row.medicamentos === 'string') {
      row.medicamentos = JSON.parse(row.medicamentos);
    } else if (!row.medicamentos) {
      row.medicamentos = [];
    }
  } catch (e) {
    row.medicamentos = [];
  }
  // Converte controleEspecial para boolean
  row.controleEspecial = !!row.controleEspecial;
  return row;
}

module.exports = router;