const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Caminho do banco de dados global
const dbPath = path.join(__dirname, 'data', 'principal.db');

console.log('🔍 Testando colunas crm e uf no banco...');
console.log('📂 Banco de dados:', dbPath);

// Conecta ao banco
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err);
    process.exit(1);
  }
  console.log('✅ Conectado ao banco de dados');
});

// Verifica estrutura da tabela usuarios
db.all("PRAGMA table_info(usuarios)", [], (err, columns) => {
  if (err) {
    console.error('❌ Erro ao verificar colunas:', err);
    db.close();
    process.exit(1);
  }

  console.log('\n📋 ESTRUTURA DA TABELA usuarios:');
  console.log('=====================================');
  columns.forEach((col) => {
    console.log(`  - ${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
  });

  const hasCrm = columns.some((col) => col.name === 'crm');
  const hasUf = columns.some((col) => col.name === 'uf');

  console.log('\n🔍 VERIFICAÇÃO:');
  console.log(`  crm: ${hasCrm ? '✅ EXISTE' : '❌ NÃO EXISTE'}`);
  console.log(`  uf: ${hasUf ? '✅ EXISTE' : '❌ NÃO EXISTE'}`);

  if (!hasCrm || !hasUf) {
    console.log('\n⚠️  PROBLEMA ENCONTRADO!');
    console.log('As colunas crm e/ou uf NÃO existem no banco de produção!');
    console.log('Execute o script de migração:');
    console.log('  node migrate-add-crm-uf.js');
  }

  // Busca um usuário para testar
  db.get("SELECT * FROM usuarios WHERE tipo IN ('medico', 'dentista') LIMIT 1", [], (err, row) => {
    if (err) {
      console.error('❌ Erro ao buscar usuário:', err);
    } else if (row) {
      console.log('\n📊 EXEMPLO DE USUÁRIO:');
      console.log('=====================================');
      console.log(`  ID: ${row.id}`);
      console.log(`  Nome: ${row.nome}`);
      console.log(`  Tipo: ${row.tipo}`);
      console.log(`  CRM: ${row.crm || 'NULL'}`);
      console.log(`  UF: ${row.uf || 'NULL'}`);
    }

    db.close();
    console.log('\n✅ Teste concluído!');
  });
});