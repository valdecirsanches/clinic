const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DRY_RUN = false; // true = só mostra, false = insere

const MYSQL_CONFIG = {
  host: process.env.IMPORT_MYSQL_HOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'easyclin'
};

const dbPath = path.join(__dirname, '../easyclin-clinica-c1770125141981.db');

const dbSqlite = new sqlite3.Database(dbPath);

function sqliteRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbSqlite.run(sql, params, function (err) {
      if (err) reject(err);else
      resolve({ lastID: this.lastID });
    });
  });
}

// INSERT automático baseado nos nomes das colunas
function inserirAutomatico(tabela, obj) {
  const cols = Object.keys(obj);
  const vals = Object.values(obj);
  const marks = cols.map(() => '?').join(',');

  const sql = `INSERT INTO ${tabela} (${cols.join(',')}) VALUES (${marks})`;

  if (DRY_RUN) {
    console.log('\n🧪 SQL:', sql);
    console.log('📦', vals);
    return Promise.resolve();
  }

  return sqliteRun(sql, vals);
}

async function migrarAssociadas() {
  console.log('🚀 MIGRAÇÃO DE EMPRESAS INICIADA\n');

  let mysqlConn;

  try {
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Conectado ao MySQL\n');

    const [associadas] = await mysqlConn.execute(`
      SELECT 
        a.id,
        a.id_empresa           AS empresaConveniadaId,
        '1' as ativa,
        a.razao_social         AS nome,
        a.id                   AS codigo,
        CONCAT(a.endereco, ' - Bairro: ', a.bairro, ' - CEP: ', a.cep) AS endereco,
        a.cidade,
        a.uf,
        a.fone                 AS telefone,
        a.email                AS responsavel,
        CONCAT('CNPJ: ', a.cnpj, ' IE: ', a.ie) AS observacoes,
        a.created_at           AS criadoEm
      FROM tb_subempresa a
      WHERE a.id_operadora = 1
      ORDER BY a.id
    `);

    console.log(`📊 ${associadas.length} associadas encontradas\n`);

    let ok = 0;
    let erro = 0;

    for (const a of associadas) {
      try {
        await inserirAutomatico('unidades_empresa', a);
        console.log(`✅ ${a.nome}`);
        ok++;
      } catch (err) {
        console.log(`❌ ${a.nome} → ${err.message}`);
        erro++;
      }
    }

    console.log('\n📊 RESUMO');
    console.log(`Importados: ${ok}`);
    console.log(`Erros: ${erro}`);

  } catch (err) {
    console.error('❌ ERRO GERAL:', err.message);
  } finally {
    if (mysqlConn) await mysqlConn.end();
    dbSqlite.close();
    console.log('\n🏁 Migração finalizada');
  }
}

migrarAssociadas();