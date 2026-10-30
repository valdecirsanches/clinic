const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🔍 DIAGNÓSTICO DE HORÁRIOS\n');
console.log('='.repeat(60));

// Conecta ao banco global para pegar usuários
const dbGlobalPath = path.join(__dirname, '..', '..', 'data', 'principal.db');
const dbGlobal = new sqlite3.Database(dbGlobalPath);

// Busca profissionais
dbGlobal.all('SELECT id, nome, tipo, clinicaId FROM usuarios WHERE tipo IN ("medico", "dentista")', [], (err, usuarios) => {
  if (err) {
    console.error('❌ Erro ao buscar usuários:', err);
    process.exit(1);
  }

  console.log(`\n👥 PROFISSIONAIS CADASTRADOS: ${usuarios.length}`);
  console.log('-'.repeat(60));
  usuarios.forEach((u, i) => {
    console.log(`${i + 1}. ${u.nome}`);
    console.log(`   - ID: ${u.id}`);
    console.log(`   - Tipo: ${u.tipo}`);
    console.log(`   - Clínica: ${u.clinicaId || 'SEM CLÍNICA'}`);
  });

  // Busca todas as clínicas
  dbGlobal.all('SELECT id, nome FROM clinicas', [], (err, clinicas) => {
    if (err) {
      console.error('❌ Erro ao buscar clínicas:', err);
      process.exit(1);
    }

    console.log(`\n\n🏥 CLÍNICAS CADASTRADAS: ${clinicas.length}`);
    console.log('-'.repeat(60));

    let processadas = 0;

    clinicas.forEach((clinica, idx) => {
      console.log(`\n${idx + 1}. ${clinica.nome} (ID: ${clinica.id})`);

      // Tenta encontrar o banco da clínica na pasta data/
      const dataDir = path.join(__dirname, '..', '..', 'data');
      let dbClinicaPath = path.join(dataDir, `easyclin-clinica-${clinica.id}.db`);

      if (!fs.existsSync(dbClinicaPath)) {
        // Tenta por CNPJ
        try {
          const clinicaRow = dbGlobal.prepare ? null : null; // async db, busca manual
        } catch (e) {}
        // Fallback: busca qualquer .db que não seja principal.db
        if (!fs.existsSync(dbClinicaPath)) {
          console.log('   ❌ Banco da clínica NÃO EXISTE na pasta data/');
          processadas++;
          if (processadas === clinicas.length) finalizarDiagnostico();
          return;
        }
      }

      const dbClinica = new sqlite3.Database(dbClinicaPath);

      // Verifica se a tabela agendas existe
      dbClinica.get("SELECT name FROM sqlite_master WHERE type='table' AND name='agendas'", [], (err, table) => {
        if (err || !table) {
          console.log('   ❌ Tabela agendas NÃO EXISTE');
          processadas++;
          if (processadas === clinicas.length) finalizarDiagnostico();
          return;
        }

        // Verifica estrutura da tabela
        dbClinica.all("PRAGMA table_info(agendas)", [], (err, columns) => {
          if (err) {
            console.log('   ❌ Erro ao verificar colunas:', err.message);
            processadas++;
            if (processadas === clinicas.length) finalizarDiagnostico();
            return;
          }

          const hasProfissionalId = columns.some((col) => col.name === 'profissionalId');

          console.log(`   📋 Estrutura da tabela agendas:`);
          console.log(`      - Coluna profissionalId: ${hasProfissionalId ? '✅ EXISTE' : '❌ NÃO EXISTE'}`);

          if (!hasProfissionalId) {
            console.log(`      ⚠️  PROBLEMA: Execute node fix-add-profissional-id.js`);
          }

          // Busca agendas
          dbClinica.all('SELECT * FROM agendas', [], (err, agendas) => {
            if (err) {
              console.log('   ❌ Erro ao buscar agendas:', err.message);
              processadas++;
              if (processadas === clinicas.length) finalizarDiagnostico();
              return;
            }

            console.log(`   📊 Total de agendas: ${agendas.length}`);

            if (agendas.length === 0) {
              console.log('   ⚠️  Nenhuma agenda cadastrada para esta clínica');
              processadas++;
              if (processadas === clinicas.length) finalizarDiagnostico();
              return;
            }

            let agendasProcessadas = 0;

            agendas.forEach((agenda, i) => {
              // Busca horários da agenda
              dbClinica.all('SELECT * FROM horarios_trabalho WHERE agendaId = ?', [agenda.id], (err, horarios) => {
                agendasProcessadas++;

                console.log(`\n   ${i + 1}. ${agenda.profissionalNome}`);
                console.log(`      - ID Agenda: ${agenda.id}`);
                console.log(`      - ID Profissional: ${agenda.profissionalId || '❌ NULL'}`);
                console.log(`      - Especialidade: ${agenda.especialidade}`);
                console.log(`      - Total de horários: ${horarios ? horarios.length : 0}`);

                if (!agenda.profissionalId) {
                  console.log(`      ⚠️  PROBLEMA: profissionalId está NULL!`);
                  console.log(`      Solução: Execute node migrate-add-profissional-id.js`);

                  // Tenta encontrar o usuário correspondente
                  const usuarioMatch = usuarios.find((u) => {
                    const nomeLimpo = agenda.profissionalNome.trim().toLowerCase();
                    const usuarioNomeLimpo = u.nome.trim().toLowerCase();
                    return usuarioNomeLimpo.includes(nomeLimpo) || nomeLimpo.includes(usuarioNomeLimpo);
                  });

                  if (usuarioMatch) {
                    console.log(`      💡 Match encontrado: ${usuarioMatch.nome} (ID: ${usuarioMatch.id})`);
                  } else {
                    console.log(`      ⚠️  Nenhum usuário encontrado para "${agenda.profissionalNome}"`);
                  }
                }

                if (horarios && horarios.length > 0) {
                  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                  horarios.forEach((h) => {
                    console.log(`         - ${dias[h.diaSemana]}: ${h.horaInicio}-${h.horaFim} (${h.duracaoConsultaPadrao}min)`);
                  });
                } else {
                  console.log(`      ⚠️  Nenhum horário cadastrado`);
                }

                if (agendasProcessadas === agendas.length) {
                  dbClinica.close();
                  processadas++;
                  if (processadas === clinicas.length) finalizarDiagnostico();
                }
              });
            });
          });
        });
      });
    });
  });
});

function finalizarDiagnostico() {
  console.log('\n' + '='.repeat(60));
  console.log('✅ DIAGNÓSTICO CONCLUÍDO!');
  console.log('='.repeat(60));

  console.log('\n📋 AÇÕES NECESSÁRIAS:');
  console.log('1. Se viu "❌ NÃO EXISTE" na coluna profissionalId:');
  console.log('   → Execute: node fix-add-profissional-id.js');
  console.log('');
  console.log('2. Se viu "❌ NULL" no ID Profissional:');
  console.log('   → Execute: node migrate-add-profissional-id.js');
  console.log('');
  console.log('3. Cole TODO este output para o assistente\n');

  dbGlobal.close();
  process.exit(0);
}