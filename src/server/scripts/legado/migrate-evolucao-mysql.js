
/**
 * Migração: tb_evolucao (MySQL) → evolucoes (SQLite)
 * 
 * Cada evolução é ligada obrigatoriamente a uma consulta (consultaId).
 * Importa SOMENTE evolução. Cada etapa tem seu próprio script.
 * Uso: node migrate-evolucao-mysql.js
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

// ⭐ Ajuste o caminho do banco SQLite da clínica
const dbPath = path.join(__dirname, '..', '..', '../../data/c1770079554106-Osasco.db');
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

async function migrarEvolucao() {
  console.log('🚀 MIGRAÇÃO DE EVOLUÇÃO INICIADA\n');

  let mysqlConn;

  try {
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Conectado ao MySQL\n');

    // ⭐ Ajuste os nomes das colunas conforme sua tabela tb_evolucao
    const [evolucoes] = await mysqlConn.execute(`
      SELECT
        e.id,
        e.id_consulta as consultaId,
        e.id_paciente as pacienteId,
        e.evolucao,
        e.observacoes,
        e.id_profissional as profissionalId,
        COALESCE(e.profissional, 'Importado MySQL') as profissional,
        COALESCE(DATE_FORMAT(e.data_atendimento, '%Y-%m-%d'), DATE_FORMAT(NOW(), '%Y-%m-%d')) as data,
        DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') as criadoEm
      FROM tb_evolucao e
      ORDER BY e.id
    `);

    console.log(`📊 ${evolucoes.length} evoluções encontradas\n`);

    let insert = 0;
    let update = 0;
    let semConsulta = 0;
    let erro = 0;

    for (const e of evolucoes) {
      try {
        // ⭐ Pula evoluções sem consulta vinculada
        if (!e.consultaId) {
          console.log(`⏭️  #${e.id} → SEM CONSULTA, ignorado`);
          semConsulta++;
          continue;
        }

        const resultado = await inserirOuAtualizar(
          'evolucoes',
          {
            id: String(e.id),
            consultaId: String(e.consultaId),
            pacienteId: String(e.pacienteId),
            evolucao: e.evolucao || null,
            observacoes: e.observacoes || null,
            profissionalId: e.profissionalId ? String(e.profissionalId) : null,
            profissional: e.profissional,
            data: e.data,
            criadoEm: e.criadoEm,
            atualizadoEm: e.criadoEm
          },
          'id'
        );

        if (resultado === 'insert') insert++;
        if (resultado === 'update') update++;
        console.log(`✅ #${e.id} → consulta ${e.consultaId} | paciente ${e.pacienteId}`);

      } catch (err) {
        console.log(`❌ #${e.id} → ${err.message}`);
        erro++;
      }
    }

    console.log('\n📊 RESUMO');
    console.log(`Inseridos: ${insert}`);
    console.log(`Atualizados: ${update}`);
    console.log(`Sem consulta (ignorados): ${semConsulta}`);
    console.log(`Erros: ${erro}`);

  } catch (err) {
    console.error('❌ ERRO GERAL:', err.message);
  } finally {
    if (mysqlConn) await mysqlConn.end();
    dbSqlite.close();
    console.log('\n🏁 Migração finalizada');
  }
}

migrarEvolucao();