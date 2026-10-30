
// ==================== FIX: Recuperar registros clínicos órfãos ====================
// PROBLEMA: Por um bug no frontend, quando o prontuário era aberto sem uma consulta
// REAL resolvida, cada categoria clínica era gravada com um consultaId FANTASMA no
// formato `consulta_<timestamp>`. Esses registros existem no banco mas não casam com
// nenhuma consulta real — por isso o prontuário "perdia" os dados.
//
// ESTE SCRIPT: encontra os registros com consultaId fantasma e os reassocia à consulta
// REAL correspondente (mesmo paciente, data próxima e, quando possível, mesmo profissional).
//
// SEGURANÇA:
//   - NÃO apaga NADA. Apenas atualiza o campo consultaId de registros órfãos.
//   - Roda em DRY-RUN por padrão (só mostra o que faria). Use --apply para gravar.
//   - Gera um relatório JSON em server/relatorio-orfaos-<timestamp>.json
//   - Faça backup do banco antes de rodar com --apply.
//
// USO:
//   cd server && node fix-consulta-id-orfaos.js            # dry-run (não altera nada)
//   cd server && node fix-consulta-id-orfaos.js --apply    # aplica as reassociações

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { MYSQL_CONFIG, GLOBAL_DB_NAME, CLINICA_DB_PREFIX } = require('./config/mysql');

const APPLY = process.argv.includes('--apply');

// Tabelas clínicas que possuem coluna consultaId e podem conter órfãos.
// Cobrimos AMBAS as famílias (curta e atendimento_*) para não perder nada.
const TABELAS_CLINICAS = [
'anamneses',
'atendimento_anamneses',
'exames_fisicos',
'atendimento_exames_fisicos',
'diagnosticos',
'atendimento_diagnosticos',
'evolucoes',
'atendimento_evolucoes',
'prescricoes',
'atendimento_prescricoes',
'exames_solicitados',
'atendimento_exames_solicitados',
'relatorios',
'atendimento_relatorios',
'atestados',
'atendimento_atestados'];


// Padrão do consultaId fantasma: começa com "consulta_" seguido só de dígitos (timestamp)
const REGEXP_FANTASMA = '^consulta_[0-9]+$';

function diffDias(dataA, dataB) {
  if (!dataA || !dataB) return Infinity;
  const a = new Date(String(dataA).split('T')[0].split(' ')[0]);
  const b = new Date(String(dataB).split('T')[0].split(' ')[0]);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return Infinity;
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000));
}

async function colunaExiste(connection, dbName, tabela, coluna) {
  const [cols] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, tabela, coluna]
  );
  return cols.length > 0;
}

