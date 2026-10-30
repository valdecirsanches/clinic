// ==================== ROTAS DE PACIENTES ====================

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const { getClinicaDB } = require('../databaseClinica');
const { upload, uploadsDir } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// ⭐⭐⭐ CACHE DE CONTAGEM TOTAL DE PACIENTES POR CLÍNICA ⭐⭐⭐
// O COUNT(*) sobre tabelas grandes (100k+ registros) leva centenas de ms e
// estava sendo recalculado em CADA GET /api/pacientes — inclusive nos probes
// do dashboard que chamam com limit=1 só para descobrir o total. Isso fazia o
// backend "ficar fazendo a mesma coisa" o tempo todo. Cacheamos o total por
// clínica (apenas quando NÃO há busca/titularId) e invalidamos em qualquer
// escrita, então a contagem para de ser recalculada a cada requisição.
const countCache = new Map(); // clinicaId -> { total, ts }
const COUNT_CACHE_TTL_MS = 30000; // 30s

function getCachedCount(clinicaId) {
  const entry = countCache.get(clinicaId);
  if (entry && Date.now() - entry.ts < COUNT_CACHE_TTL_MS) {
    return entry.total;
  }
  return null;
}

function setCachedCount(clinicaId, total) {
  countCache.set(clinicaId, { total, ts: Date.now() });
}

function invalidateCountCache(clinicaId) {
  if (clinicaId) countCache.delete(clinicaId);
}

// ⭐ FUNÇÃO PARA GERAR MATRÍCULA AUTOMÁTICA
async function gerarMatriculaAutomatica(db, clinicaId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT matricula FROM pacientes WHERE matricula LIKE 'MAT%' ORDER BY matricula DESC LIMIT 1`,
      [],
      (err, row) => {
        if (err) {
          console.error('❌ Erro ao buscar última matrícula:', err);
          resolve(`MAT${Date.now().toString().slice(-8)}`);
          return;
        }

        let proximoNumero = 1;

        if (row && row.matricula) {
          const match = row.matricula.match(/MAT(\d+)/);
          if (match) {
            proximoNumero = parseInt(match[1], 10) + 1;
          }
        }

        const matricula = `MAT${proximoNumero.toString().padStart(8, '0')}`;
        console.log(`🔢 Matrícula gerada: ${matricula}`);
        resolve(matricula);
      }
    );
  });
}

// ⭐ FUNÇÃO PARA GERAR NÚMERO DE CONTRATO AUTOMÁTICO (somente números)
async function gerarNumeroContratoAutomatico(db, clinicaId) {
  return new Promise((resolve, reject) => {
    // Busca TODOS os contratos para extrair o maior número (compatível com CTR antigos e numéricos novos)
    db.all(
      `SELECT numeroContrato FROM pacientes WHERE numeroContrato IS NOT NULL AND numeroContrato != ''`,
      [],
      (err, rows) => {
        if (err) {
          console.error('❌ Erro ao buscar contratos:', err);
          resolve('00000001');
          return;
        }

        let maiorNumero = 0;

        if (rows && rows.length > 0) {
          for (const row of rows) {
            const val = row.numeroContrato || '';
            // Extrai apenas dígitos do contrato (funciona com "CTR00000015", "00000015", "15", etc)
            const digits = val.replace(/\D/g, '');
            if (digits) {
              const num = parseInt(digits, 10);
              if (num > maiorNumero) {
                maiorNumero = num;
              }
            }
          }
        }

        const proximoNumero = maiorNumero + 1;
        const contrato = proximoNumero.toString().padStart(8, '0');
        console.log(`🔢 Número de contrato gerado: ${contrato} (anterior: ${maiorNumero})`);
        resolve(contrato);
      }
    );
  });
}

// ⭐ FUNÇÃO PARA OBTER COLUNAS DA TABELA (compatível MySQL)
async function getTableColumns(db) {
  return new Promise((resolve, reject) => {
    // Usa INFORMATION_SCHEMA (MySQL) em vez de PRAGMA (SQLite)
    db.all(
      `SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE, COLUMN_DEFAULT as dflt_value 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pacientes'`,
      [],
      (err, rows) => {
        if (err) {
          console.error('❌ Erro ao buscar colunas:', err);
          // Fallback: tenta SHOW COLUMNS
          db.all('SHOW COLUMNS FROM pacientes', [], (err2, rows2) => {
            if (err2) {
              reject(err2);
              return;
            }
            // SHOW COLUMNS retorna: Field, Type, Null, Key, Default, Extra
            const columns = (rows2 || []).map((r) => ({
              name: r.Field,
              type: r.Type
            }));
            resolve(columns);
          });
          return;
        }
        resolve(rows || []);
      }
    );
  });
}

// ⭐ FUNÇÃO PARA GARANTIR COLUNAS OBRIGATÓRIAS (soft delete + numeroContrato) - compatível MySQL
async function garantirColunasDeletado(db, clinicaId) {
  try {
    const columns = await getTableColumns(db);
    const columnNames = columns.map((c) => c.name);

    // Colunas obrigatórias que devem existir
    const colunasObrigatorias = [
    { name: 'deletado', type: 'TINYINT(1) DEFAULT 0' },
    { name: 'deletadoEm', type: 'VARCHAR(50)' },
    { name: 'numeroContrato', type: 'VARCHAR(100)' },
    // ⭐ Campos financeiros do contrato
    { name: 'tipoCobranca', type: 'VARCHAR(50)' },
    { name: 'valorMensalidade', type: 'DECIMAL(10,2)' },
    { name: 'diaVencimentoMensalidade', type: 'INT' },
    { name: 'formaPagamentoPadrao', type: 'VARCHAR(50)' },
    { name: 'profissionalFinanceiroId', type: 'VARCHAR(191)' },
    { name: 'contratoObservacoes', type: 'TEXT' },
    // ⭐ Campos de vínculo familiar (titular/dependente)
    { name: 'titularId', type: 'VARCHAR(191)' },
    { name: 'parentesco', type: 'VARCHAR(100)' },
    // Aniversário
    { name: 'felicitarAniversario', type: 'TINYINT(1) DEFAULT 1' }];


    const promises = [];

    for (const col of colunasObrigatorias) {
      if (!columnNames.includes(col.name)) {
        console.log(`🔧 [MIGRAÇÃO] Adicionando coluna '${col.name}' na tabela pacientes da clínica ${clinicaId}`);
        promises.push(new Promise((res, rej) => {
          db.run(`ALTER TABLE pacientes ADD COLUMN ${col.name} ${col.type}`, (err) => {
            if (err && !err.message.includes('Duplicate column')) {
              console.error(`❌ Erro ao adicionar coluna ${col.name}:`, err);
              rej(err);
            } else {
              console.log(`✅ Coluna '${col.name}' adicionada com sucesso!`);
              res();
            }
          });
        }));
      }
    }

    await Promise.all(promises);
    return { migrated: promises.length > 0 };
  } catch (err) {
    console.error('❌ Erro ao garantir colunas obrigatórias:', err);
    return { migrated: false };
  }
}

// ⭐ GET /api/pacientes/proximo-contrato - Retorna o próximo número de contrato disponível
router.get('/proximo-contrato', async (req, res) => {
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  try {
    const numeroContrato = await gerarNumeroContratoAutomatico(db, clinicaId);
    res.json({ numeroContrato });
  } catch (err) {
    console.error('❌ Erro ao gerar próximo contrato:', err);
    res.status(500).json({ error: err.message });
  }
});

// ⭐ GET /api/pacientes/diagnostico/deletados - Diagnóstico de soft delete
router.get('/diagnostico/deletados', async (req, res) => {
  const { clinicaId } = req.query;

  console.log('🔍 [DIAGNÓSTICO DELETADOS] clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  try {
    const migrationResult = await garantirColunasDeletado(db, clinicaId);
    const columns = await getTableColumns(db);

    // Conta pacientes por status de deletado
    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN deletado = 1 THEN 1 ELSE 0 END) as deletados,
          SUM(CASE WHEN deletado IS NULL OR deletado = 0 THEN 1 ELSE 0 END) as ativos
        FROM pacientes
      `, [], (err, row) => {
        if (err) reject(err);else
        resolve(row);
      });
    });

    // Lista pacientes deletados
    const deletados = await new Promise((resolve, reject) => {
      db.all(`
        SELECT id, nome, deletado, deletadoEm 
        FROM pacientes 
        WHERE deletado = 1 
        ORDER BY deletadoEm DESC 
        LIMIT 20
      `, [], (err, rows) => {
        if (err) reject(err);else
        resolve(rows || []);
      });
    });

    res.json({
      clinicaId,
      migration: migrationResult,
      columns: columns.map((c) => c.name),
      hasDeletadoColumn: columns.some((c) => c.name === 'deletado'),
      hasDeletadoEmColumn: columns.some((c) => c.name === 'deletadoEm'),
      stats,
      deletados,
      message: migrationResult.migrated ?
      '✅ Migração executada! Colunas adicionadas.' :
      '✅ Colunas já existem. Soft delete funcionando.'
    });
  } catch (err) {
    console.error('❌ Erro no diagnóstico:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pacientes?clinicaId=c1 - Lista pacientes de uma clínica
router.get('/', async (req, res) => {
  const { clinicaId, page = 1, limit = 50, search = '', titularId = '' } = req.query;

  console.log('🔍 [GET /api/pacientes] ==================== INÍCIO ====================');
  console.log('🔍 [GET /api/pacientes] Params:', { clinicaId, page, limit, search, titularId });

  if (!clinicaId) {
    console.error('❌ [GET /api/pacientes] clinicaId não fornecido');
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  // Garante colunas obrigatórias (deletado, deletadoEm, numeroContrato)
  try {
    await garantirColunasDeletado(db, clinicaId);
  } catch (err) {
    console.error('⚠️ Erro na migração de colunas:', err);
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  // ⭐ Verifica quais colunas existem para montar query segura
  let colunasDisponiveis = [];
  try {
    const columns = await getTableColumns(db);
    colunasDisponiveis = columns.map((c) => c.name);
  } catch (err) {
    console.warn('⚠️ Erro ao listar colunas, usando query básica:', err.message);
  }

  const hasDeletado = colunasDisponiveis.includes('deletado');
  const hasNumeroContrato = colunasDisponiveis.includes('numeroContrato');

  console.log('🔍 [GET /api/pacientes] Colunas: deletado=', hasDeletado, 'numeroContrato=', hasNumeroContrato);

  // ⭐ FILTRA PACIENTES NÃO DELETADOS (só se coluna existir)
  let whereClause = hasDeletado ? 'WHERE (deletado IS NULL OR deletado = 0)' : 'WHERE 1=1';
  let params = [];

  // ⭐ Filtro por titularId (para buscar dependentes de um titular específico)
  if (titularId && titularId.trim()) {
    whereClause += ' AND titularId = ?';
    params.push(titularId.trim());
    console.log('🔍 [GET /api/pacientes] Filtrando por titularId:', titularId.trim());
  }

  if (search && search.trim()) {
    const searchTerm = search.trim();
    console.log('🔍 [GET /api/pacientes] Termo de busca:', searchTerm);

    // ⭐ Divide o termo em palavras para busca mais inteligente
    const palavras = searchTerm.split(/\s+/).filter((p) => p.length > 0);

    // Monta cláusula de numeroContrato apenas se coluna existir
    const contratoClause = hasNumeroContrato ? 'OR numeroContrato LIKE ? ' : '';

    const searchPattern = `%${searchTerm}%`;
    const searchTermClean = searchTerm.replace(/\D/g, '');
    const phonePattern = searchTermClean ? `%${searchTermClean}%` : searchPattern;

    if (palavras.length > 1) {
      // ⭐ Múltiplas palavras: cada palavra deve aparecer no nome (AND)
      const nomeClauses = palavras.map(() => 'nome LIKE ?').join(' AND ');
      whereClause += ` AND (
        (${nomeClauses}) OR 
        cpf LIKE ? OR 
        telefone LIKE ? OR 
        email LIKE ? OR
        matricula LIKE ? ${contratoClause}OR
        REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?
      )`;

      params = [
      ...palavras.map((p) => `%${p}%`),
      searchPattern, searchPattern, searchPattern, searchPattern,
      ...(hasNumeroContrato ? [searchPattern] : []),
      phonePattern];

    } else {
      // ⭐ Palavra única: busca em todos os campos
      whereClause += ` AND (
        nome LIKE ? OR 
        cpf LIKE ? OR 
        telefone LIKE ? OR 
        email LIKE ? OR
        matricula LIKE ? ${contratoClause}OR
        REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?
      )`;

      params = [
      searchPattern, searchPattern, searchPattern, searchPattern, searchPattern,
      ...(hasNumeroContrato ? [searchPattern] : []),
      phonePattern];

    }

    console.log('🔍 [GET /api/pacientes] Palavras:', palavras, 'Params count:', params.length);
  }

  const countQuery = `SELECT COUNT(*) as total FROM pacientes ${whereClause}`;

  // ⭐⭐⭐ CACHE: só dá para reaproveitar o total quando NÃO há busca nem
  // filtro de titular (o total muda conforme esses filtros). Esse é o caso
  // mais comum e o mais caro (scan de 100k+ linhas).
  const podeUsarCache = !(search && search.trim()) && !(titularId && titularId.trim());

  // Função única que processa o total (vindo do cache OU do COUNT) e responde.
  const handleCount = (err, countRow) => {
    if (err) {
      console.error('❌ [GET /api/pacientes] Erro ao contar pacientes:', err);
      // ⭐ FALLBACK: tenta query simples sem colunas extras
      console.log('🔄 [GET /api/pacientes] Tentando fallback sem filtro deletado...');
      const fallbackWhere = search && search.trim() ?
      `WHERE nome LIKE '%${search.trim().replace(/'/g, "''")}%'` :
      '';
      db.get(`SELECT COUNT(*) as total FROM pacientes ${fallbackWhere}`, [], (err2, countRow2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        const total = countRow2 ? countRow2.total : 0;
        console.log(`🔄 [FALLBACK] Total encontrado: ${total}`);
        db.all(`SELECT * FROM pacientes ${fallbackWhere} ORDER BY nome ASC LIMIT ? OFFSET ?`, [limitNum, offset], (err3, rows3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ data: rows3 || [], pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum), hasNext: false, hasPrev: false } });
        });
      });
      return;
    }

    const total = countRow ? countRow.total : 0;
    const totalPages = Math.ceil(total / limitNum);

    // ⭐ DIAGNÓSTICO: se retornou 0 com busca, investiga o motivo
    if (total === 0 && search && search.trim()) {
      console.log('🔍 [DIAGNÓSTICO] Busca retornou 0, investigando...');
      // Conta total SEM filtro algum
      db.get('SELECT COUNT(*) as total FROM pacientes', [], (diagErr, diagRow) => {
        const totalSemFiltro = diagRow ? diagRow.total : '?';
        // Conta com filtro deletado
        db.get('SELECT COUNT(*) as total FROM pacientes WHERE (deletado IS NULL OR deletado = 0)', [], (diagErr2, diagRow2) => {
          const totalNaoDeletados = diagRow2 ? diagRow2.total : '?';
          // Conta deletados
          db.get('SELECT COUNT(*) as total FROM pacientes WHERE deletado = 1', [], (diagErr3, diagRow3) => {
            const totalDeletados = diagRow3 ? diagRow3.total : '?';
            // Busca amostra de nomes
            db.all('SELECT nome, deletado FROM pacientes WHERE nome LIKE ? LIMIT 5', [`%${search.trim().split(/\s+/)[0]}%`], (diagErr4, amostra) => {
              console.log(`📊 [DIAGNÓSTICO] Total sem filtro: ${totalSemFiltro}`);
              console.log(`📊 [DIAGNÓSTICO] Não deletados: ${totalNaoDeletados}`);
              console.log(`📊 [DIAGNÓSTICO] Deletados: ${totalDeletados}`);
              console.log(`📊 [DIAGNÓSTICO] Amostra com "${search.trim().split(/\s+/)[0]}":`, amostra || []);
            });
          });
        });
      });
    }

    const selectQuery = `SELECT * FROM pacientes ${whereClause} ORDER BY nome ASC LIMIT ? OFFSET ?`;
    const selectParams = [...params, limitNum, offset];

    db.all(selectQuery, selectParams, (err, rows) => {
      if (err) {
        console.error('❌ [GET /api/pacientes] Erro ao buscar pacientes:', err);
        return res.status(500).json({ error: err.message });
      }

      const pacientes = rows || [];
      console.log(`✅ [GET /api/pacientes] Retornando ${pacientes.length} pacientes (página ${pageNum}/${totalPages}, total: ${total})`);

      // ⭐ FIX: Normaliza telefone/celular para cada paciente
      pacientes.forEach((p) => {
        if (!p.telefone && p.celular) {
          p.telefone = p.celular;
        } else if (!p.celular && p.telefone) {
          p.celular = p.telefone;
        }
      });

      // ⭐ NOVO: Enriquece com titularNome e totalDependentes
      const enriquecerEResponder = () => {
        console.log('🔍 [GET /api/pacientes] ==================== FIM ====================');
        res.json({
          data: pacientes,
          pagination: {
            page: pageNum, limit: limitNum, total, totalPages,
            hasNext: pageNum < totalPages, hasPrev: pageNum > 1
          }
        });
      };

      // Passo 1: Busca nomes dos titulares
      const titularIds = [...new Set(pacientes.filter((p) => p.titularId).map((p) => p.titularId))];
      const buscarTitulares = (callback) => {
        if (titularIds.length === 0) return callback();
        const placeholders = titularIds.map(() => '?').join(',');
        db.all(`SELECT id, nome FROM pacientes WHERE id IN (${placeholders})`, titularIds, (errT, titulares) => {
          const titularMap = {};
          (titulares || []).forEach((t) => titularMap[t.id] = t.nome);
          pacientes.forEach((p) => {
            if (p.titularId) p.titularNome = titularMap[p.titularId] || '';
          });
          callback();
        });
      };

      // Passo 2: Conta dependentes de cada paciente
      const pacienteIds = pacientes.map((p) => p.id);
      const contarDependentes = (callback) => {
        if (pacienteIds.length === 0) return callback();
        const placeholders = pacienteIds.map(() => '?').join(',');
        db.all(
          `SELECT titularId, COUNT(*) as total FROM pacientes WHERE titularId IN (${placeholders}) AND (deletado IS NULL OR deletado = 0) GROUP BY titularId`,
          pacienteIds,
          (errD, counts) => {
            if (!errD && counts) {
              const countMap = {};
              counts.forEach((c) => countMap[c.titularId] = c.total);
              pacientes.forEach((p) => {
                if (countMap[p.id]) p.totalDependentes = countMap[p.id];
              });
            }
            callback();
          }
        );
      };

      buscarTitulares(() => {
        contarDependentes(() => {
          enriquecerEResponder();
        });
      });
    });
  };

  // ⭐⭐⭐ Decide: serve do cache (sem COUNT) ou roda o COUNT de verdade.
  if (podeUsarCache) {
    const cached = getCachedCount(clinicaId);
    if (cached !== null) {
      console.log(`⚡ [GET /api/pacientes] Total do CACHE (sem COUNT): ${cached}`);
      // Pula o COUNT — chama o handler direto com o total cacheado.
      handleCount(null, { total: cached });
    } else {
      console.log('🔍 [GET /api/pacientes] SQL:', countQuery);
      db.get(countQuery, params, (err, countRow) => {
        if (!err && countRow) setCachedCount(clinicaId, countRow.total);
        handleCount(err, countRow);
      });
    }
  } else {
    console.log('🔍 [GET /api/pacientes] SQL:', countQuery);
    console.log('🔍 [GET /api/pacientes] Params:', params);
    db.get(countQuery, params, handleCount);
  }
});

// GET /api/pacientes/diagnostico/telefone/:telefone
router.get('/diagnostico/telefone/:telefone', (req, res) => {
  const { telefone } = req.params;
  const { clinicaId } = req.query;

  console.log('🔍 [DIAGNÓSTICO] Buscando paciente por telefone:', telefone, 'clinicaId:', clinicaId);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  const telLimpo = telefone.replace(/\D/g, '');
  const ultimos9 = telLimpo.slice(-9);

  // ⭐ MySQL: sem COLLATE NOCASE
  db.all(`
    SELECT id, nome, telefone, cpf, email, matricula, criadoEm,
           REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', '') as telefoneLimpo
    FROM pacientes 
    WHERE (deletado IS NULL OR deletado = 0)
      AND (
        REPLACE(REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', ''), ' ', '') LIKE ?
        OR telefone LIKE ?
        OR telefone LIKE ?
      )
    ORDER BY nome
  `, [`%${ultimos9}%`, `%${telefone}%`, `%${telLimpo}%`], (err, rows) => {
    if (err) {
      console.error('❌ [DIAGNÓSTICO] Erro:', err);
      return res.status(500).json({ error: err.message });
    }

    console.log(`✅ [DIAGNÓSTICO] Encontrados ${rows?.length || 0} pacientes com telefone ${telefone}`);
    res.json({
      busca: { telefone, telLimpo, ultimos9 },
      encontrados: rows?.length || 0,
      pacientes: rows || []
    });
  });
});

