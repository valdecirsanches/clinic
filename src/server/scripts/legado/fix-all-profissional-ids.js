
// ==================== FIX: Corrigir TODOS os profissionalId por nome ====================
// Este script compara profissionalNome nas agendas com o nome real na tabela usuarios
// e corrige o profissionalId em TODAS as tabelas relevantes de TODAS as clínicas.
//
// Uso: cd server && node fix-all-profissional-ids.js
//
// IDs corretos confirmados (tabela usuarios):
// 2822 = ERICA C. HARABARA ANTUNES
// 2827 = ANNA CAROLINA INACHVILI
// 2869 = REGINA LÚCIA M L NIQUERITO
// 2898 = TALITA DE MACEDO NUNES
// 2899 = LARISSA CASTILHO MARCELO
// 2903 = CASSIANO RAUL DOROTEU DE ALMEIDA
// 2913 = CINTIA LEPAMARA
// 2914 = GIOVANNA MARQUI
// 2915 = PAULO ABRAÃO SILVA CORDEIRO
// 2919 = MARIA EDUARDA PASQUALINI SCARPA
// 2932 = BEATRIZ COSTA
// 2941 = BRUNO PESSUTI
// 2953 = RODRIGO APARECIDO POSSOMATO
// 2956 = MARCOS MIZAEL DA CRUZ SILVA
// 2961 = KARINA MANZANO MASSA

const mysql = require('mysql2/promise');
const { MYSQL_CONFIG, GLOBAL_DB_NAME, CLINICA_DB_PREFIX } = require('../../config/mysql');

// Tabelas que possuem coluna profissionalId
const TABELAS_COM_PROFISSIONAL_ID = [
'agendas',
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
'agenda_dias_status',
'horarios_trabalho'];


// Normaliza nome para comparação (remove DR/DRA, acentos, espaços extras)
function normalizarNome(nome) {
  if (!nome) return '';
  return nome.
  trim().
  toUpperCase().
  replace(/^(DR[ºª.]?\s*|DRA?\.?\s*)/i, '').
  trim().
  normalize('NFD').
  replace(/[\u0300-\u036f]/g, '') // remove acentos
  .replace(/\s+/g, ' '); // normaliza espaços
}

async function main() {
  console.log('='.repeat(70));
  console.log('🔧 FIX: Corrigir TODOS os profissionalId por nome');
  console.log('='.repeat(70));
  console.log();

  let connection;
  try {
    connection = await mysql.createConnection({
      host: MYSQL_CONFIG.host,
      user: MYSQL_CONFIG.user,
      password: MYSQL_CONFIG.password,
      port: MYSQL_CONFIG.port,
      charset: MYSQL_CONFIG.charset
    });
    console.log('✅ Conectado ao MySQL\n');

    // 1. Busca todos os profissionais do banco global
    const [profissionais] = await connection.query(
      `SELECT id, nome, tipo, clinicaId FROM ${GLOBAL_DB_NAME}.usuarios WHERE tipo IN ('medico', 'dentista') ORDER BY nome`
    );
    console.log(`👨‍⚕️ ${profissionais.length} profissionais encontrados no banco global:\n`);
    profissionais.forEach((p) => {
      console.log(`   ID ${p.id} = ${p.nome} (${p.tipo}, clínica: ${p.clinicaId || 'N/A'})`);
    });
    console.log();

    // 2. Lista todos os bancos de clínica
    const [databases] = await connection.query('SHOW DATABASES');
    const clinicaDbs = databases.
    map((db) => db.Database).
    filter((name) => name.startsWith(CLINICA_DB_PREFIX) && name !== GLOBAL_DB_NAME);

    console.log(`📁 ${clinicaDbs.length} banco(s) de clínica encontrado(s)\n`);

    let totalGeralCorrigidos = 0;

    // 3. Para cada banco de clínica
    for (const dbName of clinicaDbs) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`📋 Processando: ${dbName}`);
      console.log(`${'─'.repeat(60)}`);

      // 3a. Busca agendas para descobrir mapeamento ID_ANTIGO → ID_CORRETO
      let agendas = [];
      try {
        const [tables] = await connection.query(
          `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'agendas'`,
          [dbName]
        );
        if (tables.length > 0) {
          [agendas] = await connection.query(
            `SELECT id, profissionalId, profissionalNome FROM \`${dbName}\`.agendas`
          );
        }
      } catch (err) {
        console.log(`   ⚠️ Erro ao ler agendas: ${err.message}`);
      }

      // 3b. Monta mapeamento de IDs antigos → IDs corretos
      const idMapping = new Map(); // oldId → newId

      for (const agenda of agendas) {
        if (!agenda.profissionalId || !agenda.profissionalNome) continue;

        const profId = String(agenda.profissionalId);

        // Verifica se o ID atual já é correto
        const jaCorreto = profissionais.find((p) => String(p.id) === profId);
        if (jaCorreto) {
          // Verifica se o nome bate
          const nomeAgenda = normalizarNome(agenda.profissionalNome);
          const nomeUsuario = normalizarNome(jaCorreto.nome);
          if (nomeAgenda === nomeUsuario || nomeAgenda.includes(nomeUsuario) || nomeUsuario.includes(nomeAgenda)) {
            console.log(`   ✅ Agenda "${agenda.profissionalNome}" → ID ${profId} já está correto`);
            continue;
          }
          // ID existe mas nome não bate — pode estar apontando para profissional errado
          console.log(`   ⚠️ Agenda "${agenda.profissionalNome}" → ID ${profId} existe mas nome não bate (${jaCorreto.nome})`);
        }

        // Tenta encontrar o profissional correto por nome
        const nomeAgenda = normalizarNome(agenda.profissionalNome);

        // Match exato primeiro
        let profCorreto = profissionais.find((p) => normalizarNome(p.nome) === nomeAgenda);

        // Fallback: match parcial
        if (!profCorreto) {
          profCorreto = profissionais.find((p) => {
            const nomeProf = normalizarNome(p.nome);
            return nomeProf.includes(nomeAgenda) || nomeAgenda.includes(nomeProf);
          });
        }

        if (profCorreto) {
          const newId = String(profCorreto.id);
          if (profId !== newId) {
            console.log(`   🔧 Agenda "${agenda.profissionalNome}": ${profId} → ${newId} (${profCorreto.nome})`);
            idMapping.set(profId, newId);

            // Atualiza a agenda em si
            try {
              await connection.query(
                `UPDATE \`${dbName}\`.agendas SET profissionalId = ? WHERE id = ?`,
                [newId, agenda.id]
              );
              console.log(`      ✅ Agenda atualizada`);
            } catch (err) {
              console.error(`      ❌ Erro ao atualizar agenda: ${err.message}`);
            }
          }
        } else {
          console.log(`   ❌ Agenda "${agenda.profissionalNome}" (ID ${profId}): profissional NÃO encontrado por nome`);
        }
      }

      // 3c. Aplica mapeamento em todas as outras tabelas
      if (idMapping.size === 0) {
        console.log(`   ℹ️ Nenhuma correção necessária neste banco`);
        continue;
      }

      console.log(`\n   📊 Aplicando ${idMapping.size} correção(ões) nas demais tabelas...`);

      for (const [oldId, newId] of idMapping) {
        let totalTabela = 0;

        for (const tabela of TABELAS_COM_PROFISSIONAL_ID) {
          if (tabela === 'agendas') continue; // já corrigido acima

          try {
            // Verifica se tabela e coluna existem
            const [columns] = await connection.query(
              `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'profissionalId'`,
              [dbName, tabela]
            );
            if (columns.length === 0) continue;

            // Conta registros
            const [countResult] = await connection.query(
              `SELECT COUNT(*) as total FROM \`${dbName}\`.\`${tabela}\` WHERE profissionalId = ?`,
              [oldId]
            );
            const count = countResult[0].total;
            if (count === 0) continue;

            // Atualiza
            const [updateResult] = await connection.query(
              `UPDATE \`${dbName}\`.\`${tabela}\` SET profissionalId = ? WHERE profissionalId = ?`,
              [newId, oldId]
            );

            console.log(`      ✅ ${tabela}: ${updateResult.affectedRows} registro(s) (${oldId} → ${newId})`);
            totalTabela += updateResult.affectedRows;
          } catch (err) {
            if (err.code !== 'ER_NO_SUCH_TABLE' && err.code !== 'ER_BAD_FIELD_ERROR') {
              console.error(`      ❌ ${tabela}: ${err.message}`);
            }
          }
        }

        totalGeralCorrigidos += totalTabela;
      }
    }

    // 4. Resumo
    console.log(`\n${'='.repeat(70)}`);
    if (totalGeralCorrigidos > 0) {
      console.log(`✅ CONCLUÍDO! ${totalGeralCorrigidos} registro(s) corrigido(s) no total.`);
    } else {
      console.log(`ℹ️ Nenhum registro precisou ser corrigido (além das agendas).`);
    }
    console.log(`\n⚠️ IMPORTANTE: Reinicie o servidor para limpar o cache do AUTO-REPAIR.`);
    console.log(`${'='.repeat(70)}`);

  } catch (err) {
    console.error('❌ Erro fatal:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

main();