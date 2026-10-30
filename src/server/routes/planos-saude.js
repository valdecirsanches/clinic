// ==================== ROTAS DE PLANOS DE SAÚDE ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// Função para garantir que a tabela existe
function garantirTabelaPlanosSaude(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS planos_saude (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        registroAns TEXT,
        tipo TEXT DEFAULT 'individual',
        cobertura TEXT,
        telefone TEXT,
        email TEXT,
        site TEXT,
        observacoes TEXT,
        convenioId TEXT,
        ativo INTEGER DEFAULT 1,
        criadoEm TEXT NOT NULL
      )
    `, (err) => {
      if (err) {
        console.error('❌ Erro ao criar tabela planos_saude:', err);
        reject(err);
      } else {
        // Migração: adiciona convenioId se não existir
        db.all("PRAGMA table_info(planos_saude)", [], (err2, columns) => {
          if (err2 || !columns) {
            resolve();
            return;
          }
          const hasConvenioId = columns.some((col) => col.name === 'convenioId');
          if (!hasConvenioId) {
            db.run('ALTER TABLE planos_saude ADD COLUMN convenioId TEXT', (err3) => {
              if (err3 && !err3.message.includes('duplicate column')) {
                console.error('⚠️ Erro ao adicionar convenioId:', err3.message);
              }
              resolve();
            });
          } else {
            resolve();
          }
        });
      }
    });
  });
}

// GET /api/planos-saude?clinicaId=c1 - Lista planos de saúde de uma clínica
router.get('/', async (req, res) => {
  const { clinicaId, convenioId } = req.query;

  console.log('🔍 GET /api/planos-saude - clinicaId:', clinicaId, 'convenioId:', convenioId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    await garantirTabelaPlanosSaude(db);

    let query = 'SELECT ps.*, c.nome as convenioNome FROM planos_saude ps LEFT JOIN convenios c ON ps.convenioId = c.id';
    const params = [];

    if (convenioId) {
      query += ' WHERE ps.convenioId = ?';
      params.push(convenioId);
    }

    query += ' ORDER BY ps.nome ASC';

    db.all(query, params, (err, rows) => {
      if (err) {
        // Fallback sem JOIN se tabela convenios não existir
        console.warn('⚠️ Fallback sem JOIN convenios:', err.message);
        db.all('SELECT * FROM planos_saude ORDER BY nome ASC', [], (err2, rows2) => {
          if (err2) {
            return res.status(500).json({ error: err2.message });
          }
          res.json((rows2 || []).map((row) => ({ ...row, ativo: Boolean(row.ativo), convenioNome: null })));
        });
        return;
      }

      const planos = (rows || []).map((row) => ({
        ...row,
        ativo: Boolean(row.ativo)
      }));

      console.log(`✅ Retornando ${planos.length} planos de saúde`);
      res.json(planos);
    });
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/planos-saude/:id - Busca plano de saúde por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    await garantirTabelaPlanosSaude(db);

    db.get('SELECT * FROM planos_saude WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error('❌ Erro ao buscar plano de saúde:', err);
        return res.status(500).json({ error: err.message });
      }

      if (!row) {
        return res.status(404).json({ error: 'Plano de saúde não encontrado' });
      }

      res.json({
        ...row,
        ativo: Boolean(row.ativo)
      });
    });
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/planos-saude - Cria novo plano de saúde
router.post('/', async (req, res) => {
  const { clinicaId, nome, registroAns, tipo, cobertura, telefone, email, site, observacoes, ativo, convenioId } = req.body;

  console.log('📝 POST /api/planos-saude - clinicaId:', clinicaId, 'nome:', nome, 'convenioId:', convenioId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!nome) {
    return res.status(400).json({ error: 'nome é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    const id = `ps_${Date.now()}`;
    const criadoEm = new Date().toISOString();

    await garantirTabelaPlanosSaude(db);

    db.run(
      `INSERT INTO planos_saude (id, nome, registroAns, tipo, cobertura, telefone, email, site, observacoes, convenioId, ativo, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nome, registroAns || null, tipo || 'individual', cobertura || null, telefone || null, email || null, site || null, observacoes || null, convenioId || null, ativo !== false ? 1 : 0, criadoEm],
      function (err) {
        if (err) {
          console.error('❌ Erro ao criar plano de saúde:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Plano de saúde criado: ${id}`);
        res.json({ id, nome, registroAns, tipo: tipo || 'individual', cobertura, telefone, email, site, observacoes, convenioId: convenioId || null, ativo: ativo !== false, criadoEm });
      }
    );
  } catch (err) {
    console.error('❌ Erro ao criar plano de saúde:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/planos-saude/:id - Atualiza plano de saúde
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId, nome, registroAns, tipo, cobertura, telefone, email, site, observacoes, ativo, convenioId } = req.body;

  console.log('📝 PUT /api/planos-saude/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    await garantirTabelaPlanosSaude(db);

    db.run(
      `UPDATE planos_saude SET nome = ?, registroAns = ?, tipo = ?, cobertura = ?, telefone = ?, email = ?, site = ?, observacoes = ?, convenioId = ?, ativo = ? WHERE id = ?`,
      [nome, registroAns || null, tipo || 'individual', cobertura || null, telefone || null, email || null, site || null, observacoes || null, convenioId || null, ativo !== false ? 1 : 0, id],
      function (err) {
        if (err) {
          console.error('❌ Erro ao atualizar plano de saúde:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Plano de saúde atualizado: ${id}`);
        res.json({ success: true });
      }
    );
  } catch (err) {
    console.error('❌ Erro ao atualizar plano de saúde:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/planos-saude/:id - Deleta plano de saúde
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  console.log('🗑️ DELETE /api/planos-saude/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    await garantirTabelaPlanosSaude(db);

    // Primeiro, remove a referência dos pacientes
    db.run('UPDATE pacientes SET planoSaudeId = NULL WHERE planoSaudeId = ?', [id], function (err) {
      if (err) {
        console.error('❌ Erro ao desvincular pacientes:', err);
      }

      // Depois, deleta o plano
      db.run('DELETE FROM planos_saude WHERE id = ?', [id], function (err) {
        if (err) {
          console.error('❌ Erro ao deletar plano de saúde:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Plano de saúde deletado: ${id}`);
        res.json({ success: true });
      });
    });
  } catch (err) {
    console.error('❌ Erro ao deletar plano de saúde:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/planos-saude/:id/pacientes - Lista pacientes de um plano
router.get('/:id/pacientes', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    db.all('SELECT id, nome, cpf, telefone, email FROM pacientes WHERE planoSaudeId = ? AND (deletado IS NULL OR deletado = 0)', [id], (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar pacientes do plano:', err);
        return res.status(500).json({ error: err.message });
      }

      res.json(rows || []);
    });
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;