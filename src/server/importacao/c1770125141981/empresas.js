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

async function migrarempresas() {

  console.log('🚀 MIGRAÇÃO DE empresaS\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [empresas] = await origem.execute(`
       SELECT 
    e.id,
    e.razasoci as nome,
    e.cnpj,
    e.razasoci as razaoSocial,
    e.foneadm as telefone,
    e.emailadm or "123@123.com" as email,
    e.endeadm as endereco,
    e.contato,
    e.obs as observacoes,
    if(e.situacao='ATIVO', 1,0) as ativa,
    DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i:%s') as criadoEm
FROM tb_empresas e
WHERE e.id_operadora = 1
    `);

  console.log(`📊 ${empresas.length} empresas encontradas\n`);

  const cols = Object.keys(empresas[0]);

  for (let i = 0; i < empresas.length; i += BATCH) {

    const batch = empresas.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO empresas_conveniadas (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, empresas.length)} / ${empresas.length}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarempresas();