const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🔧 CORREÇÃO: Adicionando coluna profissionalId\n');
console.log('='.repeat(60));

// Busca todos os bancos de clínica na pasta data/
const dataDir = path.join(__dirname, 'data');
const files = fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : [];
const clinicaDbs = files.filter((f) => f.endsWith('.db') && f !== 'principal.db');

console.log(`📊 Encontrados ${clinicaDbs.length} bancos de clínica\n`);

let processados = 0;

clinicaDbs.forEach((dbFile) => {
  const clinicaId = dbFile.replace('easyclin-clinica-', '').replace('.db', '');
  const dbPath = path.join(dataDir, dbFile);
  const db = new sqlite3.Database(dbPath);

  console.log(`\n🏥 Processando clínica: ${clinicaId}`);

  // Verifica se a coluna já existe
  db.all("PRAGMA table_info(agendas)", [], (err, columns) => {
    if (err) {
      console.error(`❌ Erro ao verificar colunas:`, err);
      processados++;
      checkFinish();
      return;
    }

    const hasProfissionalId = columns.some((col) => col.name === 'profissionalId');

    if (hasProfissionalId) {
      console.log(`   ✅ Coluna profissionalId já existe`);
      processados++;
      checkFinish();
      return;
    }

    // Adiciona a coluna
    console.log(`   🔧 Adicionando coluna profissionalId...`);
    db.run(`ALTER TABLE agendas ADD COLUMN profissionalId TEXT`, (err) => {
      if (err) {
        console.error(`   ❌ Erro ao adicionar coluna:`, err.message);
      } else {
        console.log(`   ✅ Coluna profissionalId adicionada com sucesso!`);
      }

      db.close();
      processados++;
      checkFinish();
    });
  });
});

function checkFinish() {
  if (processados === clinicaDbs.length) {
    console.log('\n' + '='.repeat(60));
    console.log('✅ CORREÇÃO CONCLUÍDA!');
    console.log('='.repeat(60));
    console.log('\n📋 PRÓXIMOS PASSOS:');
    console.log('1. Reinicie o servidor: node server.js');
    console.log('2. Execute a migração: node migrate-add-profissional-id.js');
    console.log('3. Teste os horários no sistema\n');
    process.exit(0);
  }
}