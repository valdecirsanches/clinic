const mysql = require('mysql2/promise');

const BATCH = 1000;

const MYSQL_ORIGEM = {
  host: process.env.IMPORT_MYSQL_HOST || process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'inno'
};

const MYSQL_DESTINO = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: 'easyclin_c1770079554106'
};

async function migrarPrescricoes() {

  console.log('🚀 MIGRAÇÃO MYSQL → MYSQL\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [rows] = await origem.execute(`
    SELECT
      p.id,
      p.fk_consulta_id as consultaId,
      p.fk_prontuario_id as pacienteId,
      (m.id * 10) as profissionalId,
      m.medico as profissional,
      COALESCE(p.cont_esp,0) as controleEspecial,
      '' as generico,
      '' as medicamentos,
      
      p.prescricao as descricao,
      DATE_FORMAT(p.data_prescricao,'%Y-%m-%d') as data,
      DATE_FORMAT(p.data_salvo,'%Y-%m-%d %H:%i:%s') as atualizadoEm,
      DATE_FORMAT(p.data_salvo,'%Y-%m-%d %H:%i:%s') as criadoEm
      FROM tb_prescricoes p
    LEFT JOIN medicos m ON m.id = p.fk_medico_id
    ORDER BY p.id
  `);

  console.log(`📊 ${rows.length} registros encontrados\n`);

  if (!rows.length) {
    console.log('⚠️ Nenhum registro encontrado');
    return;
  }

  // pega colunas automaticamente
  const cols = Object.keys(rows[0]);

  console.log('📦 Colunas detectadas:');
  console.log(cols.join(', '), '\n');

  for (let i = 0; i < rows.length; i += BATCH) {

    const batch = rows.slice(i, i + BATCH);

    const values = batch.map((r) => cols.map((c) => r[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO atendimento_prescricoes (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarPrescricoes();