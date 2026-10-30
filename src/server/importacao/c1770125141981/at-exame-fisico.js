
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

async function migrarExamesFisicos() {

  console.log('🚀 MIGRAÇÃO DE exame físico\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  // ⭐ Ajuste os nomes das colunas de ORIGEM (easyclin) se forem diferentes no seu banco.
  const [rows] = await origem.execute(`
SELECT 
    e.id,
    e.fk_paciente_id as pacienteId,
    e.fk_consulta_id as consultaId,
    if(e.fk_colaborador_id, e.fk_colaborador_id*10, null) AS profissionalId,
    e.altura,
    e.peso,
    e.imc,
    e.pressao_art as pressaoArterial,
    e.pulso,
    e.obs_exame_fisico as observacoesGerais,
    DATE_FORMAT(e.updated_at,'%Y-%m-%d %H:%i:%s') as data,
    DATE_FORMAT(e.updated_at,'%Y-%m-%d %H:%i:%s') as atualizadoEm,
    DATE_FORMAT(e.created_at,'%Y-%m-%d %H:%i:%s') as criadoEm
FROM easyclin.tb_exame_fisico e
where e.fk_paciente_id > 0
ORDER BY e.id;
    `);

  console.log(`📊 ${rows.length} exames físicos encontrados\n`);

  if (!rows.length) {console.log('⚠️ Nenhum registro encontrado');await origem.end();await destino.end();return;}

  const cols = Object.keys(rows[0]);

  for (let i = 0; i < rows.length; i += BATCH) {

    const batch = rows.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    // ⭐ DESTINO CORRETO: tabela 'exames_fisicos' (a que o sistema LÊ),
    // NÃO 'atendimento_exames_fisicos'.
    const sql = `
      INSERT INTO exames_fisicos (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, rows.length)} / ${rows.length} ${rows[i].id}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarExamesFisicos();