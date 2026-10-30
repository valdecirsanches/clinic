
/**
 * Migração: tb_prescricao (MySQL) → prescricoes (SQLite)
 * 
 * Cada prescrição é ligada obrigatoriamente a uma consulta (consultaId).
 * Uso: node migrate-prescricao-mysql.js
 * 
 * ⭐ IMPORTANTE: Ajuste o nome da tabela MySQL e das colunas conforme seu banco.
 *    Se a tabela tiver nome diferente (ex: tb_prescricoes, tb_receita), altere na query abaixo.
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

/**
 * ⭐ Converte medicamentos do formato MySQL para JSON compatível com o frontend.
 * 
 * Ajuste esta função conforme o formato dos medicamentos no seu MySQL.
 * O frontend espera um array de objetos com:
 *   { id, nome, dosagem, quantidade, unidade, posologia }
 * 
 * Possíveis formatos no MySQL:
 * 1. JSON string já formatado → parse direto
 * 2. Texto livre separado por linhas → converte para array
 * 3. Campo único (prescricao/receita) → coloca como texto genérico
 */
function parseMedicamentos(raw) {
  if (!raw) return '[]';

  // Se já é JSON válido, retorna direto
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed);
      }
    } catch (e) {
















      // Não é JSON — trata como texto livre
    } // Texto livre: cada linha vira um medicamento
    const linhas = raw.split('\n').filter((l) => l.trim().length > 0);if (linhas.length > 0) {const meds = linhas.map((linha, idx) => ({ id: `med-migrado-${idx + 1}-${Date.now()}`, nome: linha.trim(), dosagem: '', quantidade: '', unidade: '', posologia: '' }));return JSON.stringify(meds);}}return '[]';
}

async function migrarPrescricoes() {
  console.log('🚀 MIGRAÇÃO DE PRESCRIÇÕES INICIADA\n');

  let mysqlConn;

  try {
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Conectado ao MySQL\n');

    // ⭐ AJUSTE: Nome da tabela e colunas conforme seu banco MySQL
    // Colunas comuns: id, id_consulta, id_paciente, id_profissional,
    //   profissional, controle_especial, data, generico/texto_livre,
    //   medicamentos/prescricao/receita, data_prescricao
    //
    // Se sua tabela tiver nome diferente, altere "tb_prescricao" abaixo.
    // Se as colunas tiverem nomes diferentes, ajuste os aliases no SELECT.
    const [prescricoes] = await mysqlConn.execute(`
      SELECT
        p.id,
        p.id_consulta as consultaId,
        p.id_paciente as pacienteId,
        p.id_profissional as profissionalId,
        COALESCE(p.profissional, 'Importado MySQL') as profissional,
        COALESCE(p.controle_especial, 0) as controleEspecial,
        p.generico,
        p.medicamentos,
        COALESCE(DATE_FORMAT(p.data_prescricao, '%Y-%m-%d'), DATE_FORMAT(p.data, '%Y-%m-%d'), DATE_FORMAT(NOW(), '%Y-%m-%d')) as data,
        DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') as criadoEm
      FROM tb_prescricao p
      ORDER BY p.id
    `);

    console.log(`📊 ${prescricoes.length} prescrições encontradas\n`);

    let insert = 0;
    let update = 0;
    let semConsulta = 0;
    let erro = 0;

    for (const p of prescricoes) {
      try {
        if (!p.consultaId) {
          console.log(`⏭️  #${p.id} → SEM CONSULTA, ignorado`);
          semConsulta++;
          continue;
        }

        // Converte medicamentos para formato JSON do frontend
        const medicamentosJSON = parseMedicamentos(p.medicamentos);

        const resultado = await inserirOuAtualizar(
          'prescricoes',
          {
            id: String(p.id),
            consultaId: String(p.consultaId),
            pacienteId: String(p.pacienteId),
            controleEspecial: p.controleEspecial ? 1 : 0,
            data: p.data,
            generico: p.generico || null,
            medicamentos: medicamentosJSON,
            profissionalId: p.profissionalId ? String(p.profissionalId) : null,
            profissional: p.profissional,
            criadoEm: p.criadoEm,
            atualizadoEm: p.criadoEm
          },
          'id'
        );

        if (resultado === 'insert') insert++;
        if (resultado === 'update') update++;

        // Conta medicamentos para o log
        let qtdMeds = 0;
        try {
          qtdMeds = JSON.parse(medicamentosJSON).length;
        } catch (e) {}

        console.log(`✅ #${p.id} → consulta ${p.consultaId} | paciente ${p.pacienteId} | ${qtdMeds} med(s) | ${p.controleEspecial ? 'CONTROLE ESPECIAL' : 'normal'}`);

      } catch (err) {
        console.log(`❌ #${p.id} → ${err.message}`);
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
    console.log('\n💡 DICA: Se a tabela não existe, verifique o nome correto no MySQL:');
    console.log('   SHOW TABLES LIKE "%prescri%";');
    console.log('   SHOW TABLES LIKE "%receita%";');
    console.log('   Depois ajuste o nome da tabela no SELECT acima.');
  } finally {
    if (mysqlConn) await mysqlConn.end();
    dbSqlite.close();
    console.log('\n🏁 Migração finalizada');
  }
}

migrarPrescricoes();