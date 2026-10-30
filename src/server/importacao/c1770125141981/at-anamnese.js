const mysql = require('mysql2/promise');
const { exit } = require('process');

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

async function migraranamneses() {

  console.log('🚀 MIGRAÇÃO DE anamneseS\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [anamneses] = await origem.execute(`
SELECT 
    a.id,
    a.fk_paciente_id as pacienteId,
    a.fk_consulta_id as consultaId,
    if(a.fk_colaborador_id,a.fk_colaborador_id*10, null) AS profissionalId,
    a.queixa_principal as queixaPrincipal,
    a.queixa_historia AS historiaQueixa,
    DATE_FORMAT(a.updated_at,'%Y-%m-%d %H:%i:%s') as atualizadoEm,
    DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i:%s') as criadoEm
FROM easyclin.tb_anamneses a
where a.fk_paciente_id>0
and id_operadora = 1
ORDER BY a.id;
    `);

  console.log(`📊 ${anamneses.length} anamneses encontradas\n`);

  const cols = Object.keys(anamneses[0]);

  for (let i = 0; i < anamneses.length; i += BATCH) {

    const batch = anamneses.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO atendimento_anamneses (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    // console.log(sql);
    await destino.query(sql, values.flat());
    // return;
    console.log(`✅ ${Math.min(i + BATCH, anamneses.length)} / ${anamneses.length} ${i}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migraranamneses();