// ==================== ROTAS DE EMPRESAS CONVENIADAS ====================

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// ⭐⭐⭐ RATE LIMITER AGRESSIVO - BLOQUEIA E RETORNA CACHE ⭐⭐⭐
const requestCache = new Map();
const CACHE_TTL = 10000; // 10 segundos - retorna cache por 10 segundos

function getCachedOrBlock(key) {
  const now = Date.now();
  const entry = requestCache.get(key);

  if (entry) {
    // Se tem cache válido, retorna os dados em cache
    if (now - entry.timestamp < CACHE_TTL) {
      console.log(`📦 [CACHE] Retornando cache para: ${key}`);
      return { cached: true, data: entry.data };
    }
  }

  return { cached: false };
}

function setCache(key, data) {
  requestCache.set(key, { data, timestamp: Date.now() });
}

// Limpa cache periodicamente (a cada 60 segundos)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCache.entries()) {
    if (now - entry.timestamp > 60000) {
      requestCache.delete(key);
    }
  }
}, 60000);

// Função para garantir que a tabela existe com todas as colunas (MySQL compatível)
function garantirTabelaEmpresasConveniadas(db) {
  return new Promise((resolve) => {
    // ⭐⭐⭐ MySQL: CREATE TABLE IF NOT EXISTS com VARCHAR para PKs ⭐⭐⭐
    db.run(`
      CREATE TABLE IF NOT EXISTS empresas_conveniadas (
        id VARCHAR(191) PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        cnpj VARCHAR(30),
        razaoSocial VARCHAR(255),
        telefone VARCHAR(50),
        email VARCHAR(255),
        endereco TEXT,
        contato VARCHAR(255),
        desconto DOUBLE DEFAULT 0,
        observacoes TEXT,
        ativa TINYINT(1) DEFAULT 1,
        criadoEm VARCHAR(50)
      )
    `, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('⚠️ [empresas-conveniadas] Erro ao criar tabela:', err.message);
      }
      // ⭐ Migração: adiciona colunas que podem não existir (ALTER TABLE ignora erro se já existe)
      const colunasExtras = [
      { nome: 'desconto', tipo: 'DOUBLE DEFAULT 0' },
      { nome: 'observacoes', tipo: 'TEXT' },
      { nome: 'contato', tipo: 'VARCHAR(255)' },
      { nome: 'razaoSocial', tipo: 'VARCHAR(255)' }];


      let pendentes = colunasExtras.length;
      if (pendentes === 0) {resolve();return;}

      colunasExtras.forEach((coluna) => {
        db.run(`ALTER TABLE empresas_conveniadas ADD COLUMN ${coluna.nome} ${coluna.tipo}`, () => {
          pendentes--;
          if (pendentes === 0) resolve();
        });
      });
    });
  });
}

// Função para garantir que a tabela de unidades existe (MySQL compatível)
function garantirTabelaUnidades(db) {
  return new Promise((resolve) => {
    // ⭐⭐⭐ MySQL: VARCHAR(191) para PKs e FKs, não TEXT ⭐⭐⭐
    db.run(`
      CREATE TABLE IF NOT EXISTS unidades_empresa (
        id VARCHAR(191) PRIMARY KEY,
        empresaConveniadaId VARCHAR(191) NOT NULL,
        nome VARCHAR(255) NOT NULL,
        codigo VARCHAR(100),
        endereco TEXT,
        cidade VARCHAR(255),
        uf VARCHAR(5),
        telefone VARCHAR(50),
        responsavel VARCHAR(255),
        observacoes TEXT,
        ativa TINYINT(1) DEFAULT 1,
        criadoEm VARCHAR(50) NOT NULL
      )
    `, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('⚠️ [unidades_empresa] Erro ao criar tabela:', err.message);
      }
      resolve();
    });
  });
}

// ==================== ROTAS DE EMPRESAS ====================

// GET /api/empresas-conveniadas?clinicaId=c1 - Lista empresas conveniadas (SEM contagens para ser rápido)
router.get('/', async (req, res) => {
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  // ⭐ NOVO: suporte a busca por termo e paginação (para seletor assíncrono no cadastro)
  // Mantém compatibilidade: sem params, retorna a lista completa como antes.
  const { search, page, limit } = req.query;
  const temBusca = typeof search === 'string' && search.trim().length > 0;
  const temPaginacao = page !== undefined || limit !== undefined;

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaEmpresasConveniadas(db);
    await garantirTabelaUnidades(db);

    if (temBusca || temPaginacao) {
      const condicoes = [];
      const params = [];

      if (temBusca) {
        const termo = `%${search.trim()}%`;
        condicoes.push('(nome LIKE ? OR cnpj LIKE ? OR razaoSocial LIKE ?)');
        params.push(termo, termo, termo);
      }

      const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (pageNum - 1) * limitNum;

      const sql = `SELECT * FROM empresas_conveniadas ${where} ORDER BY nome ASC LIMIT ? OFFSET ?`;
      db.all(sql, [...params, limitNum, offset], (err, rows) => {
        if (err) {
          console.error('❌ Erro ao buscar empresas (paginado):', err);
          return res.status(500).json({ error: err.message });
        }
        const empresas = (rows || []).map((row) => ({ ...row, ativa: Boolean(row.ativa) }));
        console.log(`✅ Retornando ${empresas.length} empresas (busca="${search || ''}" page=${pageNum} limit=${limitNum})`);
        res.json(empresas);
      });
      return;
    }

    // ⭐ Query SIMPLES sem subqueries - carrega rápido (comportamento original)
    db.all('SELECT * FROM empresas_conveniadas ORDER BY nome ASC', [], (err, rows) => {
      if (err) {
        console.error('❌ Erro ao buscar empresas:', err);
        return res.status(500).json({ error: err.message });
      }

      const empresas = (rows || []).map((row) => ({
        ...row,
        ativa: Boolean(row.ativa)
      }));

      console.log(`✅ Retornando ${empresas.length} empresas (sem contagens)`);
      res.json(empresas);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ⭐ NOVO: GET /api/empresas-conveniadas/contagens - Retorna contagens de unidades e pacientes
router.get('/contagens/todas', async (req, res) => {
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaUnidades(db);

    // Busca contagens de unidades
    const unidadesPromise = new Promise((resolve, reject) => {
      db.all(
        `SELECT empresaConveniadaId, COUNT(*) as qtd FROM unidades_empresa GROUP BY empresaConveniadaId`,
        [],
        (err, rows) => {
          if (err) reject(err);else
          resolve(rows || []);
        }
      );
    });

    // Busca contagens de pacientes
    const pacientesPromise = new Promise((resolve, reject) => {
      db.all(
        `SELECT empresaConveniadaId, COUNT(*) as qtd FROM pacientes WHERE empresaConveniadaId IS NOT NULL AND empresaConveniadaId != '' GROUP BY empresaConveniadaId`,
        [],
        (err, rows) => {
          if (err) reject(err);else
          resolve(rows || []);
        }
      );
    });

    const [unidadesRows, pacientesRows] = await Promise.all([unidadesPromise, pacientesPromise]);

    // Monta objeto de contagens
    const contagens = {};

    unidadesRows.forEach((row) => {
      const id = String(row.empresaConveniadaId);
      if (!contagens[id]) contagens[id] = { qtdUnidades: 0, qtdPacientes: 0 };
      contagens[id].qtdUnidades = row.qtd;
    });

    pacientesRows.forEach((row) => {
      const id = String(row.empresaConveniadaId);
      if (!contagens[id]) contagens[id] = { qtdUnidades: 0, qtdPacientes: 0 };
      contagens[id].qtdPacientes = row.qtd;
    });

    console.log(`✅ Retornando contagens para ${Object.keys(contagens).length} empresas`);
    res.json(contagens);
  } catch (err) {
    console.error('❌ Erro ao buscar contagens:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/empresas-conveniadas/:id - Busca empresa conveniada por ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  // Verifica se é rota de unidades ou contagens
  if (id === 'unidades' || id === 'contagens') {
    return res.status(400).json({ error: 'Use a rota correta' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaEmpresasConveniadas(db);

    db.get('SELECT * FROM empresas_conveniadas WHERE id = ?', [id], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!row) {
        return res.status(404).json({ error: 'Empresa conveniada não encontrada' });
      }

      res.json({
        ...row,
        ativa: Boolean(row.ativa)
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/empresas-conveniadas - Cria nova empresa conveniada
router.post('/', async (req, res) => {
  const { clinicaId, nome, cnpj, razaoSocial, telefone, email, endereco, contato, desconto, observacoes, ativa } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!nome) {
    return res.status(400).json({ error: 'nome é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    const id = `emp_${Date.now()}`;
    const criadoEm = new Date().toISOString();

    await garantirTabelaEmpresasConveniadas(db);

    // ⭐⭐⭐ MySQL: Insere todos os campos diretamente (tabela criada com todas as colunas) ⭐⭐⭐
    db.run(
      `INSERT INTO empresas_conveniadas (id, nome, cnpj, razaoSocial, telefone, email, endereco, contato, desconto, observacoes, ativa, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, nome, cnpj || null, razaoSocial || null, telefone || null, email || null, endereco || null, contato || null, desconto || 0, observacoes || null, ativa !== false ? 1 : 0, criadoEm],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ id, nome, cnpj, razaoSocial, telefone, email, endereco, contato, desconto, observacoes, ativa: ativa !== false, criadoEm });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/empresas-conveniadas/:id - Atualiza empresa conveniada
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { clinicaId, nome, cnpj, razaoSocial, telefone, email, endereco, contato, desconto, observacoes, ativa } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaEmpresasConveniadas(db);

    // ⭐⭐⭐ MySQL: Atualiza todos os campos diretamente (sem PRAGMA) ⭐⭐⭐
    db.run(
      `UPDATE empresas_conveniadas SET nome = ?, cnpj = ?, razaoSocial = ?, telefone = ?, email = ?, endereco = ?, contato = ?, desconto = ?, observacoes = ?, ativa = ? WHERE id = ?`,
      [nome, cnpj || null, razaoSocial || null, telefone || null, email || null, endereco || null, contato || null, desconto || 0, observacoes || null, ativa !== false ? 1 : 0, id],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/empresas-conveniadas/:id - Deleta empresa conveniada
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);

  db.run('DELETE FROM empresas_conveniadas WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// ==================== ROTAS DE UNIDADES ====================

// GET /api/empresas-conveniadas/:empresaId/pacientes - Lista pacientes vinculados a uma empresa
router.get('/:empresaId/pacientes', async (req, res) => {
  const { empresaId } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    db.all(
      `SELECT id, nome, cpf, telefone, email, status, empresaConveniadaId, unidadeEmpresaId 
       FROM pacientes 
       WHERE CAST(empresaConveniadaId AS CHAR) = CAST(? AS CHAR)
       ORDER BY nome ASC`,
      [empresaId],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/empresas-conveniadas/:empresaId/unidades - Lista unidades de uma empresa
router.get('/:empresaId/unidades', async (req, res) => {
  const { empresaId } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  // ⭐ NOVO: busca por termo + limite (para seletor assíncrono no cadastro de paciente)
  const { search, limit, id } = req.query;
  const temBusca = typeof search === 'string' && search.trim().length > 0;
  const temLimite = limit !== undefined;
  const temId = typeof id === 'string' && id.trim().length > 0;

  // ⭐⭐⭐ FIX TRAVAMENTO: busca de UMA unidade específica por id (lookup O(1) pela PK).
  // Evita carregar a lista inteira (dezenas de milhares) só para resolver o nome
  // da unidade salva ao abrir o cadastro do paciente.
  if (temId) {
    try {
      const db = getClinicaDB(clinicaId);
      await garantirTabelaUnidades(db);
      db.all(
        `SELECT * FROM unidades_empresa WHERE id = ? AND CAST(empresaConveniadaId AS CHAR) = CAST(? AS CHAR) LIMIT 1`,
        [id, empresaId],
        (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });
          const unidades = (rows || []).map((row) => ({ ...row, ativa: Boolean(row.ativa) }));
          res.json(unidades);
        }
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ⭐⭐⭐ CACHE CHECK - apenas para a listagem completa (sem busca/limite) ⭐⭐⭐
  const cacheKey = `unidades-${empresaId}-${clinicaId}`;
  if (!temBusca && !temLimite) {
    const cacheResult = getCachedOrBlock(cacheKey);
    if (cacheResult.cached) {
      return res.json(cacheResult.data);
    }
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaUnidades(db);

    const condicoes = ['CAST(empresaConveniadaId AS CHAR) = CAST(? AS CHAR)'];
    const params = [empresaId];

    if (temBusca) {
      const termo = `%${search.trim()}%`;
      condicoes.push('(nome LIKE ? OR codigo LIKE ? OR cidade LIKE ?)');
      params.push(termo, termo, termo);
    }

    let sql = `SELECT * FROM unidades_empresa WHERE ${condicoes.join(' AND ')} ORDER BY nome ASC`;
    if (temLimite || temBusca) {
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
      sql += ` LIMIT ${limitNum}`;
    }

    db.all(sql, params, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const unidades = (rows || []).map((row) => ({
        ...row,
        ativa: Boolean(row.ativa)
      }));

      // ⭐ Só cacheia a listagem completa
      if (!temBusca && !temLimite) {
        setCache(cacheKey, unidades);
      }

      console.log(`✅ Unidades da empresa ${empresaId}: ${unidades.length} (busca="${search || ''}")`);
      res.json(unidades);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/empresas-conveniadas/:empresaId/unidades - Cria nova unidade
router.post('/:empresaId/unidades', async (req, res) => {
  const { empresaId } = req.params;
  const { clinicaId, nome, codigo, endereco, cidade, uf, telefone, responsavel, observacoes, ativa } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!nome) {
    return res.status(400).json({ error: 'nome é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaUnidades(db);

    const id = `unid_${Date.now()}`;
    const criadoEm = new Date().toISOString();

    db.run(
      `INSERT INTO unidades_empresa (id, empresaConveniadaId, nome, codigo, endereco, cidade, uf, telefone, responsavel, observacoes, ativa, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, empresaId, nome, codigo || null, endereco || null, cidade || null, uf || null, telefone || null, responsavel || null, observacoes || null, ativa !== false ? 1 : 0, criadoEm],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ id, empresaConveniadaId: empresaId, nome, codigo, endereco, cidade, uf, telefone, responsavel, observacoes, ativa: ativa !== false, criadoEm });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/empresas-conveniadas/:empresaId/unidades/:unidadeId - Atualiza unidade
router.put('/:empresaId/unidades/:unidadeId', async (req, res) => {
  const { empresaId, unidadeId } = req.params;
  const { clinicaId, nome, codigo, endereco, cidade, uf, telefone, responsavel, observacoes, ativa } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaUnidades(db);

    db.run(
      `UPDATE unidades_empresa 
       SET nome = ?, codigo = ?, endereco = ?, cidade = ?, uf = ?, telefone = ?, responsavel = ?, observacoes = ?, ativa = ?
       WHERE id = ? AND CAST(empresaConveniadaId AS CHAR) = CAST(? AS CHAR)`,
      [nome, codigo || null, endereco || null, cidade || null, uf || null, telefone || null, responsavel || null, observacoes || null, ativa !== false ? 1 : 0, unidadeId, empresaId],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/empresas-conveniadas/:empresaId/unidades/:unidadeId - Deleta unidade
router.delete('/:empresaId/unidades/:unidadeId', async (req, res) => {
  const { empresaId, unidadeId } = req.params;
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);

    db.run(
      `DELETE FROM unidades_empresa WHERE id = ? AND CAST(empresaConveniadaId AS CHAR) = CAST(? AS CHAR)`,
      [unidadeId, empresaId],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/empresas-conveniadas/todas/unidades - Lista TODAS as unidades
router.get('/todas/unidades', async (req, res) => {
  const { clinicaId } = req.query;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  try {
    const db = getClinicaDB(clinicaId);
    await garantirTabelaUnidades(db);

    db.all(
      `SELECT u.*, e.nome as empresaNome 
       FROM unidades_empresa u 
       LEFT JOIN empresas_conveniadas e ON CAST(u.empresaConveniadaId AS CHAR) = CAST(e.id AS CHAR)
       WHERE u.ativa = 1 
       ORDER BY e.nome, u.nome`,
      [],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const unidades = (rows || []).map((row) => ({
          ...row,
          ativa: Boolean(row.ativa)
        }));

        res.json(unidades);
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;