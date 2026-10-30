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

async function migrarevolucoes() {

  console.log('🚀 MIGRAÇÃO DE evoluções\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [evolucoes] = await origem.execute(`
SELECT 
    e.id,
    e.fk_paciente_id as pacienteId,
    e.fk_consulta_id as consultaId,
    if(e.fk_colaborador_id,e.fk_colaborador_id*10, null) AS profissionalId,
    e.evolucao as evolucao,
    DATE_FORMAT(e.updated_at,'%Y-%m-%d %H:%i:%s') as data,
    DATE_FORMAT(e.updated_at,'%Y-%m-%d %H:%i:%s') as atualizadoEm,
    DATE_FORMAT(e.created_at,'%Y-%m-%d %H:%i:%s') as criadoEm
FROM easyclin.tb_evolucoes e
where e.fk_paciente_id>0
and id_operadora = 1
ORDER BY e.id;
    `);

  console.log(`📊 ${evolucoes.length} evolucoes encontradas\n`);

  const cols = Object.keys(evolucoes[0]);

  for (let i = 0; i < evolucoes.length; i += BATCH) {

    const batch = evolucoes.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO atendimento_evolucoes (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, evolucoes.length)} / ${evolucoes.length} ${evolucoes[i].id}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarevolucoes();