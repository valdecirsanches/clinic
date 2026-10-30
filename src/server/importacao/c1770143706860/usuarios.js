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
        co.id as id, 
        'c1770143706860' as clinicaId,
        'op1770048884167' as operadoraId,
        co.nome, 
        coalesce(co.email,concat(co.cpf,'@lodonto.com')) as email,
        '123456' as senha,
        lower(coalesce(co.funcao,'atendente')) as tipo,
        co.cpf as cpf,
        coalesce(co.celular,co.res_telefone) as telefone,

        DATE_FORMAT(coalesce(co.nascimento,'1900-01-01'),'%Y-%m-%d') AS dataNascimento,

        co.cro as crm,
        co.cro_uf as uf,
       
    
        co.res_endereco as endereco,
        co.res_numero as numero,
        co.res_bairro as bairro,
        co.res_cidade as cidade,
        co.res_complemento as complemento,
        co.res_estado as ufEndereco,
        co.res_cep as cepUsuario,

        DATE_FORMAT(coalesce(co.created_at,'1900-01-01'),'%Y-%m-%d') AS criadoEm

      FROM tb_colaboradores co
      left join tb_usuarios u on co.id_usuario=u.id
      WHERE co.id_operadora=2
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