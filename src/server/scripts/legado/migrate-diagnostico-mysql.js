
/**
 * Migração: tb_diagnostico (MySQL) → diagnosticos (SQLite)
 * 
 * Cada diagnóstico é ligado obrigatoriamente a uma consulta (consultaId).
 * Uso: node migrate-diagnostico-mysql.js
 */

const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DRY_RUN = false;

const MYSQL_CONFIG = {
  host: process.env.IMPORT_MYSQL_HOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'inno'
};

const dbPath = path.join(__dirname, '..', '..', '../../data/c1770079554106-Osasco.db');
const dbSqlite = new sqlite3.Database(dbPath);

function sqliteRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbSqlite.run(sql, params, function (err) {if (err) reject(err);else resolve(this);});
  });
}

function sqliteGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    dbSqlite.get(sql, params, function (err, row) {if (err) reject(err);else resolve(row);});
  });
}

async function inserirOuAtualizar(tabela, obj, campoChave = 'id') {
  const chaveValor = obj[campoChave];
  const existe = await sqliteGet(`SELECT ${campoChave} FROM ${tabela} WHERE ${campoChave} = ?`, [chaveValor]);
  const cols = Object.keys(obj);
  const vals = Object.values(obj);

  if (!existe) {
    const marks = cols.map(() => '?').join(',');
    if (DRY_RUN) {console.log('\n🧪 INSERT:', cols.join(','));return;}
    await sqliteRun(`INSERT INTO ${tabela} (${cols.join(',')}) VALUES (${marks})`, vals);
    return 'insert';
  } else {
    const set = cols.filter((c) => c !== campoChave).map((c) => `${c}=?`).join(',');
    const valoresUpdate = [...cols.filter((c) => c !== campoChave).map((c) => obj[c]), chaveValor];
    if (DRY_RUN) {console.log('\n🧪 UPDATE:', set);return;}
    await sqliteRun(`UPDATE ${tabela} SET ${set} WHERE ${campoChave}=?`, valoresUpdate);
    return 'update';
  }
}

async function migrarDiagnosticos() {
  console.log('🚀 MIGRAÇÃO DE DIAGNÓSTICOS INICIADA\n');
  let mysqlConn;

  try {
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Conectado ao MySQL\n');

    // ⭐ Ajuste os nomes das colunas conforme sua tabela tb_diagnostico
    const [diagnosticos] = await mysqlConn.execute(`
      SELECT
        d.id,
        d.id_consulta as consultaId,
        d.id_paciente as pacienteId,
        d.cid_principal_codigo as diagnosticoPrincipalCodigo,
        d.cid_principal_descricao as diagnosticoPrincipalDescricao,
        d.outros_diagnosticos as outrosDiagnosticos,
        d.observacoes,
        d.id_profissional as profissionalId,
        COALESCE(d.profissional, 'Importado MySQL') as profissional,
        COALESCE(DATE_FORMAT(d.data_atendimento, '%Y-%m-%d'), DATE_FORMAT(NOW(), '%Y-%m-%d')) as data,
        DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') as criadoEm
      FROM tb_diagnostico d
      ORDER BY d.id
    `);

    console.log(`📊 ${diagnosticos.length} diagnósticos encontrados\n`);

    let insert = 0,update = 0,semConsulta = 0,erro = 0;

    for (const d of diagnosticos) {
      try {
        if (!d.consultaId) {console.log(`⏭️  #${d.id} → SEM CONSULTA`);semConsulta++;continue;}

        // outrosDiagnosticos pode vir como JSON string ou texto
        let outrosDiag = null;
        if (d.outrosDiagnosticos) {
          try {outrosDiag = d.outrosDiagnosticos;} catch {outrosDiag = d.outrosDiagnosticos;}
        }

        const resultado = await inserirOuAtualizar('diagnosticos', {
          id: String(d.id),
          consultaId: String(d.consultaId),
          pacienteId: String(d.pacienteId),
          diagnosticoPrincipalCodigo: d.diagnosticoPrincipalCodigo || null,
          diagnosticoPrincipalDescricao: d.diagnosticoPrincipalDescricao || null,
          outrosDiagnosticos: outrosDiag,
          observacoes: d.observacoes || null,
          profissionalId: d.profissionalId ? String(d.profissionalId) : null,
          profissional: d.profissional,
          data: d.data,
          criadoEm: d.criadoEm,
          atualizadoEm: d.criadoEm
        }, 'id');

        if (resultado === 'insert') insert++;
        if (resultado === 'update') update++;
        console.log(`✅ #${d.id} → consulta ${d.consultaId} | CID: ${d.diagnosticoPrincipalCodigo || 'N/A'}`);
      } catch (err) {
        console.log(`❌ #${d.id} → ${err.message}`);erro++;
      }
    }

    console.log('\n📊 RESUMO');
    console.log(`Inseridos: ${insert}`);
    console.log(`Atualizados: ${update}`);
    console.log(`Sem consulta: ${semConsulta}`);
    console.log(`Erros: ${erro}`);
  } catch (err) {
    console.error('❌ ERRO GERAL:', err.message);
  } finally {
    if (mysqlConn) await mysqlConn.end();
    dbSqlite.close();
    console.log('\n🏁 Migração finalizada');
  }
}

migrarDiagnosticos();