const mysql = require('mysql2/promise');

const BATCH = 1000;

const MYSQL_ORIGEM = {
  host: process.env.IMPORT_MYSQL_HOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'easyclin'
};

const MYSQL_DESTINO = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'easyclin_c1770125141981'
};

async function migrarprocedimentos() {

  console.log('🚀 MIGRAÇÃO DE procedimentos\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [procedimentos] = await origem.execute(`
      SELECT 
        p.id,
        p.descricao as nome,
        p.descricao,
        '1' as ativo,
        'odontologica' as tipo,
        '30' as duracao,
        DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') as criadoEm       
      FROM easyclin.tb_procedimentos p
      WHERE p.id_operadora = 1 
      and descricao is not null
      and p.descricao > '...'
      ORDER BY p.id
    `);

  console.log(`📊 ${procedimentos.length} procedimentos encontradas\n`);

  const cols = Object.keys(procedimentos[0]);

  for (let i = 0; i < procedimentos.length; i += BATCH) {

    const batch = procedimentos.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO procedimentos (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, procedimentos.length)} / ${procedimentos.length}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarprocedimentos();