
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

async function migrarExames() {

  console.log('🚀 MIGRAÇÃO DE exames solicitados\n');

  const origem = await mysql.createConnection(MYSQL_ORIGEM);
  const destino = await mysql.createConnection(MYSQL_DESTINO);

  // ⭐ Ajuste os nomes das colunas de ORIGEM (easyclin) se forem diferentes no seu banco.
  // Inclui os "exames de rotina/gratuitos": eles ficam na MESMA tabela de exames
  // solicitados (descricao costuma ser 'EXAMES DE ROTINA').
  const [rows] = await origem.execute(`
SELECT 
    e.id,
    e.fk_paciente_id as pacienteId,
    e.fk_consulta_id as consultaId,
    if(e.fk_colaborador_id, e.fk_colaborador_id*10, null) AS profissionalId,
    e.descricao,
    e.motivo as justificativa,
    e.pedido,
    e.cid10,
    DATE_FORMAT(e.updated_at,'%Y-%m-%d %H:%i:%s') as data,
    DATE_FORMAT(e.updated_at,'%Y-%m-%d %H:%i:%s') as atualizadoEm,
    DATE_FORMAT(e.created_at,'%Y-%m-%d %H:%i:%s') as criadoEm
FROM easyclin.tb_exames e
where e.fk_paciente_id > 0
ORDER BY e.id;
    `);

  console.log(`📊 ${rows.length} exames encontrados\n`);

  if (!rows.length) {console.log('⚠️ Nenhum registro encontrado');await origem.end();await destino.end();return;}

  const cols = Object.keys(rows[0]);

  for (let i = 0; i < rows.length; i += BATCH) {

    const batch = rows.slice(i, i + BATCH);

    const registrosValidos = [];

    for (const row of batch) {

      const registro = cols.map(col => {

        let valor = row[col];

        if (valor === undefined) {
          valor = null;
        }

        return valor;
      });

      if (registro.length !== cols.length) {

        console.log('\n❌ REGISTRO INVÁLIDO');
        console.log('ID:', row.id);
        console.log(registro);

        continue;
      }

      registrosValidos.push(registro);
    }

    if (!registrosValidos.length) {
      continue;
    }

    const placeholders = registrosValidos
      .map(() => `(${cols.map(() => '?').join(',')})`)
      .join(',');

    // ⭐ DESTINO CORRETO: 'atendimento_exames_solicitados' (a que o sistema LÊ).
    const sql = `
      INSERT INTO atendimento_exames_solicitados
      (${cols.join(',')})
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
      ${cols
        .filter(c => c !== 'id')
        .map(c => `${c}=VALUES(${c})`)
        .join(',')}
    `;

    try {

      await destino.query(
        sql,
        registrosValidos.flat()
      );

    console.log(`✅ ${Math.min(i + BATCH, rows.length)} / ${rows.length} ${rows[i].id}`);
  }

  await origem.end();
  await destino.end();

  console.log('\n🏁 MIGRAÇÃO FINALIZADA');
}

migrarExames();