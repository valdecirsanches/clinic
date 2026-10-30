// Script de migração para adicionar coluna permissoesMenu na tabela usuarios
// Execute com: node server/migrate-add-permissoes-menu.js

const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'data', 'principal.db');
console.log(`\n📂 Abrindo banco de dados: ${dbPath}\n`);

try {
  const db = new Database(dbPath);

  console.log('='.repeat(60));
  console.log('🔄 MIGRAÇÃO: Adicionando coluna permissoesMenu');
  console.log('='.repeat(60));

  // Verifica se a coluna já existe
  const tableInfo = db.prepare("PRAGMA table_info(usuarios)").all();
  const colunaExiste = tableInfo.some((col) => col.name === 'permissoesMenu');

  if (colunaExiste) {
    console.log('\n✅ Coluna permissoesMenu já existe na tabela usuarios');
  } else {
    console.log('\n📝 Adicionando coluna permissoesMenu...');

    db.exec(`
      ALTER TABLE usuarios ADD COLUMN permissoesMenu TEXT DEFAULT NULL
    `);

    console.log('✅ Coluna permissoesMenu adicionada com sucesso!');
  }

  // Lista usuários para verificar
  const usuarios = db.prepare('SELECT id, nome, tipo, permissoesMenu FROM usuarios LIMIT 5').all();
  console.log('\n📋 Primeiros 5 usuários:');
  usuarios.forEach((u, i) => {
    console.log(`   ${i + 1}. ${u.nome} (${u.tipo}) - permissoesMenu: ${u.permissoesMenu || 'NULL (usando padrão)'}`);
  });

  db.close();
  console.log('\n✅ Migração concluída!\n');

} catch (error) {
  console.error('❌ Erro na migração:', error.message);
  process.exit(1);
}