// ==================== ROTAS DE FINANCEIRO ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// ⭐ Função robusta para garantir que a tabela financeiro existe com TODAS as colunas (MySQL-compatible)
function garantirTabelaFinanceiro(db) {
  return new Promise((resolve, reject) => {
    // 1. Cria a tabela se não existir — MySQL: usa VARCHAR em vez de TEXT para colunas com DEFAULT
    db.run(`
      CREATE TABLE IF NOT EXISTS financeiro (
        id VARCHAR(191) PRIMARY KEY,
        pacienteId VARCHAR(191) NOT NULL,
        profissionalId VARCHAR(191),
        usuarioId VARCHAR(191),
        numeroControle INT,
        tipo VARCHAR(50) NOT NULL,
        descricao TEXT,
        valor DOUBLE NOT NULL,
        dataVencimento VARCHAR(50),
        dataPagamento VARCHAR(50),
        status VARCHAR(50) DEFAULT 'pendente',
        formaPagamento VARCHAR(100),
        parcela INT,
        totalParcelas INT,
        observacoes TEXT,
        criadoEm VARCHAR(50),
        dataEmissao VARCHAR(50)
      )
    `, (err) => {
      if (err) {
        if (err.message && (err.message.includes('already exists') || err.message.includes('Duplicate'))) {
          console.log('⚠️ [financeiro] Tabela já existe, verificando colunas...');
        } else {
          console.error('❌ [financeiro] Erro ao criar tabela:', err.message);
          return reject(err);
        }
      }

      // 2. Verifica quais colunas existem — MySQL: usa INFORMATION_SCHEMA em vez de PRAGMA
      db.all(`SELECT COLUMN_NAME as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financeiro'`, (err, columns) => {
        if (err) {
          // Fallback: tenta SHOW COLUMNS
          db.all(`SHOW COLUMNS FROM financeiro`, (err2, cols2) => {
            if (err2) {
              console.error('❌ [financeiro] Erro ao verificar colunas:', err2.message);
              return resolve(); // Continua mesmo com erro
            }
            const colunasExistentes = (cols2 || []).map((c) => c.Field || c.name);
            verificarColunasFinanceiro(db, colunasExistentes, resolve);
          });
          return;
        }

        const colunasExistentes = (columns || []).map((c) => c.name);
        console.log('📋 [financeiro] Colunas existentes:', colunasExistentes.join(', '));
        verificarColunasFinanceiro(db, colunasExistentes, resolve);
      });
    });
  });
}

function verificarColunasFinanceiro(db, colunasExistentes, resolve) {
  // 3. Lista de colunas que DEVEM existir (migrações) — MySQL types
  const colunasFaltantes = [
  { nome: 'dataEmissao', tipo: 'VARCHAR(50)' },
  { nome: 'profissionalId', tipo: 'VARCHAR(191)' },
  { nome: 'usuarioId', tipo: 'VARCHAR(191)' },
  { nome: 'numeroControle', tipo: 'INT' }].
  filter((col) => !colunasExistentes.includes(col.nome));

  if (colunasFaltantes.length === 0) {
    console.log('✅ [financeiro] Todas as colunas já existem');
    migrarDadosAntigos(db, () => resolve());
    return;
  }

  console.log('🔧 [financeiro] Adicionando colunas faltantes:', colunasFaltantes.map((c) => c.nome).join(', '));

  let index = 0;
  function adicionarProximaColuna() {
    if (index >= colunasFaltantes.length) {
      console.log('✅ [financeiro] Migração de colunas concluída!');
      migrarDadosAntigos(db, () => resolve());
      return;
    }

    const col = colunasFaltantes[index];
    const sql = `ALTER TABLE financeiro ADD COLUMN ${col.nome} ${col.tipo}`;
    console.log(`🔧 [financeiro] Executando: ${sql}`);

    db.run(sql, (err) => {
      if (err) {
        if (err.message && (err.message.includes('Duplicate column') || err.message.includes('duplicate column'))) {
          console.log(`⚠️ [financeiro] Coluna ${col.nome} já existe (ignorando)`);
        } else {
          console.error(`❌ [financeiro] Erro ao adicionar coluna ${col.nome}:`, err.message);
        }
      } else {
        console.log(`✅ [financeiro] Coluna ${col.nome} adicionada com sucesso!`);
      }
      index++;
      adicionarProximaColuna();
    });
  }

  adicionarProximaColuna();
}

// ⭐ Migra dados antigos: preenche dataEmissao e extrai numeroControle do JSON de observacoes
function migrarDadosAntigos(db, callback) {
  // 1. Preenche dataEmissao para registros antigos
  db.run(`UPDATE financeiro SET dataEmissao = criadoEm WHERE dataEmissao IS NULL AND criadoEm IS NOT NULL`, () => {
    // 2. Extrai numeroControle do JSON de observacoes para registros que ainda não têm
    db.all(`SELECT id, observacoes FROM financeiro WHERE numeroControle IS NULL AND observacoes IS NOT NULL AND tipo = 'recibo'`, (err, rows) => {
      if (err || !rows || rows.length === 0) {
        if (callback) callback();
        return;
      }

      console.log(`🔧 [financeiro] Migrando numeroControle de ${rows.length} registros antigos...`);

      let migrados = 0;
      let pendentes = rows.length;

      rows.forEach((row) => {
        try {
          const obs = JSON.parse(row.observacoes);
          if (obs.numeroControle) {
            db.run(`UPDATE financeiro SET numeroControle = ? WHERE id = ?`, [obs.numeroControle, row.id], (err) => {
              if (!err) migrados++;
              pendentes--;
              if (pendentes === 0) {
                console.log(`✅ [financeiro] ${migrados} registros migrados com numeroControle`);
                if (callback) callback();
              }
            });
          } else {
            pendentes--;
            if (pendentes === 0) {
              console.log(`✅ [financeiro] ${migrados} registros migrados com numeroControle`);
              if (callback) callback();
            }
          }
        } catch (e) {
          pendentes--;
          if (pendentes === 0) {
            console.log(`✅ [financeiro] ${migrados} registros migrados com numeroControle`);
            if (callback) callback();
          }
        }
      });
    });
  });
}

// GET /api/financeiro?clinicaId=c1 - Lista registros financeiros de uma clínica
router.get('/', async (req, res) => {
  const { clinicaId, pacienteId } = req.query;

  console.log('🔍 GET /api/financeiro - clinicaId:', clinicaId, 'pacienteId:', pacienteId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaFinanceiro(db);

    let query = 'SELECT * FROM financeiro';
    let params = [];

    if (pacienteId) {
      query += ' WHERE pacienteId = ?';
      params.push(pacienteId);
    }

    query += ' ORDER BY dataVencimento DESC';

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar financeiro:', err);
        return res.status(500).json({ error: err.message });
      }

      console.log(`✅ Retornando ${(rows || []).length} registros financeiros`);
      res.json(rows || []);
    });
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// ⭐⭐⭐ GET /api/financeiro/proximo-numero - Retorna próximo número de controle sequencial (GLOBAL da clínica)
router.get('/proximo-numero', async (req, res) => {
  const { clinicaId } = req.query;

  console.log('🔢 GET /api/financeiro/proximo-numero - clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaFinanceiro(db);

    // Busca o MAX de numeroControle de TODOS os recibos da clínica (não por paciente)
    db.get(
      `SELECT MAX(numeroControle) as maxNum FROM financeiro WHERE tipo = 'recibo'`,
      [],
      (err, row) => {
        if (err) {
          console.error('❌ Erro ao buscar próximo número:', err);
          return res.status(500).json({ error: err.message });
        }

        const maxNum = row?.maxNum || 0;
        const proximoNumero = maxNum + 1;

        console.log(`🔢 [financeiro] MAX numeroControle: ${maxNum}, próximo: ${proximoNumero}`);

        // ⭐ MySQL: usa INFORMATION_SCHEMA em vez de PRAGMA
        db.all(`SELECT COLUMN_NAME as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'financeiro'`, (err2, columns) => {
          const colunas = (columns || []).map((c) => c.name);
          res.json({
            proximoNumero,
            maxNumeroControle: maxNum,
            colunas,
            temNumeroControle: colunas.includes('numeroControle'),
            temUsuarioId: colunas.includes('usuarioId'),
            temProfissionalId: colunas.includes('profissionalId')
          });
        });
      }
    );
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/financeiro/:id - Busca registro financeiro por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.get('SELECT * FROM financeiro WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar registro financeiro:', err);
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({ error: 'Registro financeiro não encontrado' });
    }

    res.json(row);
  });
});

// POST /api/financeiro - Cria novo registro financeiro
router.post('/', async (req, res) => {
  const {
    clinicaId, pacienteId, profissionalId, usuarioId, numeroControle,
    tipo, descricao, valor,
    dataVencimento, dataPagamento, status, formaPagamento,
    parcela, totalParcelas, observacoes
  } = req.body;

  console.log('📝 POST /api/financeiro - clinicaId:', clinicaId, 'pacienteId:', pacienteId, 'profissionalId:', profissionalId, 'usuarioId:', usuarioId, 'numeroControle:', numeroControle);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!pacienteId) {
    return res.status(400).json({ error: 'pacienteId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaFinanceiro(db);

    const id = `fin_${Date.now()}`;
    const criadoEm = new Date().toISOString();
    const dataEmissao = criadoEm;

    db.run(
      `INSERT INTO financeiro (id, pacienteId, profissionalId, usuarioId, numeroControle, tipo, descricao, valor, dataVencimento, dataPagamento, status, formaPagamento, parcela, totalParcelas, observacoes, criadoEm, dataEmissao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, pacienteId, profissionalId || null, usuarioId || null, numeroControle || null, tipo || 'receita', descricao || null, valor || 0, dataVencimento || null, dataPagamento || null, status || 'pendente', formaPagamento || null, parcela || null, totalParcelas || null, observacoes || null, criadoEm, dataEmissao],
      function (err) {
        if (err) {
          console.error('❌ Erro ao criar registro financeiro:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Registro financeiro criado: ${id} (numeroControle: ${numeroControle || 'N/A'}, profissionalId: ${profissionalId || 'N/A'}, usuarioId: ${usuarioId || 'N/A'})`);
        res.json({ id, pacienteId, profissionalId, usuarioId, numeroControle, tipo, descricao, valor, dataVencimento, dataPagamento, status, formaPagamento, parcela, totalParcelas, observacoes, criadoEm, dataEmissao });
      }
    );
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/financeiro/:id - Atualiza registro financeiro
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const {
    clinicaId, profissionalId, usuarioId, numeroControle, tipo, descricao, valor,
    dataVencimento, dataPagamento, status, formaPagamento,
    parcela, totalParcelas, observacoes
  } = req.body;

  console.log('📝 PUT /api/financeiro/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run(
    `UPDATE financeiro SET profissionalId = ?, usuarioId = ?, numeroControle = ?, tipo = ?, descricao = ?, valor = ?, dataVencimento = ?, dataPagamento = ?, status = ?, formaPagamento = ?, parcela = ?, totalParcelas = ?, observacoes = ? WHERE id = ?`,
    [profissionalId || null, usuarioId || null, numeroControle || null, tipo, descricao || null, valor || 0, dataVencimento || null, dataPagamento || null, status || 'pendente', formaPagamento || null, parcela || null, totalParcelas || null, observacoes || null, id],
    function (err) {
      if (err) {
        console.error('❌ Erro ao atualizar registro financeiro:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Registro financeiro atualizado: ${id}`);
      res.json({ success: true });
    }
  );
});

// DELETE /api/financeiro/:id - Deleta registro financeiro
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  console.log('🗑️ DELETE /api/financeiro/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run('DELETE FROM financeiro WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ Erro ao deletar registro financeiro:', err);
      return res.status(500).json({ error: err.message });
    }
    console.log(`✅ Registro financeiro deletado: ${id}`);
    res.json({ success: true });
  });
});

module.exports = router;