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

async function migrarrelatorios() {

  console.log('🚀 MIGRAÇÃO DE relatorios\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [relatorios] = await origem.execute(`
SELECT 
    r.id,
    r.fk_prontuario_id as pacienteId,
    r.fk_consulta_id as consultaId,
    if(r.fk_medico_id,r.fk_medico_id*10, null) AS profissionalId,
    r.titulo,
    r.texto as conteudo,
    r.cid10,
    DATE_FORMAT(r.data_salvo,'%Y-%m-%d %H:%i:%s') as data,
    DATE_FORMAT(r.data_salvo,'%Y-%m-%d %H:%i:%s') as atualizadoEm,
    DATE_FORMAT(r.data_salvo,'%Y-%m-%d %H:%i:%s') as criadoEm
FROM inno.tb_relatorios r
where r.fk_prontuario_id>0
ORDER BY r.id;
    `);

  console.log(`📊 ${relatorios.length} relatorios encontradas\n`);

  const cols = Object.keys(relatorios[0]);

  for (let i = 0; i < relatorios.length; i += BATCH) {

    const batch = relatorios.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO atendimento_relatorios (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, relatorios.length)} / ${relatorios.length} ${relatorios[i].necessidadeEspecial}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarrelatorios();