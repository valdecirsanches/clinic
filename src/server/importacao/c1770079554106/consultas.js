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




async function migrarconsultas() {

  console.log('🚀 MIGRAÇÃO DE CONSULTAS\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [consultas] = await origem.execute(`
       SELECT 
        a.id,
        a.id_paciente AS pacienteId,
        coalesce(p.paciente, '') AS pacienteNome,
        (a.id_medico*10) as profissionalId,
        
        a.id_procedimento as procedimentoId,

        DATE_FORMAT(a.data,'%Y-%m-%d %H:%i:%s') AS data,
        CAST(a.hora AS CHAR) AS horario,
        lower(coalesce(a.status, 'agendado')) as status,
        '15' AS duracao,
        CAST(a.hora_chegada AS CHAR) AS horaChegada,
        CAST(a.hora_ini_atend AS CHAR) AS horaInicioAtendimento,
        CAST(a.hora_fim_atend AS CHAR) AS horaFimAtendimento,
        a.cor,
        'normal' AS tipo,
        coalesce(m.medico, '') AS profissional,

        a.fone_whatsapp AS whatsappTelefone

      FROM inno.tb_agendas a
      LEFT JOIN inno.paciente p ON p.id = a.id_paciente
      LEFT JOIN inno.medicos m ON m.id = a.id_medico

      WHERE a.id_paciente > 0 
      AND a.id_medico > 0
      and a.hora is not null
      and a.data is not null
      and a.status is not null
      
  `);

  console.log(`📊 ${consultas.length} consultas encontradas\n`);

  const cols = Object.keys(consultas[0]);

  for (let i = 0; i < consultas.length; i += BATCH) {

    const batch = consultas.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO consultas (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, consultas.length)} / ${consultas.length} **** ${consultas[i].procedimentoId}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarconsultas();