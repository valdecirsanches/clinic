
// ==================== BANCO DE DADOS GLOBAL (MySQL) ====================
// Migrado de better-sqlite3 → mysql2
// Exporta um objeto com API compatível: db.prepare(sql).get/all/run(params)

const mysql = require('mysql2');
const { MYSQL_CONFIG, GLOBAL_DB_NAME } = require('./config/mysql');

// ==================== POOL DE CONEXÕES ====================
let pool = null;
let poolPromise = null;
let initialized = false;

function createPool() {
  pool = mysql.createPool({
    ...MYSQL_CONFIG,
    database: GLOBAL_DB_NAME
  });
  poolPromise = pool.promise();
  console.log(`✅ Pool MySQL criado para banco global: ${GLOBAL_DB_NAME}`);
  return pool;
}

// ==================== INICIALIZAÇÃO ====================
// Cria o banco global se não existir, depois cria as tabelas

async function initGlobalDatabase() {
  if (initialized) return;

  // Primeiro conecta SEM database para criar o banco
  const initPool = mysql.createPool({
    ...MYSQL_CONFIG,
    database: undefined
  }).promise();

  try {
    await initPool.execute(
      `CREATE DATABASE IF NOT EXISTS \`${GLOBAL_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`✅ Banco global '${GLOBAL_DB_NAME}' verificado/criado`);
  } catch (err) {
    console.error(`❌ Erro ao criar banco global:`, err.message);
    throw err;
  } finally {
    await initPool.end();
  }

  // Agora cria o pool com o banco correto
  createPool();

  // Cria tabelas
  const createTablesSql = `
    CREATE TABLE IF NOT EXISTS operadoras (
      id VARCHAR(191) PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      cnpj VARCHAR(20) UNIQUE NOT NULL,
      razaoSocial VARCHAR(255),
      telefone VARCHAR(50),
      email VARCHAR(255),
      endereco TEXT,
      ativa TINYINT(1) DEFAULT 1,
      criadoEm VARCHAR(50) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clinicas (
      id VARCHAR(191) PRIMARY KEY,
      operadoraId VARCHAR(191) NOT NULL,
      nome VARCHAR(255) NOT NULL,
      cnpj VARCHAR(20),
      telefone VARCHAR(50),
      email VARCHAR(255),
      endereco TEXT,
      ativa TINYINT(1) DEFAULT 1,
      criadoEm VARCHAR(50) NOT NULL,
      cep VARCHAR(10),
      logradouro VARCHAR(255),
      numero VARCHAR(20),
      complemento VARCHAR(255),
      bairro VARCHAR(255),
      cidade VARCHAR(255),
      uf VARCHAR(2),
      plano VARCHAR(50) DEFAULT 'gratuito',
      logoUrl TEXT,
      latitude DOUBLE,
      longitude DOUBLE
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id VARCHAR(191) PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      senha VARCHAR(255) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      operadoraId VARCHAR(191),
      clinicaId VARCHAR(191),
      ativo TINYINT(1) DEFAULT 1,
      criadoEm VARCHAR(50) NOT NULL,
      crm VARCHAR(50),
      uf VARCHAR(2),
      cpf VARCHAR(20),
      telefone VARCHAR(50),
      dataNascimento VARCHAR(50),
      permissoesMenu TEXT DEFAULT NULL,
      termoPesquisa TEXT,
      operadoraPadraoId VARCHAR(191),
      clinicaPadraoId VARCHAR(191),
      fotoUrl LONGTEXT
    );

    CREATE TABLE IF NOT EXISTS configuracoes_globais (
      id VARCHAR(191) PRIMARY KEY,
      chave VARCHAR(255) UNIQUE NOT NULL,
      valor TEXT NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memed_profissionais (
      id VARCHAR(191) PRIMARY KEY,
      usuarioId VARCHAR(191) NOT NULL,
      external_id VARCHAR(191) NOT NULL,
      nome VARCHAR(255) NOT NULL,
      sobrenome VARCHAR(255),
      cpf VARCHAR(20),
      email VARCHAR(255),
      telefone VARCHAR(50),
      board_code VARCHAR(50) NOT NULL,
      board_number VARCHAR(50) NOT NULL,
      board_state VARCHAR(10) NOT NULL,
      token TEXT,
      status VARCHAR(50) DEFAULT 'Em análise',
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS medicamentos (
      id VARCHAR(191) PRIMARY KEY,
      nome VARCHAR(500) NOT NULL,
      principioAtivo VARCHAR(500) NULL,
      concentracao VARCHAR(200) NULL,
      formaFarmaceutica VARCHAR(200) NULL,
      fabricante VARCHAR(500) NULL,
      registroAnvisa VARCHAR(100) NULL,
      tarja VARCHAR(50) NULL,
      criadoEm VARCHAR(50) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS planos (
      id VARCHAR(191) PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      preco DOUBLE NOT NULL DEFAULT 0,
      limitePacientes INT,
      recursos TEXT NOT NULL,
      destaque TINYINT(1) DEFAULT 0,
      ativo TINYINT(1) DEFAULT 1,
      ordem INT DEFAULT 0,
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS especialidades (
      id VARCHAR(191) PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      descricao TEXT,
      tipo VARCHAR(50) DEFAULT 'medica',
      ativa TINYINT(1) DEFAULT 1,
      criadoEm VARCHAR(50),
      atualizadoEm VARCHAR(50)
    );

    CREATE TABLE IF NOT EXISTS cid10 (
      id VARCHAR(191) PRIMARY KEY,
      codigo VARCHAR(20) NOT NULL,
      descricao TEXT NOT NULL,
      categoria VARCHAR(255),
      criadoEm VARCHAR(50) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS biometrias (
      id VARCHAR(191) PRIMARY KEY,
      usuarioId VARCHAR(191) NOT NULL UNIQUE,
      biometriaId VARCHAR(191),
      amostras LONGTEXT,
      fmdXml LONGTEXT,
      numAmostras INT DEFAULT 0,
      criadoEm VARCHAR(50) NOT NULL,
      atualizadoEm VARCHAR(50) NOT NULL
    );
  `;

  // MySQL não suporta múltiplos statements por padrão, executa um por um
  const statements = createTablesSql.
  split(';').
  map((s) => s.trim()).
  filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await poolPromise.execute(stmt);
    } catch (err) {
      console.error(`❌ Erro ao criar tabela:`, err.message);
      console.error(`   SQL: ${stmt.substring(0, 100)}...`);
    }
  }

  console.log('✅ Tabelas do banco GLOBAL criadas/verificadas');

  // ==================== MIGRAÇÕES ====================
  await migrateColumns();

  // ==================== DADOS INICIAIS ====================
  await seedInitialData();

  initialized = true;
  console.log('✅ Banco de dados GLOBAL MySQL inicializado');
}

// ==================== MIGRAÇÕES DE COLUNAS ====================
async function migrateColumns() {
  const migrarColuna = async (tabela, coluna, tipo) => {
    try {
      const [columns] = await poolPromise.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [GLOBAL_DB_NAME, tabela, coluna]
      );
      if (columns.length === 0) {
        await poolPromise.execute(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${coluna}\` ${tipo}`);
        console.log(`✅ Migração: Coluna ${coluna} adicionada à tabela ${tabela}`);
      }
    } catch (err) {
      // Ignora se já existe
      if (!err.message.includes('Duplicate column')) {
        console.error(`❌ Erro ao migrar coluna ${coluna}:`, err.message);
      }
    }
  };

  // As colunas já estão no CREATE TABLE, mas mantém para compatibilidade
  // com bancos que possam ter sido criados antes
  await migrarColuna('operadoras', 'planoId', "VARCHAR(50) DEFAULT 'gratuito'");
  await migrarColuna('operadoras', 'logoUrl', 'LONGTEXT');

  // ⭐ Campos do profissional: titulo, cabecalho e RQEs
  await migrarColuna('usuarios', 'titulo', 'VARCHAR(100)');
  await migrarColuna('usuarios', 'cabecalhoRelatorio', 'TEXT');
  await migrarColuna('usuarios', 'rqes', 'TEXT');

  // ⭐ Campos de endereço do profissional (médico/dentista)
  await migrarColuna('usuarios', 'endereco', 'VARCHAR(255)');
  await migrarColuna('usuarios', 'numero', 'VARCHAR(20)');
  await migrarColuna('usuarios', 'complemento', 'VARCHAR(255)');
  await migrarColuna('usuarios', 'bairro', 'VARCHAR(255)');
  await migrarColuna('usuarios', 'cidade', 'VARCHAR(255)');
  await migrarColuna('usuarios', 'cepUsuario', 'VARCHAR(10)');
  await migrarColuna('usuarios', 'ufEndereco', 'VARCHAR(2)');
}

// ==================== DADOS INICIAIS ====================
async function seedInitialData() {
  try {
    const [rows] = await poolPromise.execute('SELECT COUNT(*) as count FROM usuarios');
    if (rows[0].count > 0) return;

    console.log('🌱 Populando banco GLOBAL com dados mock...');

    await poolPromise.execute(
      `INSERT IGNORE INTO operadoras (id, nome, cnpj, razaoSocial, telefone, email, endereco, ativa, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['op1', 'Saúde Total', '12.345.678/0001-90', 'Saúde Total Ltda', '(11) 3456-7890', 'contato@saudetotal.com.br', 'Av. Paulista, 1000 - São Paulo, SP', 1, '2024-01-01']
    );

    await poolPromise.execute(
      `INSERT IGNORE INTO clinicas (id, operadoraId, nome, telefone, email, endereco, ativa, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['c1', 'op1', 'Clínica Central', '(11) 3456-7891', 'central@saudetotal.com.br', 'Rua Augusta, 500 - São Paulo, SP', 1, '2024-01-01']
    );

    await poolPromise.execute(
      `INSERT IGNORE INTO usuarios (id, nome, email, senha, tipo, operadoraId, clinicaId, ativo, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['u1', 'Admin Sistema', 'admin@easyclin.com', 'admin123', 'super_admin', 'op1', null, 1, '2024-01-01']
    );

    await poolPromise.execute(
      `INSERT IGNORE INTO usuarios (id, nome, email, senha, tipo, operadoraId, clinicaId, ativo, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['u2', 'Dra. Ana Costa', 'ana@easyclin.com', '123456', 'medico', 'op1', 'c1', 1, '2024-01-01']
    );

    await poolPromise.execute(
      `INSERT IGNORE INTO usuarios (id, nome, email, senha, tipo, operadoraId, clinicaId, ativo, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['u3', 'Dr. Carlos Silva', 'carlos@easyclin.com', '123456', 'dentista', 'op1', 'c1', 1, '2024-01-01']
    );

    console.log('✅ Dados mock GLOBAIS populados!');

    // Planos padrão
    const agora = new Date().toISOString();
    await poolPromise.execute(
      `INSERT IGNORE INTO planos (id, nome, preco, limitePacientes, recursos, destaque, ativo, ordem, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['gratuito', 'Grátis', 0, 20, JSON.stringify(['Até 20 pacientes', 'Agendamento básico', 'Prontuário eletrônico', 'Suporte por email']), 0, 1, 1, agora, agora]
    );

    await poolPromise.execute(
      `INSERT IGNORE INTO planos (id, nome, preco, limitePacientes, recursos, destaque, ativo, ordem, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['basico', 'Básico', 30, 150, JSON.stringify(['Até 150 pacientes', 'Agendamento completo', 'Prontuário eletrônico', 'Lembretes WhatsApp', 'Relatórios básicos', 'Suporte prioritário']), 1, 1, 2, agora, agora]
    );

    await poolPromise.execute(
      `INSERT IGNORE INTO planos (id, nome, preco, limitePacientes, recursos, destaque, ativo, ordem, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['profissional', 'Profissional', 120, null, JSON.stringify(['Pacientes ilimitados', 'Todas as funcionalidades', 'Integração Memed', 'Relatórios avançados', 'API de integração', 'Suporte 24/7', 'Backup automático']), 0, 1, 3, agora, agora]
    );

    console.log('✅ Planos padrão populados!');
  } catch (err) {
    console.error('❌ Erro ao popular dados iniciais:', err.message);
  }
}

// ==================== API COMPATÍVEL COM better-sqlite3 ====================
// Wrapper que imita a API síncrona do better-sqlite3
// IMPORTANTE: Agora é ASSÍNCRONO — rotas precisam usar async/await

const dbGlobal = {
  // Pool direto para uso avançado
  getPool: () => poolPromise,

  // Imita db.prepare(sql).get(...params) — AGORA ASYNC
  // Uso: const row = await dbGlobal.prepare('SELECT...').get(param1, param2)
  prepare: (sql) => ({
    get: async (...params) => {
      const [rows] = await poolPromise.query(sql, params);
      return rows[0] || null;
    },
    all: async (...params) => {
      const [rows] = await poolPromise.query(sql, params);
      return rows;
    },
    run: async (...params) => {
      const [result] = await poolPromise.query(sql, params);
      return { changes: result.affectedRows, lastInsertRowid: result.insertId };
    }
  }),

  // Imita db.exec(sql) — para múltiplos statements
  exec: async (sql) => {
    const statements = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    for (const stmt of statements) {
      await poolPromise.query(stmt);
    }
  },

  // Imita db.pragma('table_info(tabela)') — retorna info de colunas
  pragma: async (cmd) => {
    const match = cmd.match(/table_info\((\w+)\)/);
    if (match) {
      const tabela = match[1];
      const [columns] = await poolPromise.execute(
        `SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as \`notnull\`, COLUMN_DEFAULT as dflt_value, COLUMN_KEY as pk
         FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [GLOBAL_DB_NAME, tabela]
      );
      return columns.map((c) => ({
        name: c.name,
        type: c.type,
        notnull: c.notnull === 'NO' ? 1 : 0,
        dflt_value: c.dflt_value,
        pk: c.pk === 'PRI' ? 1 : 0
      }));
    }
    return [];
  },

  // Helper: executa query simples (atalho)
  execute: async (sql, params = []) => {
    return poolPromise.query(sql, params);
  },

  // Inicialização
  init: initGlobalDatabase
};

module.exports = dbGlobal;