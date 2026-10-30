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

async function migrarpacientes() {

  console.log('🚀 MIGRAÇÃO DE pacienteS\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  const [pacientes] = await origem.execute(`
      SELECT 
        p.id,
        p.matricula,
        p.nome,
        p.status,
        p.contrato AS numeroContrato,
        DATE_FORMAT(coalesce(p.datainic, now()), '%Y-%m-%d') as dataInicio,
        DATE_FORMAT(coalesce(p.nascimento, '1900-01-01'), '%Y-%m-%d') as dataNascimento,
        NULL AS idade,
        p.sexo AS genero,
        p.estacivi AS estadoCivil,
        p.dificuldade_locomocao AS dificuldadeLocomocao,
        coalesce(p.cic,'nao informado') AS cpf,
        p.rg,
        p.rg_orgao_emissor AS emissorRg,
        p.numero_cns AS cns,
        p.pis AS pisPasep,
        NULL AS convenio,
        p.id_empresa AS empresa,
        p.id_empresa AS empresaConveniadaId,
        p.id_subempresa AS unidadeEmpresaId,
        p.id_plano AS plano,
        p.profissao,
        '' AS grauInstrucao,
        p.id_dentista AS profissionalResponsavelId,
        p.mae AS nomeMae,
        p.pai AS nomePai,
        p.responsavel AS nomeResponsavel,
        p.rg_responsavel AS rgResponsavel,
        p.cpf_responsavel AS cpfResponsavel,
        p.registro_empresa AS registroEmpresa,
        p.cepresi AS cep,
        p.enderesi AS logradouro,
        left(p.numresi,10) AS numero,
        p.complemento,
        p.bairresi AS bairro,
        p.cidaresi AS cidade,
        p.ufresi AS uf,
        p.cod_cidade AS codigoIbge,
        p.foneresi AS telefoneResidencial,
        coalesce(p.fonecelular, foneresi) AS telefone,
        p.email,
        p.obs AS observacoes,
        p.anotacoes,
        p.id_titular as titularId,
        p.parentesco,
        p.datainic AS dataCadastro,
        NOW() AS criadoEm,
        p.deleted AS deletado,
        p.deleted_at AS deletadoEm,
        p.enderesi AS endereco,
        NULL AS fotoUrl,
        0 AS whatsappVerificado,
        NULL AS whatsappFotoUrl,
        NULL AS whatsappVerificadoEm,
        NULL AS numeroCarteirinha,
        p.id_plano AS planoSaudeId,
        p.data_cancelamento as canceladoEm,
        p.motivo_cancelamento as motivoCancelamento,
        '' as cancelamentoUsuario
      FROM easyclin.tb_pacientes p
      WHERE p.id_operadora = 2 
      and nome is not null
      ORDER BY p.nome
    `);

  console.log(`📊 ${pacientes.length} pacientes encontradas\n`);

  const cols = Object.keys(pacientes[0]);

  for (let i = 0; i < pacientes.length; i += BATCH) {

    console.log(`✅ ${pacientes[i].empresaConveniadaId}   ${pacientes[i].id}   ${pacientes[i].nome}`);

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

    //console.log(`✅ ${Math.min(i + BATCH, pacientes.length)} / ${pacientes.length} ${pacientes[i].id_empresa}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarpacientes();