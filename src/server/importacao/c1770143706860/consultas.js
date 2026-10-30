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
  database: 'easyclin_c1770143706860'
};




async function migrarconsultas() {

  console.log('🚀 MIGRAÇÃO DE CONSULTAS\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [consultas] = await origem.execute(`
      SELECT 
        a.id,
        a.id_associado AS pacienteId,
        p.nome AS pacienteNome,
        a.id_dentista AS profissionalId,

        DATE_FORMAT(a.data,'%Y-%m-%d') AS data,
        CAST(a.hora AS CHAR) AS horario,

        coalesce(lower(a.status),'agendado') as status,

        coalesce(m.intervalo, '30') AS duracao,
        CAST(a.hora_chegada AS CHAR) AS horaChegada,
        CAST(a.hora_inicial AS CHAR) AS horaInicioAtendimento,
        CAST(a.hora_final AS CHAR) AS horaFimAtendimento,
        a.color as cor,
        'normal' AS tipo,
        m.nome AS profissional,
        a.notes as observacoes,
        a.fone_whatsapp AS whatsappTelefone,
        DATE_FORMAT(coalesce(a.confirmacao_dh,'%Y-%m-%d %H:%i:%s'),null) AS confirmacaoRecebidaEm 

      FROM easyclin.tb_agenda a
      LEFT JOIN easyclin.tb_pacientes p ON p.id = a.id_associado
      LEFT JOIN easyclin.tb_colaboradores m ON m.id = a.id_dentista

      WHERE a.id_operadora=2
      and a.id_associado > 0 
      AND a.id_dentista > 0
      and a.data is not null
      and a.hora is not null
      and p.nome is not null
      and m.nome is not null
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

    console.log(`✅ ${Math.min(i + BATCH, consultas.length)} / ${consultas.length}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarconsultas();