// Script de diagnóstico detalhado para verificar agenda de um profissional específico
// Execute com: node server/diagnostico-agenda-detalhado.js <clinicaId> <profissionalId>

const path = require('path');
const Database = require('better-sqlite3');

const clinicaId = process.argv[2];
const profissionalId = process.argv[3];

if (!clinicaId || !profissionalId) {
  console.log('❌ Uso: node server/diagnostico-agenda-detalhado.js <clinicaId> <profissionalId>');
  console.log('   Exemplo: node server/diagnostico-agenda-detalhado.js c1766863485306 u1766863528581');
  process.exit(1);
}

// Tenta encontrar o banco da clínica na pasta data/
const dataDir = path.join(__dirname, '..', '..', 'data');
let dbPath = path.join(dataDir, `easyclin-clinica-${clinicaId}.db`);

// Se não encontrar pelo nome antigo, tenta por CNPJ
const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  try {
    const Database2 = require('better-sqlite3');
    const globalDb = new Database2(path.join(__dirname, '..', '..', 'data', 'principal.db'));
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

  console.log('='.repeat(60));
  console.log(`🔍 BUSCANDO AGENDA DO PROFISSIONAL: ${profissionalId}`);
  console.log('='.repeat(60));

  // Busca agenda pelo profissionalId
  const agenda = db.prepare('SELECT * FROM agendas WHERE profissionalId = ?').get(profissionalId);

  if (!agenda) {
    console.log(`\n❌ Nenhuma agenda encontrada para profissionalId: ${profissionalId}`);

    // Lista todas as agendas para comparação
    console.log('\n📋 Agendas existentes:');
    const todasAgendas = db.prepare('SELECT id, profissionalId, profissionalNome, ativo FROM agendas').all();
    todasAgendas.forEach((a, i) => {
      console.log(`   ${i + 1}. ${a.profissionalNome} - profissionalId: ${a.profissionalId} - ativo: ${a.ativo}`);
    });

    db.close();
    process.exit(1);
  }

  console.log(`\n✅ Agenda encontrada!`);
  console.log(`   ID: ${agenda.id}`);
  console.log(`   Nome: ${agenda.profissionalNome}`);
  console.log(`   profissionalId: ${agenda.profissionalId}`);
  console.log(`   Especialidade: ${agenda.especialidade}`);
  console.log(`   Ativo: ${agenda.ativo}`);

  // Parse dos horários
  let horarios = [];
  try {
    horarios = JSON.parse(agenda.horarios || '[]');
  } catch (e) {
    console.log(`\n❌ Erro ao parsear horários: ${e.message}`);
    console.log(`   Valor RAW: ${agenda.horarios}`);
  }

  console.log(`\n📅 HORÁRIOS CONFIGURADOS (${horarios.length}):`);
  const diasNomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  horarios.forEach((h, i) => {
    const diaSemanaNum = Number(h.diaSemana);
    const diaNome = diasNomes[diaSemanaNum] || `INVÁLIDO (${h.diaSemana})`;
    console.log(`\n   ${i + 1}. ${diaNome} (diaSemana: ${h.diaSemana}, tipo: ${typeof h.diaSemana})`);
    console.log(`      Horário: ${h.horaInicio} - ${h.horaFim}`);
    console.log(`      Intervalo: ${h.intervaloInicio || 'N/A'} - ${h.intervaloFim || 'N/A'}`);
    console.log(`      Duração consulta: ${h.duracaoConsultaPadrao || 30} min`);
  });

  // Verifica se tem sexta-feira
  const temSexta = horarios.some((h) => Number(h.diaSemana) === 5);
  const temSegunda = horarios.some((h) => Number(h.diaSemana) === 1);

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO');
  console.log('='.repeat(60));
  console.log(`   Dias configurados: ${horarios.map((h) => diasNomes[Number(h.diaSemana)]).join(', ')}`);
  console.log(`   Tem Segunda-feira (1): ${temSegunda ? '✅ SIM' : '❌ NÃO'}`);
  console.log(`   Tem Sexta-feira (5): ${temSexta ? '⚠️ SIM' : '✅ NÃO'}`);

  if (temSexta) {
    console.log('\n⚠️ ATENÇÃO: Esta agenda TEM sexta-feira configurada!');
    console.log('   Se o profissional não trabalha sexta, remova esse horário.');
  }

  db.close();
  console.log('\n✅ Diagnóstico concluído!\n');

} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}