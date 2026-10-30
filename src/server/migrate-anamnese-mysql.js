
/**
 * Migração: tb_anamnese (MySQL) → anamneses (SQLite)
 * 
 * Cada anamnese é ligada obrigatoriamente a uma consulta (consultaId).
 * Importa SOMENTE anamnese. Cada etapa tem seu próprio script.
 * Uso: node migrate-anamnese-mysql.js
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
const dbPath = path.join(__dirname, '../../data/c1770079554106-Osasco.db');
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

async function migrarAnamnese() {
  console.log('🚀 MIGRAÇÃO DE ANAMNESE INICIADA\n');

  let mysqlConn;

  try {
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Conectado ao MySQL\n');

    // ⭐ Ajuste os nomes das colunas conforme sua tabela tb_anamnese
    // ⭐ id_consulta é OBRIGATÓRIO - liga a anamnese à consulta
    const [anamneses] = await mysqlConn.execute(`
      SELECT
        a.id,
        a.id_consulta as consultaId,
        a.id_paciente as pacienteId,
        a.queixa_principal as queixaPrincipal,
        a.historia_doenca_atual as historiaQueixa,
        a.antecedentes_pessoais as historicoDoencas,
        a.antecedentes_familiares as historicoFamiliar,
        a.alergias,
        a.medicamentos_em_uso as medicamentosEmUso,
        a.habitos_vida as habitosVida,
        a.observacoes,
        a.id_profissional as profissionalId,
        COALESCE(a.profissional, 'Importado MySQL') as profissional,
        COALESCE(DATE_FORMAT(a.data_atendimento, '%Y-%m-%d'), DATE_FORMAT(NOW(), '%Y-%m-%d')) as data,
        DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') as criadoEm
      FROM tb_anamnese a
      ORDER BY a.id
    `);

    console.log(`📊 ${anamneses.length} anamneses encontradas\n`);

    let insert = 0;
    let update = 0;
    let semConsulta = 0;
    let erro = 0;

    for (const a of anamneses) {
      try {
        // ⭐ Pula anamneses sem consulta vinculada
        if (!a.consultaId) {
          console.log(`⏭️  #${a.id} → SEM CONSULTA, ignorado`);
          semConsulta++;
          continue;
        }

        const resultado = await inserirOuAtualizar(
          'anamneses',
          {
            id: String(a.id),
            consultaId: String(a.consultaId),
            pacienteId: String(a.pacienteId),
            queixaPrincipal: a.queixaPrincipal || null,
            historiaQueixa: a.historiaQueixa || null,
            historicoDoencas: a.historicoDoencas || null,
            alergias: a.alergias || null,
            medicamentosEmUso: a.medicamentosEmUso || null,
            historicoFamiliar: a.historicoFamiliar || null,
            habitosVida: a.habitosVida || null,
            observacoes: a.observacoes || null,
            profissionalId: a.profissionalId ? String(a.profissionalId) : null,
            profissional: a.profissional,
            data: a.data,
            criadoEm: a.criadoEm,
            atualizadoEm: a.criadoEm
          },
          'id'
        );

        if (resultado === 'insert') insert++;
        if (resultado === 'update') update++;
        console.log(`✅ #${a.id} → consulta ${a.consultaId} | paciente ${a.pacienteId}`);

      } catch (err) {
        console.log(`❌ #${a.id} → ${err.message}`);
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

migrarAnamnese();