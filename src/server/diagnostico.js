const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🔍 DIAGNÓSTICO COMPLETO DO SISTEMA\n');
console.log('='.repeat(60));

// 1. Verifica banco global
console.log('\n📊 1. BANCO GLOBAL (data/principal.db)');
console.log('-'.repeat(60));

const dbGlobalPath = path.join(__dirname, 'data', 'principal.db');
if (!fs.existsSync(dbGlobalPath)) {
  console.log('❌ Banco global NÃO EXISTE!');
  process.exit(1);
}

const dbGlobal = new sqlite3.Database(dbGlobalPath);

// Conta medicamentos
dbGlobal.get('SELECT COUNT(*) as total FROM medicamentos', [], (err, row) => {
  if (err) {
    console.log('❌ Erro ao contar medicamentos:', err.message);
  } else {
    console.log(`✅ Total de medicamentos: ${row.total}`);

    if (row.total === 0) {
      console.log('⚠️  NENHUM MEDICAMENTO NO BANCO!');
      console.log('   Execute: cd server && node server.js');
      console.log('   Depois clique em "Importar Base ANVISA"');
    } else if (row.total < 100) {
      console.log(`⚠️  Apenas ${row.total} medicamentos (esperado: 100)`);
    } else {
      console.log('✅ Base completa de medicamentos!');
    }
  }

  // Lista primeiros 5 medicamentos
  dbGlobal.all('SELECT nome, principioAtivo, tarja FROM medicamentos LIMIT 5', [], (err, rows) => {
    if (err) {
      console.log('❌ Erro ao listar medicamentos:', err.message);
    } else {
      console.log('\n📋 Primeiros 5 medicamentos:');
      rows.forEach((med, i) => {
        console.log(`   ${i + 1}. ${med.nome} (${med.principioAtivo}) - ${med.tarja}`);
      });
    }

    verificarUsuarios();
  });
});

function verificarUsuarios() {
  console.log('\n📊 2. USUÁRIOS');
  console.log('-'.repeat(60));

  dbGlobal.all('SELECT id, nome, tipo, clinicaId FROM usuarios WHERE tipo IN ("medico", "dentista")', [], (err, rows) => {
    if (err) {
      console.log('❌ Erro ao buscar usuários:', err.message);
    } else {
      console.log(`✅ Total de profissionais: ${rows.length}`);
      rows.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.nome} (${user.tipo}) - ID: ${user.id} - Clínica: ${user.clinicaId}`);
      });
    }

    verificarClinicas();
  });
}

function verificarClinicas() {
  console.log('\n📊 3. CLÍNICAS');
  console.log('-'.repeat(60));

  dbGlobal.all('SELECT id, nome FROM clinicas', [], (err, rows) => {
    if (err) {
      console.log('❌ Erro ao buscar clínicas:', err.message);
    } else {
      console.log(`✅ Total de clínicas: ${rows.length}`);
      rows.forEach((clinica, i) => {
        console.log(`   ${i + 1}. ${clinica.nome} - ID: ${clinica.id}`);
      });

      if (rows.length > 0) {
        verificarAgendas(rows[0].id);
      } else {
        console.log('\n⚠️  Nenhuma clínica cadastrada!');
        finalizarDiagnostico();
      }
    }
  });
}

function verificarAgendas(clinicaId) {
  console.log(`\n📊 4. AGENDAS DA CLÍNICA ${clinicaId}`);
  console.log('-'.repeat(60));

  // Tenta encontrar o banco da clínica na pasta data/
  const dataDir = path.join(__dirname, 'data');
  let dbClinicaPath = null;

  // Primeiro tenta o formato antigo na pasta data/
  const fallbackPath = path.join(dataDir, `easyclin-clinica-${clinicaId}.db`);
  if (fs.existsSync(fallbackPath)) {
    dbClinicaPath = fallbackPath;
  } else {
    // Busca por CNPJ no banco global
    try {
      const Database = require('better-sqlite3');
      const globalSync = new Database(path.join(__dirname, 'data', 'principal.db'));
      const clinica = globalSync.prepare('SELECT cnpj FROM clinicas WHERE id = ?').get(clinicaId);
      globalSync.close();
      if (clinica && clinica.cnpj) {
        const cnpjLimpo = clinica.cnpj.replace(/\D/g, '');
        const cnpjPath = path.join(dataDir, `${cnpjLimpo}.db`);
        if (fs.existsSync(cnpjPath)) {
          dbClinicaPath = cnpjPath;
        }
      }
    } catch (e) {}
  }

  if (!dbClinicaPath) {
    console.log(`❌ Banco da clínica NÃO EXISTE`);
    finalizarDiagnostico();
    return;
  }

  const dbClinica = new sqlite3.Database(dbClinicaPath);

  dbClinica.all('SELECT id, profissionalId, profissionalNome, especialidade FROM agendas', [], (err, agendas) => {
    if (err) {
      console.log('❌ Erro ao buscar agendas:', err.message);
      finalizarDiagnostico();
      return;
    }

    console.log(`✅ Total de agendas: ${agendas.length}`);

    if (agendas.length === 0) {
      console.log('⚠️  NENHUMA AGENDA CADASTRADA!');
      console.log('   Vá em "Agendas Profissionais" e crie uma agenda');
      finalizarDiagnostico();
      return;
    }

    let processadas = 0;

    agendas.forEach((agenda, i) => {
      dbClinica.all('SELECT * FROM horarios_trabalho WHERE agendaId = ?', [agenda.id], (err, horarios) => {
        processadas++;

        console.log(`\n   ${i + 1}. ${agenda.profissionalNome} (${agenda.especialidade})`);
        console.log(`      - ID Agenda: ${agenda.id}`);
        console.log(`      - ID Profissional: ${agenda.profissionalId || '❌ NULL'}`);
        console.log(`      - Horários: ${horarios ? horarios.length : 0}`);

        if (!agenda.profissionalId) {
          console.log(`      ⚠️  PROBLEMA: profissionalId está NULL!`);
          console.log(`      Solução: Execute a migração`);
          console.log(`      cd server && node migrate-add-profissional-id.js`);
        }

        if (horarios && horarios.length > 0) {
          horarios.forEach((h) => {
            const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            console.log(`         - ${dias[h.diaSemana]}: ${h.horaInicio}-${h.horaFim}`);
          });
        }

        if (processadas === agendas.length) {
          dbClinica.close();
          finalizarDiagnostico();
        }
      });
    });
  });
}

function finalizarDiagnostico() {
  console.log('\n' + '='.repeat(60));
  console.log('✅ DIAGNÓSTICO CONCLUÍDO!');
  console.log('='.repeat(60));

  console.log('\n📋 PRÓXIMOS PASSOS:');
  console.log('1. Cole TODO este output para o assistente');
  console.log('2. Ele vai identificar o problema exato');
  console.log('3. Vai te dar a solução específica\n');

  dbGlobal.close();
  process.exit(0);
}