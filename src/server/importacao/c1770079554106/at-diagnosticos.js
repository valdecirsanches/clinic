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

async function migrardiagnosticos() {

  console.log('🚀 MIGRAÇÃO DE Diagnosticos\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [diagnosticos] = await origem.execute(`
SELECT 
    d.id,
    d.fk_prontuario_id as pacienteId,
    d.fk_consulta_id as consultaId,
    if(d.fk_medico_id,d.fk_medico_id*10, null) AS profissionalId,
    d.diagnostico as diagnosticoPrincipalDescricao,
    d.outros_diagnosticos as outrosDiagnosticos,
    d.obs_diagnostico as observacoes,
    DATE_FORMAT(d.data_salvo,'%Y-%m-%d %H:%i:%s') as data,
    DATE_FORMAT(d.data_salvo,'%Y-%m-%d %H:%i:%s') as atualizadoEm,
    DATE_FORMAT(d.data_salvo,'%Y-%m-%d %H:%i:%s') as criadoEm
FROM inno.tb_hipotese_diagnostica d
where d.fk_prontuario_id>0
ORDER BY d.id;
    `);

  console.log(`📊 ${diagnosticos.length} diagnosticos encontradas\n`);

  const cols = Object.keys(diagnosticos[0]);

  for (let i = 0; i < diagnosticos.length; i += BATCH) {

    const batch = diagnosticos.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO atendimento_diagnosticos (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, diagnosticos.length)} / ${diagnosticos.length} ${diagnosticos[i].id}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrardiagnosticos();