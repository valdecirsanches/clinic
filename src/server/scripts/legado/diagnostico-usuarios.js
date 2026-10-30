// Script de diagnóstico para verificar usuários no banco de dados global
// Execute com: node server/diagnostico-usuarios.js [busca]

const path = require('path');
const Database = require('better-sqlite3');

const busca = process.argv[2] || '';

const dbPath = path.join(__dirname, '..', '..', 'data', 'principal.db');
console.log(`\n📂 Abrindo banco de dados: ${dbPath}\n`);

try {
  const db = new Database(dbPath);

  console.log('='.repeat(60));
  console.log('👥 USUÁRIOS CADASTRADOS');
  console.log('='.repeat(60));

  let query = 'SELECT * FROM usuarios';
  let params = [];

  if (busca) {
    query += ' WHERE nome LIKE ? OR email LIKE ?';
    params = [`%${busca}%`, `%${busca}%`];
    console.log(`🔍 Buscando por: "${busca}"\n`);
  }

  const usuarios = db.prepare(query).all(...params);

  if (usuarios.length === 0) {
    console.log('⚠️ Nenhum usuário encontrado');
  } else {
    usuarios.forEach((u, index) => {
      console.log(`\n${index + 1}. ${u.nome}`);
      console.log(`   ID: ${u.id}`);
      console.log(`   Email: ${u.email}`);
      console.log(`   Tipo: ${u.tipo}`);
      console.log(`   clinicaId: ${u.clinicaId || 'NÃO DEFINIDO'}`);
      console.log(`   operadoraId: ${u.operadoraId || 'NÃO DEFINIDO'}`);
      console.log(`   Ativo: ${u.ativo ? 'SIM' : 'NÃO'}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO');
  console.log('='.repeat(60));
  console.log(`Total de usuários: ${usuarios.length}`);

  // Conta por tipo
  const tipos = {};
  usuarios.forEach((u) => {
    tipos[u.tipo] = (tipos[u.tipo] || 0) + 1;
  });
  console.log('\n👤 Por tipo:');
  Object.entries(tipos).forEach(([tipo, count]) => {
    console.log(`   ${tipo}: ${count}`);
  });

  db.close();
  console.log('\n✅ Diagnóstico concluído!\n');

} catch (error) {
  console.error('❌ Erro ao acessar banco de dados:', error.message);
  process.exit(1);
}