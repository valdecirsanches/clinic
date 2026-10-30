// Script para verificar e adicionar colunas de plano de saúde na tabela pacientes
// Execute com: node server/check-plano-saude-columns.js <clinicaId>

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const clinicaId = process.argv[2] || 'c1';

// Tenta encontrar o banco da clínica na pasta data/
const dataDir = path.join(__dirname, 'data');
let dbPath = path.join(dataDir, `easyclin-clinica-${clinicaId}.db`);

// Se não encontrar pelo nome antigo, tenta por CNPJ
const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  try {
    const Database = require('better-sqlite3');
    const globalDb = new Database(path.join(__dirname, 'data', 'principal.db'));
    const clinica = globalDb.prepare('SELECT cnpj FROM clinicas WHERE id = ?').get(clinicaId);
    globalDb.close();
    if (clinica && clinica.cnpj) {
      const cnpjLimpo = clinica.cnpj.replace(/\D/g, '');
      dbPath = path.join(dataDir, `${cnpjLimpo}.db`);
    }
  } catch (e) {}
}

console.log(`\n🔍 Verificando banco da clínica: ${clinicaId}`);
console.log(`📁 Caminho: ${dbPath}\n`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar:', err.message);
    process.exit(1);
  }
  console.log('✅ Conectado ao banco de dados\n');
});

// Verifica colunas da tabela pacientes
db.all("PRAGMA table_info(pacientes)", [], (err, columns) => {
  if (err) {
    console.error('❌ Erro ao verificar colunas:', err);
    db.close();
    return;
  }

  console.log('📋 Colunas da tabela PACIENTES:');
  console.log('─'.repeat(50));

  const columnNames = columns.map((col) => col.name);
  columnNames.forEach((name) => console.log(`   • ${name}`));

  console.log('─'.repeat(50));

  const hasPlanoSaudeId = columnNames.includes('planoSaudeId');
  const hasNumeroCarteirinha = columnNames.includes('numeroCarteirinha');

  console.log(`\n🔍 Verificação de colunas de Plano de Saúde:`);
  console.log(`   • planoSaudeId: ${hasPlanoSaudeId ? '✅ EXISTE' : '❌ NÃO EXISTE'}`);
  console.log(`   • numeroCarteirinha: ${hasNumeroCarteirinha ? '✅ EXISTE' : '❌ NÃO EXISTE'}`);

  let pendingMigrations = 0;

  // Adiciona planoSaudeId se não existir
  if (!hasPlanoSaudeId) {
    pendingMigrations++;
    console.log(`\n🔧 Adicionando coluna 'planoSaudeId'...`);
    db.run(`ALTER TABLE pacientes ADD COLUMN planoSaudeId TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('❌ Erro:', err.message);
      } else {
        console.log(`✅ Coluna 'planoSaudeId' adicionada com sucesso!`);
      }
      pendingMigrations--;
      if (pendingMigrations === 0) checkPlanosSaudeTable();
    });
  }

  // Adiciona numeroCarteirinha se não existir
  if (!hasNumeroCarteirinha) {
    pendingMigrations++;
    console.log(`\n🔧 Adicionando coluna 'numeroCarteirinha'...`);
    db.run(`ALTER TABLE pacientes ADD COLUMN numeroCarteirinha TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column')) {
        console.error('❌ Erro:', err.message);
      } else {
        console.log(`✅ Coluna 'numeroCarteirinha' adicionada com sucesso!`);
      }
      pendingMigrations--;
      if (pendingMigrations === 0) checkPlanosSaudeTable();
    });
  }

  if (pendingMigrations === 0) {
    checkPlanosSaudeTable();
  }
});

function checkPlanosSaudeTable() {
  console.log(`\n\n📋 Verificando tabela PLANOS_SAUDE:`);
  console.log('─'.repeat(50));

  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='planos_saude'", [], (err, tables) => {
    if (err) {
      console.error('❌ Erro:', err);
      db.close();
      return;
    }

    if (tables.length === 0) {
      console.log('❌ Tabela planos_saude NÃO EXISTE');
      console.log('\n🔧 Criando tabela planos_saude...');

      db.run(`
        CREATE TABLE IF NOT EXISTS planos_saude (
          id TEXT PRIMARY KEY,
          nome TEXT NOT NULL,
          registroAns TEXT,
          tipo TEXT DEFAULT 'individual',
          cobertura TEXT,
          telefone TEXT,
          email TEXT,
          site TEXT,
          observacoes TEXT,
          ativo INTEGER DEFAULT 1,
          criadoEm TEXT NOT NULL
        )
      `, (err) => {
        if (err) {
          console.error('❌ Erro ao criar tabela:', err.message);
        } else {
          console.log('✅ Tabela planos_saude criada com sucesso!');
        }
        showSummary();
      });
    } else {
      console.log('✅ Tabela planos_saude EXISTE');

      // Lista planos existentes
      db.all("SELECT id, nome, ativo FROM planos_saude", [], (err, planos) => {
        if (err) {
          console.error('❌ Erro ao listar planos:', err);
        } else if (planos.length === 0) {
          console.log('   (nenhum plano cadastrado)');
        } else {
          console.log(`\n   Planos cadastrados (${planos.length}):`);
          planos.forEach((p) => {
            console.log(`   • ${p.nome} (${p.id}) - ${p.ativo ? 'Ativo' : 'Inativo'}`);
          });
        }
        showSummary();
      });
    }
  });
}

function showSummary() {
  console.log('\n' + '═'.repeat(50));
  console.log('✅ VERIFICAÇÃO CONCLUÍDA!');
  console.log('═'.repeat(50));
  console.log('\nPróximos passos:');
  console.log('1. Reinicie o servidor Node.js');
  console.log('2. Acesse "Planos de Saúde" no menu e cadastre planos');
  console.log('3. Ao editar um paciente, o select de planos aparecerá');
  console.log('═'.repeat(50) + '\n');

  db.close();
}