// GET /api/pacientes/:id - Busca paciente por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  console.log('🔍 [GET /api/pacientes/:id] Params:', { id, clinicaId });

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  // Garante colunas extras existem (MySQL-compatible)
  try {
    const columns = await getTableColumns(db);
    const columnNames = columns.map((col) => col.name);

    const newCols = [
    { name: 'fotoUrl', type: 'TEXT' },
    { name: 'convenioId', type: 'VARCHAR(191)' },
    { name: 'empresaId', type: 'VARCHAR(191)' },
    { name: 'profissionalResponsavelId', type: 'VARCHAR(191)' }];


    for (const col of newCols) {
      if (!columnNames.includes(col.name)) {
        await new Promise((res, rej) => {
          db.run(`ALTER TABLE pacientes ADD COLUMN ${col.name} ${col.type}`, (err) => {
            if (err && !err.message.includes('Duplicate column')) rej(err);else
            res();
          });
        });
      }
    }
  } catch (err) {
    console.error('⚠️ Erro na verificação de colunas:', err);
  }

  // Query com LEFT JOINs — usa COLLATE para evitar conflito de collation entre tabelas
  const query = `
    SELECT p.*,
      c.nome as convenioNome,
      ec.nome as empresaNome,
      ec.cnpj as empresaCnpj
    FROM pacientes p
    LEFT JOIN convenios c ON (p.convenioId COLLATE utf8mb4_unicode_ci = c.id COLLATE utf8mb4_unicode_ci OR p.convenioId IS NULL)
    LEFT JOIN empresas_conveniadas ec ON (p.empresaId COLLATE utf8mb4_unicode_ci = ec.id COLLATE utf8mb4_unicode_ci OR p.empresaConveniadaId COLLATE utf8mb4_unicode_ci = ec.id COLLATE utf8mb4_unicode_ci)
    WHERE p.id = ?
  `;

  db.get(query, [id], (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar paciente:', err);
      // Fallback: busca sem JOINs
      db.get('SELECT * FROM pacientes WHERE id = ?', [id], (err2, row2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        if (!row2) return res.status(404).json({ error: 'Paciente não encontrado' });
        res.json(row2);
      });
      return;
    }

    if (!row) {
      return res.status(404).json({ error: 'Paciente não encontrado' });
    }

    // ⭐ FIX: Normaliza telefone/celular — garante que ambos os campos estejam preenchidos
    if (!row.telefone && row.celular) {
      row.telefone = row.celular;
    } else if (!row.celular && row.telefone) {
      row.celular = row.telefone;
    }

    if (!row.empresaId && row.empresaConveniadaId) {
      row.empresaId = row.empresaConveniadaId;
    }

    // ⭐ Enriquece com titularNome se paciente é dependente
    if (row.titularId) {
      db.get('SELECT nome FROM pacientes WHERE id = ?', [row.titularId], (errT, titular) => {
        row.titularNome = titular ? titular.nome : '';
        console.log(`✅ [GET /api/pacientes/:id] Paciente encontrado: ${row.nome} (dep. de ${row.titularNome || '?'})`);
        res.json(row);
      });
    } else {
      // ⭐ Conta dependentes deste titular
      db.get('SELECT COUNT(*) as total FROM pacientes WHERE titularId = ? AND (deletado IS NULL OR deletado = 0)', [row.id], (errD, countRow) => {
        if (!errD && countRow) {
          row.totalDependentes = countRow.total;
        }
        console.log(`✅ [GET /api/pacientes/:id] Paciente encontrado: ${row.nome} (titular, ${row.totalDependentes || 0} dep.)`);
        res.json(row);
      });
    }
  });
});

// POST /api/pacientes - Cria novo paciente
router.post('/', async (req, res) => {
  const { clinicaId, ...pacienteData } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  // ⭐ Limite de pacientes do plano (ex.: plano gratuito)
  const bloqueioPlano = await require('../services/limitesPlano').verificarLimite(clinicaId, 'pacientes');
  if (bloqueioPlano) return res.status(403).json(bloqueioPlano);

  // ⭐ Novo paciente muda o total → invalida o cache de contagem.
  invalidateCountCache(clinicaId);

  const db = getClinicaDB(clinicaId);
  const id = `p${Date.now()}`;
  const criadoEm = new Date().toISOString().split('T')[0];

  if (!pacienteData.matricula || pacienteData.matricula.trim() === '') {
    try {
      pacienteData.matricula = await gerarMatriculaAutomatica(db, clinicaId);
    } catch (err) {
      console.error('❌ Erro ao gerar matrícula:', err);
      pacienteData.matricula = `MAT${Date.now().toString().slice(-8)}`;
    }
  }

  // ⭐ Gera número de contrato automático se não informado (controle de concorrência no backend)
  if (!pacienteData.numeroContrato || pacienteData.numeroContrato.trim() === '') {
    try {
      pacienteData.numeroContrato = await gerarNumeroContratoAutomatico(db, clinicaId);
    } catch (err) {
      console.error('❌ Erro ao gerar número de contrato:', err);
      pacienteData.numeroContrato = Date.now().toString().slice(-8);
    }
  }

  if (pacienteData.empresaId && !pacienteData.empresaConveniadaId) {
    pacienteData.empresaConveniadaId = pacienteData.empresaId;
  } else if (pacienteData.empresaConveniadaId && !pacienteData.empresaId) {
    pacienteData.empresaId = pacienteData.empresaConveniadaId;
  }

  // ⭐ FIX: Valida campos contra colunas existentes (igual ao PUT) para evitar erro 500
  try {
    const columns = await getTableColumns(db);
    const columnNames = new Set(columns.map((col) => col.name));
    const camposProtegidos = new Set(['id', 'criadoEm']);

    // Mapa de tipos para sanitização
    const columnTypeMap = {};
    columns.forEach((col) => {
      columnTypeMap[col.name] = (col.type || col.Type || '').toUpperCase();
    });

    // Auto-cria colunas faltantes
    const colunasParaCriar = Object.keys(pacienteData).filter(
      (key) => !columnNames.has(key) && !camposProtegidos.has(key)
    );
    for (const colName of colunasParaCriar) {
      try {
        await new Promise((resolve, reject) => {
          db.run(`ALTER TABLE pacientes ADD COLUMN \`${colName}\` TEXT`, (err) => {
            if (err && !err.message.includes('Duplicate column')) {
              console.error(`❌ Erro ao criar coluna ${colName}:`, err.message);
            } else {
              console.log(`✅ [POST] Coluna '${colName}' criada automaticamente!`);
              columnNames.add(colName);
              columnTypeMap[colName] = 'TEXT';
            }
            resolve();
          });
        });
      } catch (e) {}
    }

    // Filtra apenas campos válidos
    const filteredData = {};
    for (const [key, value] of Object.entries(pacienteData)) {
      if (camposProtegidos.has(key)) continue;
      if (columnNames.has(key)) {
        const tipo = columnTypeMap[key] || '';
        if (value === '' && (tipo.includes('DECIMAL') || tipo.includes('INT') || tipo.includes('FLOAT') || tipo.includes('DOUBLE') || tipo.includes('NUMERIC'))) {
          filteredData[key] = null;
        } else {
          filteredData[key] = value;
        }
      }
    }

    const fields = Object.keys(filteredData).join(', ');
    const placeholders = Object.keys(filteredData).map(() => '?').join(', ');
    const values = Object.values(filteredData);

    // Preserva matrícula e contrato
    if (pacienteData.matricula && !filteredData.matricula) filteredData.matricula = pacienteData.matricula;
    if (pacienteData.numeroContrato && !filteredData.numeroContrato) filteredData.numeroContrato = pacienteData.numeroContrato;

    db.run(
      `INSERT INTO pacientes (id, ${Object.keys(filteredData).join(', ')}, criadoEm) VALUES (?, ${Object.keys(filteredData).map(() => '?').join(', ')}, ?)`,
      [id, ...Object.values(filteredData), criadoEm],
      function (err) {
        if (err) {
          console.error('❌ Erro ao criar paciente:', err);
          return res.status(500).json({ error: err.message });
        }
        console.log(`✅ Paciente criado: ${id} - Matrícula: ${pacienteData.matricula}`);
        res.json({ id, ...pacienteData, criadoEm });
      }
    );
  } catch (err) {
    console.error('❌ Erro ao processar criação de paciente:', err);
    return res.status(500).json({ error: err.message || 'Erro interno ao criar paciente' });
  }
});

// PUT /api/pacientes/:id - Atualiza paciente
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId, ...updates } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  if (updates.empresaId && !updates.empresaConveniadaId) {
    updates.empresaConveniadaId = updates.empresaId;
  } else if (updates.empresaConveniadaId && !updates.empresaId) {
    updates.empresaId = updates.empresaConveniadaId;
  }

  try {
    // ⭐ MySQL-compatible: usa INFORMATION_SCHEMA em vez de PRAGMA
    const columns = await getTableColumns(db);
    const columnNames = new Set(columns.map((col) => col.name));

    const camposProtegidos = new Set(['id', 'criadoEm', 'deletado', 'deletadoEm']);

    // Auto-cria colunas faltantes
    const colunasParaCriar = Object.keys(updates).filter(
      (key) => !columnNames.has(key) && !camposProtegidos.has(key)
    );

    if (colunasParaCriar.length > 0) {
      console.log(`🔧 [PUT /api/pacientes/${id}] Auto-criando ${colunasParaCriar.length} colunas: ${colunasParaCriar.join(', ')}`);
      for (const colName of colunasParaCriar) {
        try {
          await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE pacientes ADD COLUMN \`${colName}\` TEXT`, (err) => {
              if (err && !err.message.includes('Duplicate column')) {
                console.error(`❌ Erro ao criar coluna ${colName}:`, err.message);
                reject(err);
              } else {
                console.log(`✅ Coluna '${colName}' criada automaticamente!`);
                columnNames.add(colName);
                resolve();
              }
            });
          });
        } catch (e) {
          console.error(`⚠️ Não foi possível criar coluna ${colName}, ignorando...`);
        }
      }
    }

    // ⭐ Mapa de tipos de coluna para sanitização (DECIMAL/INT não aceitam '' no MySQL)
    const columnTypeMap = {};
    columns.forEach((col) => {
      columnTypeMap[col.name] = (col.type || col.Type || '').toUpperCase();
    });

    // Filtra updates para incluir APENAS colunas que existem
    const filteredUpdates = {};
    let camposIgnorados = [];

    for (const [key, value] of Object.entries(updates)) {
      if (camposProtegidos.has(key)) continue;
      if (columnNames.has(key)) {
        // ⭐ Sanitiza campos numéricos: string vazia → NULL para DECIMAL, INT, TINYINT, FLOAT, DOUBLE
        const tipo = columnTypeMap[key] || '';
        if (value === '' && (tipo.includes('DECIMAL') || tipo.includes('INT') || tipo.includes('FLOAT') || tipo.includes('DOUBLE') || tipo.includes('NUMERIC'))) {
          filteredUpdates[key] = null;
        } else {
          filteredUpdates[key] = value;
        }
      } else {
        camposIgnorados.push(key);
      }
    }

    if (camposIgnorados.length > 0) {
      console.warn(`⚠️ [PUT /api/pacientes/${id}] Campos ignorados: ${camposIgnorados.join(', ')}`);
    }

    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }

    console.log(`📝 [PUT /api/pacientes/${id}] Atualizando ${Object.keys(filteredUpdates).length} campos`);

    const setClause = Object.keys(filteredUpdates).map((key) => `\`${key}\` = ?`).join(', ');
    const values = [...Object.values(filteredUpdates), id];

    db.run(
      `UPDATE pacientes SET ${setClause} WHERE id = ?`,
      values,
      function (err) {
        if (err) {
          console.error(`❌ [PUT /api/pacientes/${id}] Erro SQL:`, err.message);
          return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Paciente não encontrado' });
        }

        console.log(`✅ [PUT /api/pacientes/${id}] Paciente atualizado!`);

        // ⭐ Atualiza campos desnormalizados na tabela consultas
        const camposConsulta = {};
        if (filteredUpdates.nome) camposConsulta.pacienteNome = filteredUpdates.nome;
        if (filteredUpdates.telefone) camposConsulta.whatsappTelefone = filteredUpdates.telefone;else
        if (filteredUpdates.celular) camposConsulta.whatsappTelefone = filteredUpdates.celular;

        if (Object.keys(camposConsulta).length > 0) {
          const setClauseConsulta = Object.keys(camposConsulta).map((k) => `\`${k}\` = ?`).join(', ');
          const valuesConsulta = [...Object.values(camposConsulta), id];

          db.run(
            `UPDATE consultas SET ${setClauseConsulta} WHERE pacienteId = ?`,
            valuesConsulta,
            function (errConsulta) {
              if (errConsulta) {
                console.error(`⚠️ [PUT /api/pacientes/${id}] Erro ao atualizar consultas:`, errConsulta.message);
              } else if (this.changes > 0) {
                console.log(`✅ [PUT /api/pacientes/${id}] ${this.changes} consultas atualizadas com novos dados do paciente`);
              }
            }
          );
        }

        res.json({ success: true, changes: this.changes });
      }
    );

  } catch (err) {
    console.error(`❌ [PUT /api/pacientes/${id}] Erro geral:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/pacientes/:id/cancelar - Cancela cadastro do paciente
router.patch('/:id/cancelar', async (req, res) => {
  const { id } = req.params;
  const { clinicaId, motivoCancelamento, cancelamentoUsuario } = req.body;

  console.log(`🚫 [PATCH /api/pacientes/${id}/cancelar] Cancelando paciente...`);
  console.log(`   Motivo: ${motivoCancelamento}`);
  console.log(`   Usuário: ${cancelamentoUsuario}`);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!motivoCancelamento || !motivoCancelamento.trim()) {
    return res.status(400).json({ error: 'Motivo do cancelamento é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  const canceladoEm = new Date().toISOString();

  // Garante que as colunas existam
  const colsCancelamento = [
  { name: 'motivoCancelamento', type: 'TEXT' },
  { name: 'canceladoEm', type: 'VARCHAR(50)' },
  { name: 'cancelamentoUsuario', type: 'VARCHAR(255)' }];


  for (const col of colsCancelamento) {
    try {
      await new Promise((resolve, reject) => {
        db.run(`ALTER TABLE pacientes ADD COLUMN \`${col.name}\` ${col.type}`, (err) => {
          if (err && !err.message.includes('Duplicate column')) reject(err);else
          resolve();
        });
      });
    } catch (e) {
















      // Coluna já existe, ok
    }}db.run(`UPDATE pacientes SET status = 'cancelado', motivoCancelamento = ?, canceladoEm = ?, cancelamentoUsuario = ? WHERE id = ?`, [motivoCancelamento.trim(), canceladoEm, cancelamentoUsuario || 'Sistema', id], function (err) {if (err) {console.error(`❌ Erro ao cancelar paciente ${id}:`, err);return res.status(500).json({ error: err.message });}if (this.changes === 0) {return res.status(404).json({ error: 'Paciente não encontrado' });}console.log(`✅ Paciente ${id} cancelado com sucesso!`);
      res.json({
        success: true,
        status: 'cancelado',
        motivoCancelamento: motivoCancelamento.trim(),
        canceladoEm,
        cancelamentoUsuario: cancelamentoUsuario || 'Sistema'
      });
    }
  );
});

// PATCH /api/pacientes/:id/reativar - Reativa paciente cancelado
router.patch('/:id/reativar', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.body;

  console.log(`✅ [PATCH /api/pacientes/${id}/reativar] Reativando paciente...`);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run(
    `UPDATE pacientes SET status = 'ativo', motivoCancelamento = NULL, canceladoEm = NULL, cancelamentoUsuario = NULL WHERE id = ?`,
    [id],
    function (err) {
      if (err) {
        console.error(`❌ Erro ao reativar paciente ${id}:`, err);
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Paciente não encontrado' });
      }

      console.log(`✅ Paciente ${id} reativado com sucesso!`);
      res.json({ success: true, status: 'ativo' });
    }
  );
});

// DELETE /api/pacientes/:id - Deleta paciente (SOFT DELETE)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  try {
    await garantirColunasDeletado(db, clinicaId);
  } catch (err) {
    console.error('⚠️ Erro na migração de colunas:', err);
  }

  const deletadoEm = new Date().toISOString();

  db.run(
    `UPDATE pacientes SET deletado = 1, deletadoEm = ? WHERE id = ?`,
    [deletadoEm, id],
    function (err) {
      if (err) {
        console.error('❌ Erro ao deletar paciente:', err);
        return res.status(500).json({ error: err.message });
      }
      console.log(`✅ Paciente marcado como deletado: ${id}`);
      res.json({ success: true });
    }
  );
});

// POST /api/pacientes/foto - Upload de foto do paciente
router.post('/foto', upload.single('foto'), async (req, res) => {
  const { operadoraId, clinicaId, pacienteId } = req.body;

  console.log(`📸 POST /api/pacientes/foto - clinicaId: ${clinicaId}, pacienteId: ${pacienteId}`);

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  try {
    let opId = operadoraId;
    if (!opId) {
      // ⭐ MySQL: dbGlobal agora é async — usa prepare().get()
      const clinica = await dbGlobal.prepare('SELECT operadoraId FROM clinicas WHERE id = ?').get(clinicaId);
      opId = clinica?.operadoraId || 'geral';
    }

    const fotosDir = path.join(uploadsDir, opId, clinicaId, pacienteId || 'geral', 'fotos');
    if (!fs.existsSync(fotosDir)) {
      fs.mkdirSync(fotosDir, { recursive: true });
    }

    const fileName = `paciente_${pacienteId || Date.now()}_${Date.now()}${path.extname(req.file.originalname)}`;
    const newPath = path.join(fotosDir, fileName);

    if (req.file.path !== newPath) {
      fs.renameSync(req.file.path, newPath);
    }

    const fotoUrl = `/uploads/${opId}/${clinicaId}/${pacienteId || 'geral'}/fotos/${fileName}`;

    console.log(`✅ Foto salva: ${fotoUrl}`);

    if (pacienteId) {
      const db = getClinicaDB(clinicaId);
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE pacientes SET fotoUrl = ? WHERE id = ?`,
          [fotoUrl, pacienteId],
          function (err) {
            if (err) reject(err);else
            {
              console.log(`✅ Paciente ${pacienteId} atualizado com fotoUrl`);
              resolve();
            }
          }
        );
      });
    }

    res.json({
      success: true,
      url: fotoUrl,
      fileName: fileName
    });

  } catch (err) {
    console.error('❌ Erro ao salvar foto:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;