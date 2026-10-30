
/**
 * Migração: tb_padrao_exame (MySQL) → padroes_exames (SQLite)
 * 
 * Padrões de exames são modelos reutilizáveis por profissional.
 * Não são ligados a consulta — são templates globais ou por profissional.
 * Uso: node migrate-padrao-exame-mysql.js
 */

const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DRY_RUN = false; // true = só mostra, false = executa

const MYSQL_CONFIG = {
  host: process.env.IMPORT_MYSQL_HOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'inno'
};

// ⭐ Usa a mesma lógica do servidor para encontrar o banco correto
const { getDbPathForClinica } = require('../../databaseClinica');
const CLINICA_ID = 'c1770079554106';
const dbPath = getDbPathForClinica(CLINICA_ID);
console.log(`📂 Banco SQLite: ${dbPath}`);
const dbSqlite = new sqlite3.Database(dbPath);

function sqliteRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbSqlite.run(sql, params, function (err) {
      if (err) reject(err);else
      resolve(this);
    });
  });
}

function sqliteGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbSqlite.get(sql, params, function (err, row) {
      if (err) reject(err);else
      resolve(row);
    });
  });
}

async function inserirOuAtualizar(tabela, obj, campoChave = 'id') {
  const chaveValor = obj[campoChave];
  const existe = await sqliteGet(
    `SELECT ${campoChave} FROM ${tabela} WHERE ${campoChave} = ?`,
    [chaveValor]
  );

  const cols = Object.keys(obj);
  const vals = Object.values(obj);

  if (!existe) {
    const marks = cols.map(() => '?').join(',');
    const sql = `INSERT INTO ${tabela} (${cols.join(',')}) VALUES (${marks})`;
    if (DRY_RUN) {
      console.log('\n🧪 INSERT:', sql);
      console.log(vals);
      return;
    }
    await sqliteRun(sql, vals);
    return 'insert';
  } else {
    const set = cols.
    filter((c) => c !== campoChave).
    map((c) => `${c}=?`).
    join(',');
    const sql = `UPDATE ${tabela} SET ${set} WHERE ${campoChave}=?`;
    const valoresUpdate = [
    ...cols.filter((c) => c !== campoChave).map((c) => obj[c]),
    chaveValor];

    if (DRY_RUN) {
      console.log('\n🧪 UPDATE:', sql);
      console.log(valoresUpdate);
      return;
    }
    await sqliteRun(sql, valoresUpdate);
    return 'update';
  }
}

async function migrarPadroesExames() {
  console.log('🚀 MIGRAÇÃO DE PADRÕES DE EXAMES INICIADA\n');

  let mysqlConn;

  try {
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Conectado ao MySQL\n');

    // ⭐ Ajuste os nomes das colunas conforme sua tabela tb_padrao_exame
    // Se a tabela tiver nome diferente (ex: tb_modelo_exame, tb_template_exame), altere aqui
    const [padroes] = await mysqlConn.execute(`
      SELECT
        p.id,
        p.id_profissional as profissionalId,
        p.nome,
        p.descricao,
        p.pedido,
        p.justificativa,
        p.cid10,
        DATE_FORMAT(COALESCE(p.criado_em, NOW()), '%Y-%m-%d %H:%i:%s') as criadoEm
      FROM tb_padrao_exame p
      ORDER BY p.nome
    `);

    console.log(`📊 ${padroes.length} padrões de exames encontrados\n`);

    let insert = 0;
    let update = 0;
    let erro = 0;

    for (const p of padroes) {
      try {
        const resultado = await inserirOuAtualizar(
          'padroes_exames',
          {
            id: String(p.id),
            profissionalId: p.profissionalId ? String(p.profissionalId) : null,
            nome: p.nome || 'Padrão sem nome',
            descricao: p.descricao || null,
            pedido: p.pedido || null,
            justificativa: p.justificativa || null,
            cid10: p.cid10 || null,
            criadoEm: p.criadoEm,
            atualizadoEm: p.criadoEm
          },
          'id'
        );

        if (resultado === 'insert') insert++;
        if (resultado === 'update') update++;

        const profLabel = p.profissionalId ? `prof ${p.profissionalId}` : 'global';
        console.log(`✅ #${p.id} → "${p.nome}" (${profLabel})`);

      } catch (err) {
        console.log(`❌ #${p.id} → ${err.message}`);
        erro++;
      }
    }

    console.log('\n📊 RESUMO');
    console.log(`Inseridos: ${insert}`);
    console.log(`Atualizados: ${update}`);
    console.log(`Erros: ${erro}`);

  } catch (err) {
    console.error('❌ ERRO GERAL:', err.message);
  } finally {
    if (mysqlConn) await mysqlConn.end();
    dbSqlite.close();
    console.log('\n🏁 Migração finalizada');
  }
}

migrarPadroesExames();