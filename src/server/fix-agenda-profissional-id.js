// ==================== FIX: Corrigir profissionalId nas agendas ====================
// Corrige agendas onde o profissionalId está errado, nulo ou aponta para usuário diferente

const sqlite3 = require('sqlite3').verbose();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const SERVER_DIR = __dirname;
const globalDbPath = path.join(SERVER_DIR, 'data', 'principal.db');

console.log('🔧 FIX: Corrigir profissionalId nas agendas\n');

if (!fs.existsSync(globalDbPath)) {
  console.error('❌ Banco global não encontrado:', globalDbPath);
  process.exit(1);
}

// Banco global usa better-sqlite3
const globalDb = new Database(globalDbPath);

// Busca todos os profissionais
const profissionais = globalDb.prepare(
  "SELECT id, nome, clinicaId, tipo FROM usuarios WHERE tipo IN ('medico', 'dentista') ORDER BY nome"
).all();

console.log('👨‍⚕️ Profissionais cadastrados:\n');
profissionais.forEach((p, i) => {
  console.log(`   ${i + 1}. ${p.nome} (ID: ${p.id}, Clínica: ${p.clinicaId || 'N/A'}, Tipo: ${p.tipo})`);
});

// Busca todos os bancos de clínicas na pasta data/
const dataDir = path.join(SERVER_DIR, 'data');
const clinicaFiles = fs.existsSync(dataDir) ?
fs.readdirSync(dataDir).filter((f) => f.endsWith('.db') && f !== 'principal.db') :
[];

console.log(`\n📁 Bancos de clínicas encontrados: ${clinicaFiles.length}\n`);

// Diagnóstico: lista todas as agendas e seus profissionalId
console.log('📋 DIAGNÓSTICO - Agendas encontradas:\n');

const todasAgendas = [];

clinicaFiles.forEach((file) => {
  const clinicaId = file.replace('easyclin-clinica-', '').replace('.db', '');
  const dbPath = path.join(dataDir, file);
  const db = new sqlite3.Database(dbPath);

  // Usa all síncrono via callback mas aguarda com flag
  db.all('SELECT id, profissionalId, profissionalNome, especialidade FROM agendas', [], (err, agendas) => {
    if (err) {
      console.error(`   ❌ Erro ao ler agendas de ${clinicaId}:`, err.message);
      db.close();
      return;
    }

    agendas.forEach((agenda) => {
      // Verifica se o profissionalId bate com algum usuário
      const usuarioCorreto = profissionais.find((p) => p.id === agenda.profissionalId);
      const status = usuarioCorreto ?
      `✅ OK → ${usuarioCorreto.nome}` :
      `❌ PROBLEMA - ID "${agenda.profissionalId || 'NULL'}" não encontrado`;

      console.log(`   Clínica ${clinicaId} | Agenda: "${agenda.profissionalNome}" | profissionalId: ${agenda.profissionalId || 'NULL'}`);
      console.log(`      Status: ${status}\n`);

      todasAgendas.push({ ...agenda, clinicaId, dbPath, status: usuarioCorreto ? 'ok' : 'problema' });
    });

    db.close();

    // Após processar todos os arquivos, inicia o processo interativo
    if (todasAgendas.length > 0 && clinicaFiles.indexOf(file) === clinicaFiles.length - 1) {
      setTimeout(() => iniciarCorrecao(), 500);
    }
  });
});

function iniciarCorrecao() {
  const agendasComProblema = todasAgendas.filter((a) => a.status === 'problema');

  if (agendasComProblema.length === 0) {
    console.log('✅ Nenhuma agenda com problema encontrada! Todos os profissionalId estão corretos.\n');
    globalDb.close();
    process.exit(0);
  }

  console.log(`\n⚠️  ${agendasComProblema.length} agenda(s) com problema encontrada(s).\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let index = 0;

  function processarProxima() {
    if (index >= agendasComProblema.length) {
      console.log('\n✅ Todas as correções foram aplicadas!');
      console.log('   Reinicie o servidor para aplicar as alterações.\n');
      rl.close();
      globalDb.close();
      process.exit(0);
    }

    const agenda = agendasComProblema[index];
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Agenda com problema:`);
    console.log(`   Nome salvo: "${agenda.profissionalNome}"`);
    console.log(`   profissionalId atual: "${agenda.profissionalId || 'NULL'}"`);
    console.log(`   Clínica: ${agenda.clinicaId}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    console.log('👨‍⚕️ Qual profissional é o correto para esta agenda?\n');
    profissionais.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.nome} (ID: ${p.id})`);
    });
    console.log(`   0. Pular esta agenda\n`);

    rl.question('Digite o número do profissional correto: ', (answer) => {
      const escolha = parseInt(answer);

      if (escolha === 0) {
        console.log('⏭️  Agenda pulada.');
        index++;
        processarProxima();
        return;
      }

      if (isNaN(escolha) || escolha < 1 || escolha > profissionais.length) {
        console.log('❌ Número inválido. Tente novamente.');
        processarProxima();
        return;
      }

      const profissionalCorreto = profissionais[escolha - 1];

      rl.question(
        `\n⚠️  Confirma: agenda "${agenda.profissionalNome}" → profissionalId = "${profissionalCorreto.id}" (${profissionalCorreto.nome})? (s/n): `,
        (confirm) => {
          if (confirm.toLowerCase() !== 's') {
            console.log('❌ Cancelado. Pulando...');
            index++;
            processarProxima();
            return;
          }

          // Aplica a correção
          const db = new sqlite3.Database(agenda.dbPath);
          db.run(
            'UPDATE agendas SET profissionalId = ?, profissionalNome = ? WHERE id = ?',
            [profissionalCorreto.id, profissionalCorreto.nome, agenda.id],
            function (err) {
              if (err) {
                console.error(`❌ Erro ao atualizar agenda:`, err.message);
              } else {
                console.log(`✅ Agenda corrigida! profissionalId = "${profissionalCorreto.id}" (${profissionalCorreto.nome})`);
              }
              db.close();
              index++;
              processarProxima();
            }
          );
        }
      );
    });
  }

  processarProxima();
}