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
  database: 'easyclin_c1770143706860'
};




async function migrarparcelas() {

  console.log('🚀 MIGRAÇÃO DE parcelas\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [parcelas] = await origem.execute(`
      SELECT 
        p.id,
        p.id_associado AS pacienteId,
        p.parcela AS numeroParcela,

        DATE_FORMAT(p.emissao,'%Y-%m-%d') AS dataEmissao,
        DATE_FORMAT(p.vencto,'%Y-%m-%d') AS dataVencimento,
        coalesce(p.vrparcela,'0') as valorParcela,
        if(pg.id is not null or au.id is not null, 'pago',if(p.abonado,'cancelado','pendente')) as status,
        DATE_FORMAT(coalesce(pg.pagto, au.data, null), '%Y-%m-%d') as dataPagamento,   


        DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') as criadoEm   
        
      FROM easyclin.tb_parcelas p
      LEFT JOIN easyclin.tb_pacientes a ON a.id = p.id_associado
      LEFT JOIN easyclin.tb_pagamentos pg ON pg.id_parcela = p.id
      LEFT JOIN easyclin.tb_autenticacoes au ON au.id_parcela = p.id

      WHERE a.id_operadora=2
      and p.id_associado > 0 
      and p.parcela is not null
      AND p.deleted  = 0
     
  `);

  console.log(`📊 ${parcelas.length} parcelas encontradas\n`);

  const cols = Object.keys(parcelas[0]);

  for (let i = 0; i < parcelas.length; i += BATCH) {

    const batch = parcelas.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO parcelas (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, parcelas.length)} / ${parcelas.length}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarparcelas();