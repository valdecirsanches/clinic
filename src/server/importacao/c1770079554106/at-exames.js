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
  database: 'easyclin_c1770079554106'
};

async function migrarexames() {

  console.log('🚀 MIGRAÇÃO DE exames\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [exames] = await origem.execute(`
SELECT 
    e.id,
    e.fk_prontuario_id as pacienteId,
    e.fk_consulta_id as consultaId,
    if(e.fk_medico_id,e.fk_medico_id*10, null) AS profissionalId,
    e.descricao,
    e.motivo as justificativa,
    e.pedido,
    e.cid10,
    DATE_FORMAT(e.data_salvo,'%Y-%m-%d %H:%i:%s') as data,
    DATE_FORMAT(e.data_salvo,'%Y-%m-%d %H:%i:%s') as atualizadoEm,
    DATE_FORMAT(e.data_salvo,'%Y-%m-%d %H:%i:%s') as criadoEm
FROM inno.tb_exames e
where e.fk_prontuario_id>0
ORDER BY e.id;
    `);

  console.log(`📊 ${exames.length} exames encontradas\n`);

  const cols = Object.keys(exames[0]);

  for (let i = 0; i < exames.length; i += BATCH) {

    const batch = exames.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO atendimento_exames_solicitados (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, exames.length)} / ${exames.length} ${exames[i].id}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarexames();