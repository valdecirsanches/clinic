const mysql = require('mysql2/promise');

const DRY_RUN = false;

const MYSQL_ORIGEM = {
  host: process.env.IMPORT_MYSQL_HOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'inno'
};

const MYSQL_DESTINO = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'easyclin_c1770079554106'
};

async function inserirOuAtualizar(conn, tabela, obj, campoChave = 'id') {

  const chaveValor = obj[campoChave];

  const [existe] = await conn.execute(
    `SELECT ${campoChave} FROM ${tabela} WHERE ${campoChave} = ?`,
    [chaveValor]
  );

  const cols = Object.keys(obj);
  const vals = Object.values(obj);

  if (existe.length === 0) {

    const marks = cols.map(() => '?').join(',');
    const sql = `INSERT INTO ${tabela} (${cols.join(',')}) VALUES (${marks})`;

    if (DRY_RUN) {
      console.log('\n🧪 INSERT:', sql);
      console.log(vals);
      return;
    }

    await conn.execute(sql, vals);
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

    await conn.execute(sql, valoresUpdate);
    return 'update';
  }
}

async function migrarplanos() {

  console.log('🚀 MIGRAÇÃO DE PLANOS INICIADA\n');

  let origem;
  let destino;

  try {

    origem = await mysql.createConnection(MYSQL_ORIGEM);
    destino = await mysql.createConnection(MYSQL_DESTINO);

    console.log('✅ Conectado aos bancos\n');

    const [planos] = await origem.execute(`
      SELECT 
        p.id,
        p.id_convenio as convenioId,
        p.descricao as nome,
        p.anotacoes as observacoes,
        DATE_FORMAT(now(),'%Y-%m-%d %H:%i:%s') AS criadoEm
      FROM inno.tb_planos p
    `);

    console.log(`📊 ${planos.length} planos encontrados\n`);

    let insert = 0;
    let update = 0;
    let erro = 0;

    for (const a of planos) {

      try {

        const resultado = await inserirOuAtualizar(
          destino,
          'planos_saude',
          a,
          'id'
        );

        if (resultado === 'insert') insert++;
        if (resultado === 'update') update++;

        console.log(`✅ ${a.nome}`);

      } catch (err) {

        console.log(`❌ ${a.nome} → ${err.message}`);
        erro++;
      }
    }

    console.log('\n📊 RESUMO');
    console.log(`Inseridos: ${insert}`);
    console.log(`Atualizados: ${update}`);
    console.log(`Erros: ${erro}`);

  } catch (err) {

    console.error('❌ ERRO GERAL:', err);

  } finally {

    if (origem) await origem.end();
    if (destino) await destino.end();

    console.log('\n🏁 Migração finalizada');
  }
}

migrarplanos();