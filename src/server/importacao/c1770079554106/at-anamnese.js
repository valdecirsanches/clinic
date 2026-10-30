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

async function migraranamneses() {

  console.log('🚀 MIGRAÇÃO DE anamneseS\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [anamneses] = await origem.execute(`
SELECT 
    a.id,
    a.fk_prontuario_id as pacienteId,
    a.fk_consulta_id as consultaId,
    if(a.fk_medico_id,a.fk_medico_id*10, null) AS profissionalId,
    a.queixa_principal as queixaPrincipal,
    a.queixa_historia AS historiaQueixa,
    DATE_FORMAT(a.data_salvo,'%Y-%m-%d %H:%i:%s') as atualizadoEm,
    DATE_FORMAT(a.data_salvo,'%Y-%m-%d %H:%i:%s') as criadoEm
FROM inno.tb_anamnese a
where a.fk_prontuario_id>0
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

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, anamneses.length)} / ${anamneses.length} ${anamneses[i].necessidadeEspecial}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migraranamneses();