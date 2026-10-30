
// ==================== FIX: Corrigir profissionalId 2676 → 275 ====================
// Este script atualiza TODOS os registros que referenciam profissionalId = '2676'
// para o ID correto '275' em todas as tabelas de todas as clínicas.
//
// Uso: cd server && node fix-profissional-2676-para-275.js
//

const mysql = require('mysql2/promise');
const { MYSQL_CONFIG, GLOBAL_DB_NAME, CLINICA_DB_PREFIX } = require('./config/mysql');

const ID_ANTIGO = '2676';
const ID_CORRETO = '275';

// Tabelas que possuem coluna profissionalId
const TABELAS_COM_PROFISSIONAL_ID = [
'consultas',
'prontuarios',
'atendimentos',
'anamneses',
'diagnosticos',
'exames_fisicos',
'exames_solicitados',
'evolucoes',
'prescricoes',
'atendimento_relatorios',
'atestados',
'padroes_exames',
'padroes_prescricoes',
'padroes_relatorios',
'parcelas',
'financeiro',
'agendas'];


async function main() {
  console.log('='.repeat(70));
  console.log(`🔧 FIX: Corrigir profissionalId ${ID_ANTIGO} → ${ID_CORRETO}`);
  console.log('='.repeat(70));
  console.log();

  let connection;
  try {
    // Conecta ao MySQL
    connection = await mysql.createConnection({
      host: MYSQL_CONFIG.host,
      user: MYSQL_CONFIG.user,
      password: MYSQL_CONFIG.password,
      port: MYSQL_CONFIG.port,
      charset: MYSQL_CONFIG.charset
    });
    console.log('✅ Conectado ao MySQL\n');

    // 1. Primeiro verifica no banco global (usuarios) se o ID 275 existe
    console.log('📋 Verificando profissional ID 275 no banco global...');
    const [usuarios275] = await connection.query(
      `SELECT id, nome, tipo, clinicaId FROM ${GLOBAL_DB_NAME}.usuarios WHERE id = ?`,
      [ID_CORRETO]
    );
    if (usuarios275.length === 0) {
      console.error(`❌ ERRO: Profissional com ID ${ID_CORRETO} NÃO encontrado no banco global!`);
      console.error('   Verifique se o ID está correto antes de continuar.');
      process.exit(1);
    }
    console.log(`   ✅ Encontrado: ${usuarios275[0].nome} (tipo: ${usuarios275[0].tipo}, clínica: ${usuarios275[0].clinicaId || 'N/A'})`);

    // Verifica se o ID 2676 existe
    const [usuarios2676] = await connection.query(
      `SELECT id, nome, tipo FROM ${GLOBAL_DB_NAME}.usuarios WHERE id = ?`,
      [ID_ANTIGO]
    );
    if (usuarios2676.length > 0) {
      console.log(`   ⚠️  ID ${ID_ANTIGO} existe: ${usuarios2676[0].nome} (tipo: ${usuarios2676[0].tipo})`);
    } else {
      console.log(`   ℹ️  ID ${ID_ANTIGO} NÃO existe na tabela usuarios (já removido ou nunca existiu)`);
    }
    console.log();

    // 2. Lista todos os bancos de clínica
    const [databases] = await connection.query('SHOW DATABASES');
    const clinicaDbs = databases.
    map((db) => db.Database).
    filter((name) => name.startsWith(CLINICA_DB_PREFIX) && name !== GLOBAL_DB_NAME);

    console.log(`📁 Encontrados ${clinicaDbs.length} bancos de clínica\n`);

    let totalGeral = 0;

    // 3. Para cada banco de clínica, atualiza todas as tabelas
    for (const dbName of clinicaDbs) {
      let totalClinica = 0;

      for (const tabela of TABELAS_COM_PROFISSIONAL_ID) {
        try {
          // Verifica se a tabela existe
          const [tables] = await connection.query(
            `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
            [dbName, tabela]
          );
          if (tables.length === 0) continue;

          // Verifica se a coluna profissionalId existe
          const [columns] = await connection.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'profissionalId'`,
            [dbName, tabela]
          );
          if (columns.length === 0) continue;

          // Conta registros afetados
          const [countResult] = await connection.query(
            `SELECT COUNT(*) as total FROM \`${dbName}\`.\`${tabela}\` WHERE profissionalId = ?`,
            [ID_ANTIGO]
          );
          const count = countResult[0].total;
          if (count === 0) continue;

          // Atualiza
          const [updateResult] = await connection.query(
            `UPDATE \`${dbName}\`.\`${tabela}\` SET profissionalId = ? WHERE profissionalId = ?`,
            [ID_CORRETO, ID_ANTIGO]
          );

          console.log(`   ✅ ${dbName}.${tabela}: ${updateResult.affectedRows} registro(s) atualizado(s)`);
          totalClinica += updateResult.affectedRows;
        } catch (err) {
          // Ignora erros de tabela/coluna inexistente
          if (err.code !== 'ER_NO_SUCH_TABLE' && err.code !== 'ER_BAD_FIELD_ERROR') {
            console.error(`   ❌ Erro em ${dbName}.${tabela}:`, err.message);
          }
        }
      }

      if (totalClinica > 0) {
        console.log(`   📊 Subtotal ${dbName}: ${totalClinica} registro(s)\n`);
        totalGeral += totalClinica;
      }
    }

    // 4. Resumo final
    console.log('='.repeat(70));
    if (totalGeral > 0) {
      console.log(`✅ CONCLUÍDO! Total de registros atualizados: ${totalGeral}`);
      console.log(`   profissionalId: ${ID_ANTIGO} → ${ID_CORRETO}`);
    } else {
      console.log(`ℹ️  Nenhum registro encontrado com profissionalId = ${ID_ANTIGO}`);
      console.log('   Pode ser que já tenha sido corrigido anteriormente.');
    }
    console.log('='.repeat(70));

  } catch (err) {
    console.error('❌ Erro fatal:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

main();