async function main() {
  console.log('='.repeat(72));
  console.log(`🔧 RECUPERAÇÃO DE REGISTROS ÓRFÃOS (consultaId fantasma)`);
  console.log(`   Modo: ${APPLY ? '⚠️  APPLY (vai gravar alterações)' : '🔍 DRY-RUN (não altera nada)'}`);
  console.log('='.repeat(72));
  console.log();

  const relatorio = {
    modo: APPLY ? 'apply' : 'dry-run',
    geradoEm: new Date().toISOString(),
    orfaosEncontrados: 0,
    orfaosReassociados: 0,
    orfaosSemMatch: 0,
    detalhes: []
  };

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

    // Lista os bancos de clínica
    const [databases] = await connection.query('SHOW DATABASES');
    const clinicaDbs = databases.
    map((db) => db.Database).
    filter((name) => name.startsWith(CLINICA_DB_PREFIX) && name !== GLOBAL_DB_NAME);

    console.log(`📁 ${clinicaDbs.length} banco(s) de clínica encontrado(s)\n`);

    for (const dbName of clinicaDbs) {
      console.log(`\n${'─'.repeat(64)}`);
      console.log(`📋 Processando: ${dbName}`);
      console.log(`${'─'.repeat(64)}`);

      // A tabela consultas precisa existir para conseguirmos reassociar
      const temConsultas = await colunaExiste(connection, dbName, 'consultas', 'id');
      if (!temConsultas) {
        console.log(`   ⚠️ Sem tabela consultas — pulando este banco.`);
        continue;
      }

      // Carrega TODAS as consultas reais deste banco (id, paciente, data, profissional)
      const [consultas] = await connection.query(
        `SELECT id, pacienteId, data, profissionalId FROM \`${dbName}\`.consultas`
      );
      // Indexa consultas por pacienteId para busca rápida
      const consultasPorPaciente = new Map();
      for (const c of consultas) {
        const pid = String(c.pacienteId || '');
        if (!pid) continue;
        if (!consultasPorPaciente.has(pid)) consultasPorPaciente.set(pid, []);
        consultasPorPaciente.get(pid).push(c);
      }

      for (const tabela of TABELAS_CLINICAS) {
        // Verifica se a tabela tem coluna consultaId
        let temColuna;
        try {
          temColuna = await colunaExiste(connection, dbName, tabela, 'consultaId');
        } catch {
          continue;
        }
        if (!temColuna) continue;

        // Busca os órfãos da tabela
        let orfaos = [];
        try {
          const temPaciente = await colunaExiste(connection, dbName, tabela, 'pacienteId');
          const temData = await colunaExiste(connection, dbName, tabela, 'data');
          const campos = ['id', 'consultaId'];
          if (temPaciente) campos.push('pacienteId');
          if (temData) campos.push('data');
          const temProf = await colunaExiste(connection, dbName, tabela, 'profissionalId');
          if (temProf) campos.push('profissionalId');
          [orfaos] = await connection.query(
            `SELECT ${campos.join(', ')} FROM \`${dbName}\`.\`${tabela}\` WHERE consultaId REGEXP ?`,
            [REGEXP_FANTASMA]
          );
        } catch (err) {
          if (err.code !== 'ER_NO_SUCH_TABLE') {
            console.log(`   ⚠️ ${tabela}: ${err.message}`);
          }
          continue;
        }

        if (orfaos.length === 0) continue;
        console.log(`\n   🔎 ${tabela}: ${orfaos.length} órfão(s) encontrado(s)`);

        for (const orfao of orfaos) {
          relatorio.orfaosEncontrados++;
          const pid = String(orfao.pacienteId || '');
          const candidatos = consultasPorPaciente.get(pid) || [];

          if (candidatos.length === 0) {
            relatorio.orfaosSemMatch++;
            relatorio.detalhes.push({
              banco: dbName, tabela, orfaoId: orfao.id, consultaIdFantasma: orfao.consultaId,
              pacienteId: pid, resultado: 'sem-match', motivo: 'nenhuma consulta para o paciente'
            });
            console.log(`      ❌ órfão ${orfao.id} (paciente ${pid}): nenhuma consulta — revisão manual`);
            continue;
          }

          // Escolhe o melhor candidato:
          // 1) mesmo profissionalId (se houver) tem prioridade
          // 2) entre os preferidos, a consulta com data mais próxima da data do órfão
          const profOrfao = String(orfao.profissionalId || '');
          let preferidos = candidatos;
          if (profOrfao) {
            const mesmoProf = candidatos.filter((c) => String(c.profissionalId || '') === profOrfao);
            if (mesmoProf.length > 0) preferidos = mesmoProf;
          }

          let melhor = null;
          let melhorDiff = Infinity;
          for (const c of preferidos) {
            const d = diffDias(c.data, orfao.data);
            if (d < melhorDiff) {
              melhorDiff = d;
              melhor = c;
            }
          }

          // Se só existe UMA consulta para o paciente, aceitamos mesmo sem data próxima.
          // Caso contrário, exigimos tolerância de até 1 dia.
          const aceita = melhor && (candidatos.length === 1 || melhorDiff <= 1);

          if (!aceita) {
            relatorio.orfaosSemMatch++;
            relatorio.detalhes.push({
              banco: dbName, tabela, orfaoId: orfao.id, consultaIdFantasma: orfao.consultaId,
              pacienteId: pid, dataOrfao: orfao.data, resultado: 'sem-match',
              motivo: `nenhuma consulta dentro da tolerância (melhor diff = ${melhorDiff} dia(s))`
            });
            console.log(`      ⚠️ órfão ${orfao.id} (paciente ${pid}): sem consulta próxima (diff ${melhorDiff}d) — revisão manual`);
            continue;
          }

          relatorio.orfaosReassociados++;
          relatorio.detalhes.push({
            banco: dbName, tabela, orfaoId: orfao.id, consultaIdFantasma: orfao.consultaId,
            pacienteId: pid, dataOrfao: orfao.data, consultaRealId: melhor.id,
            dataConsultaReal: melhor.data, diffDias: melhorDiff, resultado: 'reassociado'
          });
          console.log(`      ✅ órfão ${orfao.id} → consulta ${melhor.id} (diff ${melhorDiff}d)`);

          if (APPLY) {
            try {
              await connection.query(
                `UPDATE \`${dbName}\`.\`${tabela}\` SET consultaId = ? WHERE id = ?`,
                [String(melhor.id), orfao.id]
              );
            } catch (err) {
              console.error(`         ❌ Erro ao atualizar: ${err.message}`);
            }
          }
        }
      }
    }

    // Salva relatório
    const nomeRelatorio = `relatorio-orfaos-${Date.now()}.json`;
    const caminho = path.join(__dirname, nomeRelatorio);
    fs.writeFileSync(caminho, JSON.stringify(relatorio, null, 2), 'utf8');

    console.log(`\n${'='.repeat(72)}`);
    console.log(`📊 RESUMO`);
    console.log(`   Órfãos encontrados : ${relatorio.orfaosEncontrados}`);
    console.log(`   Reassociados       : ${relatorio.orfaosReassociados}${APPLY ? '' : ' (apenas simulado)'}`);
    console.log(`   Sem match (manual) : ${relatorio.orfaosSemMatch}`);
    console.log(`   Relatório salvo em : server/${nomeRelatorio}`);
    if (!APPLY && relatorio.orfaosReassociados > 0) {
      console.log(`\n   ➡️  Revise o relatório e rode novamente com --apply para gravar:`);
      console.log(`       node fix-consulta-id-orfaos.js --apply`);
    }
    if (APPLY) {
      console.log(`\n   ✅ Alterações aplicadas. Recarregue o prontuário dos pacientes afetados.`);
    }
    console.log(`${'='.repeat(72)}`);
  } catch (err) {
    console.error('❌ Erro fatal:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

main();