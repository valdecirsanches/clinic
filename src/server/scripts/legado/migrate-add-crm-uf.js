const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Caminho do banco de dados global
const dbPath = path.join(__dirname, '..', '..', 'data', 'principal.db');

console.log('🔧 Iniciando migração: adicionando colunas crm e uf...');
console.log('📂 Banco de dados:', dbPath);

// Conecta ao banco
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err);
    process.exit(1);
  }
  console.log('✅ Conectado ao banco de dados');
});

// Verifica se as colunas já existem
db.all("PRAGMA table_info(usuarios)", [], (err, columns) => {
  if (err) {
    console.error('❌ Erro ao verificar colunas:', err);
    db.close();
    process.exit(1);
  }

  const hasCrm = columns.some((col) => col.name === 'crm');
  const hasUf = columns.some((col) => col.name === 'uf');

  console.log('🔍 Verificando colunas existentes...');
  console.log('   - crm:', hasCrm ? '✅ existe' : '❌ não existe');
  console.log('   - uf:', hasUf ? '✅ existe' : '❌ não existe');

  if (hasCrm && hasUf) {
    console.log('✅ Colunas crm e uf já existem!');
    console.log('✅ Migração não necessária');
    db.close();
    process.exit(0);
  }

  // Adiciona as colunas
  const migrations = [];

  if (!hasCrm) {
    migrations.push(new Promise((resolve, reject) => {
      console.log('➕ Adicionando coluna crm...');
      db.run(`ALTER TABLE usuarios ADD COLUMN crm TEXT`, (err) => {
        if (err) {
          console.error('❌ Erro ao adicionar coluna crm:', err);
          reject(err);
        } else {
          console.log('✅ Coluna crm adicionada');
          resolve();
        }
      });
    }));
  }

  if (!hasUf) {
    migrations.push(new Promise((resolve, reject) => {
      console.log('➕ Adicionando coluna uf...');
      db.run(`ALTER TABLE usuarios ADD COLUMN uf TEXT`, (err) => {
        if (err) {
          console.error('❌ Erro ao adicionar coluna uf:', err);
          reject(err);
        } else {
          console.log('✅ Coluna uf adicionada');
          resolve();
        }
      });
    }));
  }

  Promise.all(migrations).
  then(() => {
    console.log('');
    console.log('🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('✅ Colunas crm e uf adicionadas à tabela usuarios');
    console.log('');
    console.log('📋 Próximos passos:');
    console.log('   1. Reinicie o servidor Node.js');
    console.log('   2. Recarregue a página do sistema');
    console.log('   3. Edite um usuário médico/dentista');
    console.log('   4. Preencha CRM e UF');
    console.log('');
    db.close();
    process.exit(0);
  }).
  catch((err) => {
    console.error('❌ Erro na migração:', err);
    db.close();
    process.exit(1);
  });
});