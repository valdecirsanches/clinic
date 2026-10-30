// ==================== ROTAS DE CONVÊNIOS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// Função para garantir que a tabela existe
function garantirTabelaConvenios(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS convenios (
        id VARCHAR(255) PRIMARY KEY,
        nome TEXT NOT NULL,
        razaoSocial TEXT,
        cnpj TEXT,
        registroAns TEXT,
        telefone TEXT,
        email TEXT,
        site TEXT,
        contato TEXT,
        endereco TEXT,
        numero TEXT,
        bairro TEXT,
        cidade TEXT,
        uf TEXT,
        cep TEXT,
        banco TEXT,
        agencia TEXT,
        conta TEXT,
        diaCobranca INTEGER,
        diaPagamento INTEGER,
        validadeGuia INTEGER,
        observacoes TEXT,
        ativo INTEGER DEFAULT 1,
        criadoEm TEXT NOT NULL
      )
    `, (err) => {
      if (err) {
        console.error('❌ Erro ao criar tabela convenios:', err);
        reject(err);
      } else {
        // Migração: adiciona colunas novas se não existirem
        db.all("PRAGMA table_info(convenios)", [], (err2, columns) => {
          if (err2 || !columns) {
            // Continua com migração de planos_saude
            migrarPlanosSaude(db, resolve);
            return;
          }
          const colNames = columns.map((col) => col.name);
          const novasColunas = [
          { name: 'razaoSocial', type: 'TEXT' },
          { name: 'cnpj', type: 'TEXT' },
          { name: 'contato', type: 'TEXT' },
          { name: 'endereco', type: 'TEXT' },
          { name: 'numero', type: 'TEXT' },
          { name: 'bairro', type: 'TEXT' },
          { name: 'cidade', type: 'TEXT' },
          { name: 'uf', type: 'TEXT' },
          { name: 'cep', type: 'TEXT' },
          { name: 'banco', type: 'TEXT' },
          { name: 'agencia', type: 'TEXT' },
          { name: 'conta', type: 'TEXT' },
          { name: 'diaCobranca', type: 'INTEGER' },
          { name: 'diaPagamento', type: 'INTEGER' },
          { name: 'validadeGuia', type: 'INTEGER' }];


          let pending = 0;
          novasColunas.forEach((col) => {
            if (!colNames.includes(col.name)) {
              pending++;
              db.run(`ALTER TABLE convenios ADD COLUMN ${col.name} ${col.type}`, (errAlt) => {
                if (errAlt && !errAlt.message.includes('duplicate column')) {
                  console.error(`⚠️ Erro ao adicionar ${col.name}:`, errAlt.message);
                } else if (!errAlt) {
                  console.log(`✅ Coluna ${col.name} adicionada em convenios`);
                }
                pending--;
                if (pending === 0) migrarPlanosSaude(db, resolve);
              });
            }
          });

          if (pending === 0) migrarPlanosSaude(db, resolve);
        });
      }
    });
  });
}

function migrarPlanosSaude(db, resolve) {
  // Migração: adiciona convenioId na tabela planos_saude se não existir
  db.all("PRAGMA table_info(planos_saude)", [], (err2, columns) => {
    if (err2 || !columns) {
      resolve();
      return;
    }
    const hasConvenioId = columns.some((col) => col.name === 'convenioId');
    if (!hasConvenioId) {
      db.run('ALTER TABLE planos_saude ADD COLUMN convenioId TEXT', (err3) => {
        if (err3 && !err3.message.includes('duplicate column')) {
          console.error('⚠️ Erro ao adicionar convenioId em planos_saude:', err3.message);
        } else {
          console.log('✅ Coluna convenioId adicionada em planos_saude');
        }
        resolve();
      });
    } else {
      resolve();
    }
  });
}

// GET /api/convenios?clinicaId=c1 - Lista convênios
router.get('/', async (req, res) => {
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaConvenios(db);

    db.all('SELECT * FROM convenios ORDER BY nome ASC', [], (err, convenios) => {
      if (err) {
        console.error('❌ Erro ao buscar convênios:', err);
        return res.status(500).json({ error: err.message });
      }

      const convenioIds = (convenios || []).map((c) => c.id);

      if (convenioIds.length === 0) {
        return res.json((convenios || []).map((c) => ({ ...c, ativo: Boolean(c.ativo), planos: [] })));
      }

      // Busca planos de cada convênio
      const placeholders = convenioIds.map(() => '?').join(',');
      db.all(
        `SELECT * FROM planos_saude WHERE convenioId IN (${placeholders}) ORDER BY nome ASC`,
        convenioIds,
        (err2, planos) => {
          if (err2) {
            console.error('⚠️ Erro ao buscar planos dos convênios:', err2);
            // Retorna convênios sem planos
            return res.json((convenios || []).map((c) => ({ ...c, ativo: Boolean(c.ativo), planos: [] })));
          }

          const planosMap = {};
          (planos || []).forEach((p) => {
            if (!planosMap[p.convenioId]) planosMap[p.convenioId] = [];
            planosMap[p.convenioId].push({ ...p, ativo: Boolean(p.ativo) });
          });

          const resultado = (convenios || []).map((c) => ({
            ...c,
            ativo: Boolean(c.ativo),
            planos: planosMap[c.id] || []
          }));

          res.json(resultado);
        }
      );
    });
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/convenios/:id - Busca convênio por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaConvenios(db);

    db.get('SELECT * FROM convenios WHERE id = ?', [id], (err, convenio) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!convenio) {
        return res.status(404).json({ error: 'Convênio não encontrado' });
      }

      // Busca planos do convênio
      db.all('SELECT * FROM planos_saude WHERE convenioId = ? ORDER BY nome ASC', [id], (err2, planos) => {
        res.json({
          ...convenio,
          ativo: Boolean(convenio.ativo),
          planos: (planos || []).map((p) => ({ ...p, ativo: Boolean(p.ativo) }))
        });
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/convenios - Cria novo convênio
router.post('/', async (req, res) => {
  const { clinicaId, nome, razaoSocial, cnpj, registroAns, telefone, email, site, contato, endereco, numero, bairro, cidade, uf, cep, banco, agencia, conta, diaCobranca, diaPagamento, validadeGuia, observacoes, ativo } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }
  if (!nome) {
    return res.status(400).json({ error: 'nome é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaConvenios(db);

    const id = `conv_${Date.now()}`;
    const criadoEm = new Date().toISOString();

    db.run(
      `INSERT INTO convenios (id, nome, razaoSocial, cnpj, registroAns, telefone, email, site, contato, endereco, numero, bairro, cidade, uf, cep, banco, agencia, conta, diaCobranca, diaPagamento, validadeGuia, observacoes, ativo, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nome, razaoSocial || null, cnpj || null, registroAns || null, telefone || null, email || null, site || null, contato || null, endereco || null, numero || null, bairro || null, cidade || null, uf || null, cep || null, banco || null, agencia || null, conta || null, diaCobranca || null, diaPagamento || null, validadeGuia || null, observacoes || null, ativo !== false ? 1 : 0, criadoEm],
      function (err) {
        if (err) {
          console.error('❌ Erro ao criar convênio:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Convênio criado: ${id} - ${nome}`);
        res.json({ id, nome, razaoSocial, cnpj, registroAns, telefone, email, site, contato, endereco, numero, bairro, cidade, uf, cep, banco, agencia, conta, diaCobranca, diaPagamento, validadeGuia, observacoes, ativo: ativo !== false, criadoEm, planos: [] });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/convenios/:id - Atualiza convênio
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId, nome, razaoSocial, cnpj, registroAns, telefone, email, site, contato, endereco, numero, bairro, cidade, uf, cep, banco, agencia, conta, diaCobranca, diaPagamento, validadeGuia, observacoes, ativo } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaConvenios(db);

    db.run(
      `UPDATE convenios SET nome = ?, razaoSocial = ?, cnpj = ?, registroAns = ?, telefone = ?, email = ?, site = ?, contato = ?, endereco = ?, numero = ?, bairro = ?, cidade = ?, uf = ?, cep = ?, banco = ?, agencia = ?, conta = ?, diaCobranca = ?, diaPagamento = ?, validadeGuia = ?, observacoes = ?, ativo = ? WHERE id = ?`,
      [nome, razaoSocial || null, cnpj || null, registroAns || null, telefone || null, email || null, site || null, contato || null, endereco || null, numero || null, bairro || null, cidade || null, uf || null, cep || null, banco || null, agencia || null, conta || null, diaCobranca || null, diaPagamento || null, validadeGuia || null, observacoes || null, ativo !== false ? 1 : 0, id],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Convênio atualizado: ${id}`);
        res.json({ success: true });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/convenios/:id - Deleta convênio
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaConvenios(db);

    // Desvincula planos deste convênio
    db.run('UPDATE planos_saude SET convenioId = NULL WHERE convenioId = ?', [id], function (err) {
      if (err) {
        console.error('⚠️ Erro ao desvincular planos:', err);
      }

      db.run('DELETE FROM convenios WHERE id = ?', [id], function (err2) {
        if (err2) {
          return res.status(500).json({ error: err2.message });
        }
        console.log(`✅ Convênio deletado: ${id}`);
        res.json({ success: true });
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/convenios/:id/planos - Cria plano dentro de um convênio
router.post('/:id/planos', async (req, res) => {
  const { id: convenioId } = req.params;
  const { clinicaId, nome, tipo, cobertura, observacoes, ativo } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }
  if (!nome) {
    return res.status(400).json({ error: 'nome é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaConvenios(db);

    const id = `ps_${Date.now()}`;
    const criadoEm = new Date().toISOString();

    db.run(
      `INSERT INTO planos_saude (id, nome, convenioId, tipo, cobertura, observacoes, ativo, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nome, convenioId, tipo || 'individual', cobertura || null, observacoes || null, ativo !== false ? 1 : 0, criadoEm],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Plano criado: ${id} - ${nome} (convênio: ${convenioId})`);
        res.json({ id, nome, convenioId, tipo: tipo || 'individual', cobertura, observacoes, ativo: ativo !== false, criadoEm });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/convenios/:id/planos - Lista planos de um convênio
router.get('/:id/planos', async (req, res) => {
  const { id: convenioId } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaConvenios(db);

    db.all('SELECT * FROM planos_saude WHERE convenioId = ? ORDER BY nome ASC', [convenioId], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json((rows || []).map((r) => ({ ...r, ativo: Boolean(r.ativo) })));
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;