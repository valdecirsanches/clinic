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
  database: 'easyclin_global'
};

async function migrarusuarios() {

  console.log('🚀 MIGRAÇÃO DE USUÁRIOS\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [usuarios] = await origem.execute(`
     SELECT 
    IF(m.id IS NOT NULL, m.id * 10, u.id) AS id,
    'c1770079554106' AS clinicaId,
    'op1770078943084' AS operadoraId,
    u.first_name as nome, 
    u.email,
    '123456' AS senha,
    IF(m.id IS NOT NULL, 'medico', 'atendente') AS tipo,
    COALESCE(m.cpf, '111111111-11') AS cpf,
    COALESCE(m.crm, '') AS crm,
    COALESCE(m.empresa_uf, '') AS uf,
    COALESCE(m.empresa_cep, '') AS cepUsuario,
    COALESCE(m.empresa_endereco, '') AS endereco,
    COALESCE(m.empresa_numero, '') AS numero,
    COALESCE(m.empresa_complemento, '') AS complemento,
    COALESCE(m.empresa_bairro, '') AS bairro,
    COALESCE(m.empresa_cidade, '') AS cidade,
    COALESCE(m.empresa_uf, '') AS ufEndereco,
    DATE_FORMAT(COALESCE(m.data_nascimento,'1900-01-01'),'%Y-%m-%d') AS dataNascimento,
    DATE_FORMAT(NOW(),'%Y-%m-%d') AS criadoEm
FROM inno.tb_usuarios u
LEFT JOIN inno.medicos m ON m.id = u.id_medico
WHERE u.id > 0;

  `);

  if (!usuarios.length) {
    console.log("⚠️ Nenhum usuário encontrado.");
    return;
  }

  console.log(`📊 ${usuarios.length} usuários encontrados\n`);

  const cols = Object.keys(usuarios[0]);

  for (let i = 0; i < usuarios.length; i += BATCH) {

    const batch = usuarios.slice(i, i + BATCH);

    const values = batch.map((u) => cols.map((c) => u[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const updateFields = cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',');

    const sql = `
      INSERT INTO usuarios (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE ${updateFields}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, usuarios.length)} / ${usuarios.length}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarusuarios();