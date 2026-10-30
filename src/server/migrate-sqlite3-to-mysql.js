/**
 * ============================================================
 * MIGRAÇÃO COMPLETA: SQLite3 → MySQL
 * ============================================================
 * 
 * Migra TODOS os dados dos bancos SQLite3 locais para o MySQL.
 * 
 * Bancos:
 *   - data/principal.db → easyclin_global (operadoras, clinicas, usuarios, etc.)
 *   - data/c{id}-{nome}.db → easyclin_c{id} (pacientes, consultas, prontuarios, etc.)
 * 
 * Uso:
 *   node migrate-sqlite3-to-mysql.js                    # Migra tudo
 *   node migrate-sqlite3-to-mysql.js --dry-run          # Só mostra, não grava
 *   node migrate-sqlite3-to-mysql.js --only-global      # Só banco global
 *   node migrate-sqlite3-to-mysql.js --only-clinica c1  # Só uma clínica
 *   node migrate-sqlite3-to-mysql.js --skip-existing    # Pula registros que já existem (INSERT IGNORE)
 * 
 * Requisitos:
 *   npm install better-sqlite3 mysql2
 * 
 * ============================================================
 */

const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// ==================== CONFIGURAÇÃO ====================

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  charset: 'utf8mb4',
  connectTimeout: 30000
};

const GLOBAL_DB_NAME = process.env.MYSQL_GLOBAL_DB || 'easyclin_global';
const CLINICA_DB_PREFIX = 'easyclin_';

// Diretório dos bancos SQLite3
const DATA_DIR = path.join(__dirname, 'data');
const GLOBAL_DB_PATH = path.join(DATA_DIR, 'principal.db');

// ==================== ARGUMENTOS ====================

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_GLOBAL = args.includes('--only-global');
const SKIP_EXISTING = args.includes('--skip-existing') || true; // Default: skip
const ONLY_CLINICA = args.includes('--only-clinica') ? args[args.indexOf('--only-clinica') + 1] : null;
const VERBOSE = args.includes('--verbose');

// ==================== TABELAS DO BANCO GLOBAL ====================

const TABELAS_GLOBAL = [
'operadoras',
'clinicas',
'usuarios',
'configuracoes_globais',
'memed_profissionais',
'medicamentos',
'planos',
'especialidades',
'cid10'];


// ==================== TABELAS POR CLÍNICA ====================

const TABELAS_CLINICA = [
'pacientes',
'agendas',
'horarios_trabalho',
'consultas',
'prontuarios',
'atendimentos',
'atendimento_anamneses',
'atendimento_diagnosticos',
'atendimento_exames_fisicos',
'atendimento_exames_solicitados',
'atendimento_padroes_exames',
'atendimento_evolucoes',
'atendimento_prescricoes',
'atendimento_prescricoes_remedios',
'parcelas',
'configuracoes_clinica',
'whatsapp_config',
'procedimentos',
'planos_saude',
'empresas_conveniadas',
'unidades_empresa',
'financeiro',
'dependentes',
'convenios',
'documentos',
'mensagens_historico',
'solicitacoes_pendentes',
'dialogos_whatsapp',
'assinaturas_pendentes'];


// ==================== HELPERS ====================

function sanitizeDbName(clinicaId) {
  return `${CLINICA_DB_PREFIX}${clinicaId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

function log(msg) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${msg}`);
}

function logVerbose(msg) {
  if (VERBOSE) log(msg);
}

// Encontra todos os bancos SQLite3 de clínicas no diretório data/
function findClinicaDatabases() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ Diretório de dados não encontrado: ${DATA_DIR}`);
    console.log(`   Verifique se os bancos SQLite3 estão em: ${DATA_DIR}`);
    console.log(`   Arquivos esperados: principal.db, c{id}-{nome}.db`);
    return [];
  }

  const files = fs.readdirSync(DATA_DIR);
  const clinicaDbs = [];

  for (const file of files) {
    // Padrão: c{id}.db ou c{id}-{nome}.db
    const match = file.match(/^(c[a-zA-Z0-9_]+)(?:-[^.]+)?\.db$/);
    if (match && file !== 'principal.db') {
      clinicaDbs.push({
        clinicaId: match[1],
        filePath: path.join(DATA_DIR, file),
        fileName: file
      });
    }
  }

  return clinicaDbs;
}

// Lê todas as linhas de uma tabela SQLite3
function readSqliteTable(db, tableName) {
  try {
    // Verifica se a tabela existe
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);

    if (!tableExists) {
      logVerbose(`   ⏭️  Tabela ${tableName} não existe no SQLite`);
      return { columns: [], rows: [] };
    }

    // Pega info das colunas
    const columns = db.pragma(`table_info(${tableName})`).map((c) => c.name);

    // Lê todos os registros
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();

    return { columns, rows };
  } catch (err) {
    console.error(`   ❌ Erro ao ler tabela ${tableName}:`, err.message);
    return { columns: [], rows: [] };
  }
}

// Insere registros no MySQL (batch)
// IMPORTANTE: Usa query() em vez de execute() para evitar problemas com prepared statements
async function insertIntoMysql(mysqlConn, dbName, tableName, columns, rows) {
  if (rows.length === 0) return { inserted: 0, skipped: 0, errors: 0 };

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Usa INSERT IGNORE para pular duplicados
  const placeholders = columns.map(() => '?').join(', ');
  const columnList = columns.map((c) => `\`${c}\``).join(', ');
  const sql = `INSERT IGNORE INTO \`${tableName}\` (${columnList}) VALUES (${placeholders})`;

  for (const row of rows) {
    try {
      // Extrai valores na ordem das colunas
      const values = columns.map((col) => {
        let val = row[col];
        // Converte undefined para null
        if (val === undefined) val = null;
        // MySQL não aceita Infinity ou NaN
        if (typeof val === 'number' && !isFinite(val)) val = null;
        // Buffer/Blob → null (evita problemas)
        if (Buffer.isBuffer(val)) val = val.toString('base64');
        return val;
      });

      if (DRY_RUN) {
        logVerbose(`   🧪 ${sql.substring(0, 80)}... → [${values.slice(0, 3).join(', ')}...]`);
        inserted++;
        continue;
      }

      const [result] = await mysqlConn.query(sql, values);
      if (result.affectedRows > 0) {
        inserted++;
      } else {
        skipped++;
      }
    } catch (err) {
      // Trata erros comuns
      if (err.code === 'ER_DUP_ENTRY') {
        skipped++;
      } else if (err.code === 'ER_NO_SUCH_TABLE') {
        logVerbose(`   ⚠️  Tabela ${tableName} não existe no MySQL - pulando`);
        return { inserted: 0, skipped: rows.length, errors: 0 };
      } else if (err.code === 'ER_BAD_FIELD_ERROR') {
        const badCol = err.message.match(/Unknown column '(\w+)'/);
        if (badCol) {
          logVerbose(`   ⚠️  Coluna ${badCol[1]} não existe no MySQL, ignorando registro`);
        }
        errors++;
      } else if (err.code === 'ER_DATA_TOO_LONG') {
        logVerbose(`   ⚠️  Dados muito longos para ${tableName}, ignorando registro`);
        errors++;
      } else {
        if (errors < 5) {
          console.error(`   ❌ Erro ao inserir em ${tableName}: ${err.message}`);
          logVerbose(`      SQL: ${sql.substring(0, 100)}`);
        }
        errors++;
      }
    }
  }

  return { inserted, skipped, errors };
}

// Verifica quais colunas existem no MySQL e filtra as que não existem
// Usa query() em vez de execute() para INFORMATION_SCHEMA
async function getValidColumns(mysqlConn, dbName, tableName, sqliteColumns) {
  try {
    const [mysqlCols] = await mysqlConn.query(
      `SELECT COLUMN_NAME as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [dbName, tableName]
    );
    const mysqlColNames = new Set(mysqlCols.map((c) => c.name));

    const validColumns = sqliteColumns.filter((col) => mysqlColNames.has(col));
    const invalidColumns = sqliteColumns.filter((col) => !mysqlColNames.has(col));

    if (invalidColumns.length > 0) {
      logVerbose(`   ⚠️  Colunas ignoradas (não existem no MySQL): ${invalidColumns.join(', ')}`);
    }

    return validColumns;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
}

// ==================== MIGRAÇÃO DO BANCO GLOBAL ====================

async function migrateGlobalDatabase(mysqlConn) {
  console.log('\n' + '═'.repeat(60));
  console.log('  📦 MIGRANDO BANCO GLOBAL: principal.db → ' + GLOBAL_DB_NAME);
  console.log('═'.repeat(60));

  if (!fs.existsSync(GLOBAL_DB_PATH)) {
    console.error(`❌ Banco global não encontrado: ${GLOBAL_DB_PATH}`);
    return;
  }

  const sqliteDb = new Database(GLOBAL_DB_PATH, { readonly: true });
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Seleciona o banco MySQL — usa query() (DDL não suporta execute/prepared)
  await mysqlConn.query(`USE \`${GLOBAL_DB_NAME}\``);

  for (const tabela of TABELAS_GLOBAL) {
    const { columns, rows } = readSqliteTable(sqliteDb, tabela);

    if (rows.length === 0) {
      log(`   ⏭️  ${tabela}: vazia ou não existe`);
      continue;
    }

    // Filtra colunas válidas
    const validColumns = await getValidColumns(mysqlConn, GLOBAL_DB_NAME, tabela, columns);
    if (validColumns.length === 0) {
      log(`   ⚠️  ${tabela}: tabela não existe no MySQL`);
      continue;
    }

    log(`   📋 ${tabela}: ${rows.length} registros (${validColumns.length} colunas)...`);

    const result = await insertIntoMysql(mysqlConn, GLOBAL_DB_NAME, tabela, validColumns, rows);

    const status = [];
    if (result.inserted > 0) status.push(`✅ ${result.inserted} inseridos`);
    if (result.skipped > 0) status.push(`⏭️ ${result.skipped} já existiam`);
    if (result.errors > 0) status.push(`❌ ${result.errors} erros`);
    log(`      → ${status.join(' | ')}`);

    totalInserted += result.inserted;
    totalSkipped += result.skipped;
    totalErrors += result.errors;
  }

  sqliteDb.close();

  console.log(`\n   📊 GLOBAL: ${totalInserted} inseridos | ${totalSkipped} já existiam | ${totalErrors} erros`);
  return { inserted: totalInserted, skipped: totalSkipped, errors: totalErrors };
}

// ==================== MIGRAÇÃO DE BANCO DE CLÍNICA ====================

async function migrateClinicaDatabase(mysqlConn, clinicaInfo) {
  const { clinicaId, filePath, fileName } = clinicaInfo;
  const mysqlDbName = sanitizeDbName(clinicaId);

  console.log('\n' + '─'.repeat(60));
  console.log(`  🏥 CLÍNICA: ${fileName} → ${mysqlDbName}`);
  console.log('─'.repeat(60));

  if (!fs.existsSync(filePath)) {
    console.error(`   ❌ Arquivo não encontrado: ${filePath}`);
    return { inserted: 0, skipped: 0, errors: 0 };
  }

  const sqliteDb = new Database(filePath, { readonly: true });
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Cria o banco MySQL se não existir — usa query() (DDL)
  try {
    await mysqlConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${mysqlDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await mysqlConn.query(`USE \`${mysqlDbName}\``);
  } catch (err) {
    console.error(`   ❌ Erro ao criar/usar banco ${mysqlDbName}:`, err.message);
    sqliteDb.close();
    return { inserted: 0, skipped: 0, errors: 0 };
  }

  // Lista todas as tabelas do SQLite (pode ter tabelas extras)
  const sqliteTables = sqliteDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map((t) => t.name);

  // Combina tabelas conhecidas + extras encontradas no SQLite
  const tabelasParaMigrar = [...new Set([...TABELAS_CLINICA, ...sqliteTables])];

  for (const tabela of tabelasParaMigrar) {
    const { columns, rows } = readSqliteTable(sqliteDb, tabela);

    if (rows.length === 0) {
      logVerbose(`   ⏭️  ${tabela}: vazia ou não existe`);
      continue;
    }

    // Verifica se a tabela existe no MySQL
    const validColumns = await getValidColumns(mysqlConn, mysqlDbName, tabela, columns);
    if (validColumns.length === 0) {
      // Tabela não existe no MySQL - tenta criar automaticamente
      const created = await autoCreateTable(mysqlConn, mysqlDbName, tabela, sqliteDb);
      if (!created) {
        log(`   ⚠️  ${tabela}: não existe no MySQL e não pôde ser criada`);
        continue;
      }
      // Re-verifica colunas
      const recheck = await getValidColumns(mysqlConn, mysqlDbName, tabela, columns);
      if (recheck.length === 0) continue;
      // Usa as colunas revalidadas
      log(`   📋 ${tabela}: ${rows.length} registros (${recheck.length} colunas)...`);
      const result = await insertIntoMysql(mysqlConn, mysqlDbName, tabela, recheck, rows);
      const status = [];
      if (result.inserted > 0) status.push(`✅ ${result.inserted} inseridos`);
      if (result.skipped > 0) status.push(`⏭️ ${result.skipped} já existiam`);
      if (result.errors > 0) status.push(`❌ ${result.errors} erros`);
      log(`      → ${status.join(' | ')}`);
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      continue;
    }

    log(`   📋 ${tabela}: ${rows.length} registros (${validColumns.length} colunas)...`);

    const result = await insertIntoMysql(mysqlConn, mysqlDbName, tabela, validColumns, rows);

    const status = [];
    if (result.inserted > 0) status.push(`✅ ${result.inserted} inseridos`);
    if (result.skipped > 0) status.push(`⏭️ ${result.skipped} já existiam`);
    if (result.errors > 0) status.push(`❌ ${result.errors} erros`);
    log(`      → ${status.join(' | ')}`);

    totalInserted += result.inserted;
    totalSkipped += result.skipped;
    totalErrors += result.errors;
  }

  sqliteDb.close();

  console.log(`\n   📊 ${clinicaId}: ${totalInserted} inseridos | ${totalSkipped} já existiam | ${totalErrors} erros`);
  return { inserted: totalInserted, skipped: totalSkipped, errors: totalErrors };
}

// ==================== AUTO-CRIAR TABELA NO MYSQL ====================

async function autoCreateTable(mysqlConn, dbName, tableName, sqliteDb) {
  try {
    const columns = sqliteDb.pragma(`table_info(${tableName})`);
    if (columns.length === 0) return false;

    const colDefs = columns.map((col) => {
      let mysqlType = mapSqliteTypeToMysql(col.type, col.name);
      let def = `\`${col.name}\` ${mysqlType}`;
      if (col.pk) def += ' PRIMARY KEY';
      if (col.notnull && !col.pk) def += ' NOT NULL';
      if (col.dflt_value !== null && !col.pk) {
        // MySQL TEXT/LONGTEXT/BLOB não pode ter DEFAULT
        if (!mysqlType.includes('TEXT') && !mysqlType.includes('LONGTEXT') && !mysqlType.includes('BLOB')) {
          def += ` DEFAULT ${col.dflt_value}`;
        }
      }
      return def;
    });

    const sql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n  ${colDefs.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

    if (DRY_RUN) {
      log(`   🧪 AUTO-CREATE: ${sql.substring(0, 150)}...`);
      return true;
    }

    // DDL → usa query()
    await mysqlConn.query(sql);
    log(`   ✅ Tabela ${tableName} criada automaticamente no MySQL`);
    return true;
  } catch (err) {
    logVerbose(`   ⚠️  Não foi possível criar tabela ${tableName}: ${err.message}`);
    return false;
  }
}

function mapSqliteTypeToMysql(sqliteType, colName) {
  const type = (sqliteType || 'TEXT').toUpperCase();

  // Colunas que sabemos ser grandes
  if (colName === 'odontograma' || colName === 'assinaturaPaciente' || colName === 'assinaturaBase64') {
    return 'LONGTEXT';
  }
  if (colName === 'medicamentos' || colName === 'generico') {
    return 'LONGTEXT';
  }
  if (colName === 'fotoUrl' || colName === 'logoUrl') {
    return 'LONGTEXT';
  }

  if (type.includes('INT')) {
    if (colName.startsWith('ativo') || colName.startsWith('ativa') ||
    colName === 'destaque' || colName === 'deletado' ||
    colName === 'lembreteEnviado' || colName === 'enviarConfirmacao' ||
    colName === 'controleEspecial' || colName === 'dificuldadeLocomocao' ||
    colName === 'whatsappVerificado') {
      return 'TINYINT(1)';
    }
    return 'INT';
  }
  if (type.includes('REAL') || type.includes('FLOAT') || type.includes('DOUBLE') || type.includes('NUMERIC')) {
    return 'DOUBLE';
  }
  if (type.includes('BLOB')) {
    return 'LONGBLOB';
  }

  // VARCHAR para campos curtos (TEXT não pode ter DEFAULT no MySQL)
  if (colName === 'id' || colName.endsWith('Id')) return 'VARCHAR(191)';
  if (colName === 'email') return 'VARCHAR(255)';
  if (colName === 'nome' || colName.endsWith('Nome')) return 'VARCHAR(255)';
  if (colName === 'tipo' || colName === 'status' || colName === 'tarja') return 'VARCHAR(50)';
  if (colName === 'uf') return 'VARCHAR(2)';
  if (colName === 'cpf' || colName === 'cnpj') return 'VARCHAR(20)';
  if (colName === 'telefone' || colName === 'celular') return 'VARCHAR(50)';
  if (colName.includes('data') || colName.includes('Data') || colName.includes('Em')) return 'VARCHAR(50)';

  return 'TEXT';
}

// ==================== MAIN ====================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║   🔄 MIGRAÇÃO SQLite3 → MySQL                             ║');
  console.log('║                                                            ║');
  console.log('║   EasyClin - Migração Completa de Dados                   ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  if (DRY_RUN) {
    console.log('⚠️  MODO DRY-RUN: Nenhum dado será gravado no MySQL!\n');
  }

  // Verifica diretório de dados
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ Diretório de dados não encontrado: ${DATA_DIR}`);
    console.log(`\n💡 Certifique-se de que os bancos SQLite3 estão em:`);
    console.log(`   ${DATA_DIR}/principal.db`);
    console.log(`   ${DATA_DIR}/c{id}-{nome}.db`);
    process.exit(1);
  }

  // Lista arquivos encontrados
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.db'));
  console.log(`📁 Diretório: ${DATA_DIR}`);
  console.log(`📋 Bancos SQLite3 encontrados: ${files.length}`);
  files.forEach((f) => {
    const size = (fs.statSync(path.join(DATA_DIR, f)).size / 1024 / 1024).toFixed(2);
    console.log(`   - ${f} (${size} MB)`);
  });
  console.log('');

  // Conecta ao MySQL — usa query() para tudo que não é INSERT de dados
  log('📡 Conectando ao MySQL...');
  log(`   Host: ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}`);
  log(`   User: ${MYSQL_CONFIG.user}`);

  let mysqlConn;
  try {
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    log('✅ Conectado ao MySQL!\n');
  } catch (err) {
    console.error(`❌ Erro ao conectar ao MySQL: ${err.message}`);
    if (err.code === 'ECONNREFUSED') {
      console.log(`\n💡 Verifique se o MySQL está rodando em ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}`);
    }
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log(`\n💡 Verifique as credenciais: ${MYSQL_CONFIG.user}`);
    }
    process.exit(1);
  }

  const startTime = Date.now();
  let grandTotal = { inserted: 0, skipped: 0, errors: 0 };

  try {
    // ==================== BANCO GLOBAL ====================
    if (!ONLY_CLINICA) {
      // Garante que o banco existe — DDL usa query()
      await mysqlConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${GLOBAL_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );

      const globalResult = await migrateGlobalDatabase(mysqlConn);
      if (globalResult) {
        grandTotal.inserted += globalResult.inserted;
        grandTotal.skipped += globalResult.skipped;
        grandTotal.errors += globalResult.errors;
      }
    }

    // ==================== BANCOS DE CLÍNICAS ====================
    if (!ONLY_GLOBAL) {
      const clinicaDbs = findClinicaDatabases();

      if (clinicaDbs.length === 0) {
        console.log('\n⚠️  Nenhum banco de clínica encontrado em ' + DATA_DIR);
      } else {
        // Filtra se --only-clinica foi especificado
        const dbsToMigrate = ONLY_CLINICA ?
        clinicaDbs.filter((db) => db.clinicaId === ONLY_CLINICA) :
        clinicaDbs;

        if (ONLY_CLINICA && dbsToMigrate.length === 0) {
          console.error(`\n❌ Clínica "${ONLY_CLINICA}" não encontrada. Disponíveis:`);
          clinicaDbs.forEach((db) => console.log(`   - ${db.clinicaId} (${db.fileName})`));
        }

        console.log(`\n📋 Clínicas para migrar: ${dbsToMigrate.length}`);

        for (const clinicaDb of dbsToMigrate) {
          const result = await migrateClinicaDatabase(mysqlConn, clinicaDb);
          grandTotal.inserted += result.inserted;
          grandTotal.skipped += result.skipped;
          grandTotal.errors += result.errors;
        }
      }
    }

  } catch (err) {
    console.error('\n❌ ERRO FATAL:', err.message);
    console.error(err.stack);
  } finally {
    await mysqlConn.end();
    log('📡 Conexão MySQL fechada.');
  }

  // ==================== RESUMO FINAL ====================
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '═'.repeat(60));
  console.log('  📊 RESUMO FINAL DA MIGRAÇÃO');
  console.log('═'.repeat(60));
  console.log(`  ✅ Registros inseridos:  ${grandTotal.inserted}`);
  console.log(`  ⏭️  Já existiam (skip):  ${grandTotal.skipped}`);
  console.log(`  ❌ Erros:               ${grandTotal.errors}`);
  console.log(`  ⏱️  Tempo total:         ${elapsed}s`);
  if (DRY_RUN) {
    console.log(`\n  ⚠️  MODO DRY-RUN: Nenhum dado foi gravado!`);
    console.log(`  Execute sem --dry-run para migrar de verdade.`);
  }
  console.log('═'.repeat(60));
  console.log('');
}

// Executa
main().catch((err) => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});