// Script para ativar agenda de um profissional
// Execute com: node server/fix-agenda-ativo.js <clinicaId> <profissionalId>

const path = require('path');
const Database = require('better-sqlite3');

const clinicaId = process.argv[2];
const profissionalId = process.argv[3];

if (!clinicaId || !profissionalId) {
  console.log('❌ Uso: node server/fix-agenda-ativo.js <clinicaId> <profissionalId>');
  console.log('   Exemplo: node server/fix-agenda-ativo.js c17668633485306 u1766863528581');
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

  // Verifica agenda atual
  const agenda = db.prepare('SELECT * FROM agendas WHERE profissionalId = ?').get(profissionalId);

  if (!agenda) {
    console.log(`❌ Nenhuma agenda encontrada para profissionalId: ${profissionalId}`);
    db.close();
    process.exit(1);
  }

  console.log('📋 Agenda encontrada:');
  console.log(`   ID: ${agenda.id}`);
  console.log(`   Nome: ${agenda.profissionalNome}`);
  console.log(`   Ativo ANTES: ${agenda.ativo ? 'SIM' : 'NÃO'}`);

  // Ativa a agenda
  const result = db.prepare('UPDATE agendas SET ativo = 1 WHERE profissionalId = ?').run(profissionalId);

  console.log(`\n✅ Agenda atualizada! (${result.changes} registro(s) alterado(s))`);

  // Verifica novamente
  const agendaAtualizada = db.prepare('SELECT * FROM agendas WHERE profissionalId = ?').get(profissionalId);
  console.log(`   Ativo DEPOIS: ${agendaAtualizada.ativo ? 'SIM' : 'NÃO'}`);

  db.close();
  console.log('\n✅ Concluído!\n');

} catch (error) {
  console.error('❌ Erro:', error.message);
  process.exit(1);
}