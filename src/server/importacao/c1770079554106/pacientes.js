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

async function migrarpacientes() {

  console.log('🚀 MIGRAÇÃO DE pacienteS\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [pacientes] = await origem.execute(`
SELECT 
    p.id,
    if(p.id_medico,id_medico*10, null) AS profissionalResponsavelId,
    p.id_convenio AS convenioId,
    p.id_plano AS plano,
    p.codigo AS numeroContrato,
    p.codigo AS matricula,
    p.paciente AS nome,
    DATE_FORMAT(COALESCE(p.data_cad, NOW()), '%Y-%m-%d') AS dataInicio,
    CONCAT(p.reg_conv, ' ', p.obs, ' ', p.empresa) AS observacoes,
    p.rg,
    left(p.cpf,20) as cpf,
    p.endereco AS logradouro,
    LEFT(p.endereco_numero,10) AS numero,
    left(p.complento,50) as complemento,
    p.bairro,
    p.cep,
    p.cidade_ibge AS codigoIbge,
    p.estado AS uf,
    p.cidade,
    p.telefone AS telefoneResidencial,
    COALESCE(p.celular, p.telefone) AS telefone,
    DATE_FORMAT(COALESCE(p.data_nasc,'1900-01-01'),'%Y-%m-%d') AS dataNascimento,
    p.sexo AS genero,
    p.profissao,
    p.responsavel AS nomeResponsavel,
    p.email,
    p.carteirinha AS numeroCarteirinha,
    p.necesp AS necessidadeEspecial,
    IF(p.necesp > '', '1', '0') AS dificuldadeLocomocao,
    p.mae AS nomeMae,
    'ativo' AS status,
    DATE_FORMAT(COALESCE(p.data_cad, NOW()), '%Y-%m-%d') AS criadoEm
FROM inno.paciente p
WHERE p.id > 0
and p.paciente is not null
ORDER BY p.paciente;
    `);

  console.log(`📊 ${pacientes.length} pacientes encontradas\n`);

  const cols = Object.keys(pacientes[0]);

  for (let i = 0; i < pacientes.length; i += BATCH) {

    const batch = pacientes.slice(i, i + BATCH);

    const values = batch.map((p) => cols.map((c) => p[c]));

    const marks = values.
    map((v) => `(${v.map(() => '?').join(',')})`).
    join(',');

    const sql = `
      INSERT INTO pacientes (${cols.join(',')})
      VALUES ${marks}
      ON DUPLICATE KEY UPDATE
      ${cols.
    filter((c) => c !== 'id').
    map((c) => `${c}=VALUES(${c})`).
    join(',')}
    `;

    await destino.query(sql, values.flat());

    console.log(`✅ ${Math.min(i + BATCH, pacientes.length)} / ${pacientes.length} ${pacientes[i].necessidadeEspecial}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarpacientes();