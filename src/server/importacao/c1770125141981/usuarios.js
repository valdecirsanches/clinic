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
        (SELECT id FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as id, 
        'c1770125141981' as clinicaId,
        'op1770124855394' as operadoraId,
        u.nome, 
        u.email,
        '123456' as senha,
        lower((SELECT funcao FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1)) as tipo,
        (SELECT cpf FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as cpf,
        coalesce(
          (SELECT celular FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1),
          (SELECT res_telefone FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1)
        ) as telefone,

        DATE_FORMAT(coalesce(
          (SELECT nascimento FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1),'1900-01-01'),
          '%Y-%m-%d') AS dataNascimento,

        (SELECT cro FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as crm,
        (SELECT cro_uf FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as uf,
    
        (SELECT res_endereco FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as endereco,
        (SELECT res_numero FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as numero,
        (SELECT res_bairro FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as bairro,
        (SELECT res_cidade FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as cidade,
        (SELECT res_complemento FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as complemento,
        (SELECT res_estado FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as ufEndereco,
        (SELECT res_cep FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1) as cepUsuario,

        DATE_FORMAT(coalesce(
          (SELECT created_at FROM tb_colaboradores WHERE id_usuario=u.id LIMIT 1),'1900-01-01'),
          '%Y-%m-%d') AS criadoEm

      FROM tb_usuarios u
      WHERE u.id_operadora=1 
      AND u.status='ativo' 
      AND u.id_clinica=112
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