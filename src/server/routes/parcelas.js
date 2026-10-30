// ==================== ROTAS DE PARCELAS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// Função para criar a tabela de parcelas se não existir (MySQL-compatible)
function garantirTabelaParcelas(db) {
  return new Promise((resolve, reject) => {
    // ⭐ MySQL: usa VARCHAR em vez de TEXT para colunas com DEFAULT
    db.run(`
      CREATE TABLE IF NOT EXISTS parcelas (
        id VARCHAR(191) PRIMARY KEY,
        pacienteId VARCHAR(191) NOT NULL,
        profissionalId VARCHAR(191),
        numeroParcela INT NOT NULL,
        valorParcela DOUBLE NOT NULL,
        dataVencimento VARCHAR(50) NOT NULL,
        dataPagamento VARCHAR(50),
        status VARCHAR(50) NOT NULL DEFAULT 'pendente',
        formaPagamento VARCHAR(100),
        observacoes TEXT,
        criadoEm VARCHAR(50),
        dataEmissao VARCHAR(50)
      )
    `, (err) => {
      if (err) {
        // Se a tabela já existe com schema diferente, ignora o erro
        if (err.message && (err.message.includes('already exists') || err.message.includes('Duplicate'))) {
          console.log('⚠️ [parcelas] Tabela já existe, verificando colunas...');
        } else {
          console.error('❌ [parcelas] Erro ao criar tabela:', err.message);
          return reject(err);
        }
      }

      // ⭐ MySQL: usa INFORMATION_SCHEMA em vez de PRAGMA table_info
      db.all(`SELECT COLUMN_NAME as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parcelas'`, (err, columns) => {
        if (err) {
          // Fallback: tenta SHOW COLUMNS
          db.all(`SHOW COLUMNS FROM parcelas`, (err2, cols2) => {
            if (err2) {
              console.error('❌ [parcelas] Erro ao verificar colunas:', err2.message);
              return resolve(); // Continua mesmo com erro
            }
            const colunasExistentes = (cols2 || []).map((c) => c.Field || c.name);
            verificarColunasFaltantes(db, colunasExistentes, resolve);
          });
          return;
        }

        const colunasExistentes = (columns || []).map((c) => c.name);
        console.log('📋 [parcelas] Colunas existentes:', colunasExistentes.join(', '));
        verificarColunasFaltantes(db, colunasExistentes, resolve);
      });
    });
  });
}

function verificarColunasFaltantes(db, colunasExistentes, resolve) {
  // Lista de colunas que DEVEM existir (migrações)
  const colunasFaltantes = [
  { nome: 'dataEmissao', tipo: 'VARCHAR(50)' },
  { nome: 'profissionalId', tipo: 'VARCHAR(191)' },
  { nome: 'nossoNumero', tipo: 'VARCHAR(50)' },
  { nome: 'bancoConfigId', tipo: 'VARCHAR(191)' },
  { nome: 'boletoRegistrado', tipo: 'TINYINT DEFAULT 0' }].
  filter((col) => !colunasExistentes.includes(col.nome));

  if (colunasFaltantes.length === 0) {
    console.log('✅ [parcelas] Todas as colunas já existem');
    db.run(`UPDATE parcelas SET dataEmissao = criadoEm WHERE dataEmissao IS NULL AND criadoEm IS NOT NULL`, () => {
      resolve();
    });
    return;
  }

  console.log('🔧 [parcelas] Adicionando colunas faltantes:', colunasFaltantes.map((c) => c.nome).join(', '));

  let index = 0;
  function adicionarProximaColuna() {
    if (index >= colunasFaltantes.length) {
      console.log('✅ [parcelas] Migração concluída com sucesso!');
      db.run(`UPDATE parcelas SET dataEmissao = criadoEm WHERE dataEmissao IS NULL AND criadoEm IS NOT NULL`, () => {
        resolve();
      });
      return;
    }

    const col = colunasFaltantes[index];
    const sql = `ALTER TABLE parcelas ADD COLUMN ${col.nome} ${col.tipo}`;
    console.log(`🔧 [parcelas] Executando: ${sql}`);

    db.run(sql, (err) => {
      if (err) {
        if (err.message && (err.message.includes('Duplicate column') || err.message.includes('duplicate column'))) {
          console.log(`⚠️ [parcelas] Coluna ${col.nome} já existe (ignorando)`);
        } else {
          console.error(`❌ [parcelas] Erro ao adicionar coluna ${col.nome}:`, err.message);
        }
      } else {
        console.log(`✅ [parcelas] Coluna ${col.nome} adicionada com sucesso!`);
      }
      index++;
      adicionarProximaColuna();
    });
  }

  adicionarProximaColuna();
}

// Função para verificar se parcela está vencida
function verificarStatusVencido(parcela) {
  if (parcela.status === 'pago' || parcela.status === 'cancelado') {
    return parcela.status;
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const vencimento = new Date(parcela.dataVencimento + 'T12:00:00');
  vencimento.setHours(0, 0, 0, 0);

  if (vencimento < hoje) {
    return 'vencido';
  }

  return 'pendente';
}

// GET /api/parcelas - Lista parcelas
router.get('/', async (req, res) => {
  const { clinicaId, pacienteId } = req.query;

  console.log('🔍 GET /api/parcelas - clinicaId:', clinicaId, 'pacienteId:', pacienteId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaParcelas(db);

    let query = 'SELECT * FROM parcelas';
    let params = [];

    if (pacienteId) {
      query += ' WHERE pacienteId = ?';
      params.push(pacienteId);
    }

    query += ' ORDER BY criadoEm DESC LIMIT 500';

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar parcelas:', err);
        return res.status(500).json({ error: err.message });
      }

      // Atualiza status de vencido automaticamente
      const parcelasAtualizadas = (rows || []).map((p) => ({
        ...p,
        status: verificarStatusVencido(p)
      }));

      console.log(`✅ Retornando ${parcelasAtualizadas.length} parcelas`);
      res.json(parcelasAtualizadas);
    });
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/parcelas - Cria uma parcela
router.post('/', async (req, res) => {
  const { clinicaId, pacienteId, profissionalId, numeroParcela, valorParcela, dataVencimento, formaPagamento, observacoes, nossoNumero, bancoConfigId } = req.body;

  console.log('📝 POST /api/parcelas - clinicaId:', clinicaId, 'pacienteId:', pacienteId, 'profissionalId:', profissionalId);

  if (!clinicaId || !pacienteId) {
    return res.status(400).json({ error: 'clinicaId e pacienteId são obrigatórios' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaParcelas(db);

    const id = `parc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const criadoEm = new Date().toISOString();
    const dataEmissao = criadoEm;

    db.run(
      `INSERT INTO parcelas (id, pacienteId, profissionalId, numeroParcela, valorParcela, dataVencimento, dataPagamento, status, formaPagamento, observacoes, criadoEm, dataEmissao, nossoNumero, bancoConfigId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, pacienteId, profissionalId || null, numeroParcela || 1, valorParcela || 0, dataVencimento, null, 'pendente', formaPagamento || null, observacoes || null, criadoEm, dataEmissao, nossoNumero || null, bancoConfigId || null],
      function (err) {
        if (err) {
          console.error('❌ Erro ao criar parcela:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Parcela criada: ${id}${nossoNumero ? ' (nossoNumero: ' + nossoNumero + ')' : ''}`);
        res.json({ id, pacienteId, profissionalId, numeroParcela, valorParcela, dataVencimento, status: 'pendente', formaPagamento, observacoes, criadoEm, dataEmissao, nossoNumero, bancoConfigId });
      }
    );
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/parcelas/gerar-contrato - Gera múltiplas parcelas
router.post('/gerar-contrato', async (req, res) => {
  const { clinicaId, pacienteId, profissionalId, valorTotal, numeroParcelas, diaVencimento, formaPagamento, observacoes } = req.body;

  console.log('📝 POST /api/parcelas/gerar-contrato');
  console.log('   - clinicaId:', clinicaId);
  console.log('   - pacienteId:', pacienteId);
  console.log('   - profissionalId:', profissionalId);
  console.log('   - valorTotal:', valorTotal);
  console.log('   - numeroParcelas:', numeroParcelas);
  console.log('   - diaVencimento:', diaVencimento);

  if (!clinicaId || !pacienteId) {
    return res.status(400).json({ error: 'clinicaId e pacienteId são obrigatórios' });
  }

  if (!valorTotal || valorTotal <= 0) {
    return res.status(400).json({ error: 'valorTotal deve ser maior que zero' });
  }

  if (!numeroParcelas || numeroParcelas < 1) {
    return res.status(400).json({ error: 'numeroParcelas deve ser pelo menos 1' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaParcelas(db);

    const valorParcela = valorTotal / numeroParcelas;
    const parcelasCriadas = [];
    const criadoEm = new Date().toISOString();

    // Calcula as datas de vencimento
    const hoje = new Date();
    let mesAtual = hoje.getMonth();
    let anoAtual = hoje.getFullYear();

    // Se o dia de vencimento já passou neste mês, começa no próximo
    if (hoje.getDate() > (diaVencimento || 10)) {
      mesAtual++;
      if (mesAtual > 11) {
        mesAtual = 0;
        anoAtual++;
      }
    }

    for (let i = 0; i < numeroParcelas; i++) {
      const id = `parc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${i}`;

      // Calcula a data de vencimento
      let mes = mesAtual + i;
      let ano = anoAtual;
      while (mes > 11) {
        mes -= 12;
        ano++;
      }

      // Ajusta o dia para não ultrapassar o último dia do mês
      const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
      const diaFinal = Math.min(diaVencimento || 10, ultimoDiaMes);

      const dataVencimento = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`;

      const parcela = {
        id,
        pacienteId,
        profissionalId: profissionalId || null,
        numeroParcela: i + 1,
        valorParcela: Math.round(valorParcela * 100) / 100, // Arredonda para 2 casas decimais
        dataVencimento,
        dataPagamento: null,
        status: 'pendente',
        formaPagamento: formaPagamento || null,
        observacoes: observacoes || null,
        criadoEm,
        dataEmissao: criadoEm
      };

      parcelasCriadas.push(parcela);
    }

    // Insere todas as parcelas
    const insertPromises = parcelasCriadas.map((p) => {
      return new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO parcelas (id, pacienteId, profissionalId, numeroParcela, valorParcela, dataVencimento, dataPagamento, status, formaPagamento, observacoes, criadoEm, dataEmissao)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, p.pacienteId, p.profissionalId, p.numeroParcela, p.valorParcela, p.dataVencimento, p.dataPagamento, p.status, p.formaPagamento, p.observacoes, p.criadoEm, p.dataEmissao],
          function (err) {
            if (err) reject(err);else
            resolve(p);
          }
        );
      });
    });

    await Promise.all(insertPromises);

    console.log(`✅ Contrato gerado: ${parcelasCriadas.length} parcelas criadas`);
    res.json({
      success: true,
      parcelas: parcelasCriadas,
      resumo: {
        valorTotal,
        numeroParcelas,
        valorParcela: Math.round(valorParcela * 100) / 100
      }
    });
  } catch (err) {
    console.error('❌ Erro ao gerar contrato:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/parcelas/:id - Atualiza uma parcela
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId, status, dataPagamento, formaPagamento, observacoes } = req.body;

  console.log('📝 PUT /api/parcelas/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaParcelas(db);

    // Busca a parcela atual
    const parcelaAtual = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM parcelas WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);else
        resolve(row);
      });
    });

    if (!parcelaAtual) {
      return res.status(404).json({ error: 'Parcela não encontrada' });
    }

    // Monta os campos a atualizar
    const updates = [];
    const params = [];

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (dataPagamento !== undefined) {
      updates.push('dataPagamento = ?');
      params.push(dataPagamento);
    }

    if (formaPagamento !== undefined) {
      updates.push('formaPagamento = ?');
      params.push(formaPagamento);
    }

    if (observacoes !== undefined) {
      updates.push('observacoes = ?');
      params.push(observacoes);
    }

    if (req.body.nossoNumero !== undefined) {
      updates.push('nossoNumero = ?');
      params.push(req.body.nossoNumero);
    }

    if (req.body.bancoConfigId !== undefined) {
      updates.push('bancoConfigId = ?');
      params.push(req.body.bancoConfigId);
    }

    if (req.body.boletoRegistrado !== undefined) {
      updates.push('boletoRegistrado = ?');
      params.push(req.body.boletoRegistrado ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.json({ success: true, message: 'Nenhuma alteração' });
    }

    params.push(id);

    db.run(
      `UPDATE parcelas SET ${updates.join(', ')} WHERE id = ?`,
      params,
      function (err) {
        if (err) {
          console.error('❌ Erro ao atualizar parcela:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Parcela atualizada: ${id}`);
        res.json({ success: true });
      }
    );
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/parcelas/:id - Deleta uma parcela
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  console.log('🗑️ DELETE /api/parcelas/:id - id:', id, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaParcelas(db);

    db.run('DELETE FROM parcelas WHERE id = ?', [id], function (err) {
      if (err) {
        console.error('❌ Erro ao deletar parcela:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Parcela deletada: ${id}`);
      res.json({ success: true });
    });
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/parcelas - Deleta todas as parcelas de um paciente (contrato inteiro)
router.delete('/', async (req, res) => {
  const { clinicaId, pacienteId } = req.query;

  console.log('🗑️ DELETE /api/parcelas (todas) - clinicaId:', clinicaId, 'pacienteId:', pacienteId);

  if (!clinicaId || !pacienteId) {
    return res.status(400).json({ error: 'clinicaId e pacienteId são obrigatórios' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaParcelas(db);

    db.run('DELETE FROM parcelas WHERE pacienteId = ?', [pacienteId], function (err) {
      if (err) {
        console.error('❌ Erro ao deletar parcelas:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Todas as parcelas do paciente ${pacienteId} foram deletadas`);
      res.json({ success: true, deletadas: this.changes });
    });
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;