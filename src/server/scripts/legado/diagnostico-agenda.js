// Script de diagnóstico para verificar horários de trabalho no banco de dados
// Execute com: node server/diagnostico-agenda.js <clinicaId>

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const clinicaId = process.argv[2];

if (!clinicaId) {
  console.log('❌ Uso: node server/diagnostico-agenda.js <clinicaId>');
  console.log('   Exemplo: node server/diagnostico-agenda.js c1');
  process.exit(1);
}

// Tenta encontrar o banco da clínica na pasta data/
const dataDir = path.join(__dirname, '..', '..', 'data');
let dbPath = path.join(dataDir, `easyclin-clinica-${clinicaId}.db`);

// Se não encontrar pelo nome antigo, tenta por CNPJ
if (!fs.existsSync(dbPath)) {
  try {
    const globalDb = new Database(path.join(__dirname, '..', '..', 'data', 'principal.db'));
    const clinica = globalDb.prepare('SELECT cnpj FROM clinicas WHERE id = ?').get(clinicaId);
    globalDb.close();
    if (clinica && clinica.cnpj) {
      const cnpjLimpo = clinica.cnpj.replace(/\D/g, '');
      dbPath = path.join(dataDir, `${cnpjLimpo}.db`);
    }
  } catch (e) {}
}

console.log(`\n📂 Abrindo banco de dados: ${dbPath}\n`);

try {
  const db = new Database(dbPath);

  const diasNomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  // Lista todas as agendas
  console.log('='.repeat(60));
  console.log('📋 AGENDAS CADASTRADAS');
  console.log('='.repeat(60));

  const agendas = db.prepare('SELECT * FROM agendas').all();

  if (agendas.length === 0) {
    console.log('⚠️ Nenhuma agenda encontrada nesta clínica');
  } else {
    agendas.forEach((agenda, index) => {
      console.log(`\n${index + 1}. ${agenda.profissionalNome}`);
      console.log(`   ID da agenda: ${agenda.id}`);
      console.log(`   profissionalId: ${agenda.profissionalId || 'NÃO DEFINIDO'}`);
      console.log(`   Especialidade: ${agenda.especialidade}`);
      console.log(`   Ativo: ${agenda.ativo ? 'SIM' : 'NÃO'}`);

      // Busca horários desta agenda
      const horarios = db.prepare('SELECT * FROM horarios_trabalho WHERE agendaId = ? ORDER BY diaSemana').all(agenda.id);

      console.log(`\n   🕐 Horários configurados (${horarios.length}):`);

      if (horarios.length === 0) {
        console.log('      ⚠️ NENHUM HORÁRIO CONFIGURADO');
      } else {
        horarios.forEach((h) => {
          const diaNome = diasNomes[h.diaSemana] || `Dia ${h.diaSemana}`;
          console.log(`      - ${diaNome} (${h.diaSemana}): ${h.horaInicio} - ${h.horaFim}`);
          if (h.intervaloInicio) {
            console.log(`        Intervalo: ${h.intervaloInicio} - ${h.intervaloFim}`);
          }
          console.log(`        Duração consulta: ${h.duracaoConsultaPadrao} min`);
        });

        // Verifica se tem sexta-feira
        const temSexta = horarios.some((h) => h.diaSemana === 5);
        if (temSexta) {
          console.log('\n      ⚠️ ATENÇÃO: Esta agenda TEM SEXTA-FEIRA (5) configurada!');
        } else {
          console.log('\n      ✅ Esta agenda NÃO tem sexta-feira');
        }

        // Lista dias que NÃO estão configurados
        const diasConfigurados = new Set(horarios.map((h) => h.diaSemana));
        const diasNaoConfigurados = [];
        for (let i = 0; i < 7; i++) {
          if (!diasConfigurados.has(i)) {
            diasNaoConfigurados.push(diasNomes[i]);
          }
        }
        if (diasNaoConfigurados.length > 0) {
          console.log(`      📅 Dias SEM horário: ${diasNaoConfigurados.join(', ')}`);
        }
      }
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO');
  console.log('='.repeat(60));
  console.log(`Total de agendas: ${agendas.length}`);

  const totalHorarios = db.prepare('SELECT COUNT(*) as count FROM horarios_trabalho').get();
  console.log(`Total de horários: ${totalHorarios.count}`);

  // Conta horários por dia da semana
  console.log('\n📅 Horários por dia da semana:');
  for (let i = 0; i < 7; i++) {
    const count = db.prepare('SELECT COUNT(*) as count FROM horarios_trabalho WHERE diaSemana = ?').get(i);
    console.log(`   ${diasNomes[i]}: ${count.count} profissionais`);
  }

  db.close();
  console.log('\n✅ Diagnóstico concluído!\n');

} catch (error) {
  console.error('❌ Erro ao acessar banco de dados:', error.message);
  process.exit(1);
}