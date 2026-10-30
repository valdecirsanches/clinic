const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data', 'principal.db');

console.log('🧪 Testando UPDATE de CRM e UF...\n');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar:', err);
    process.exit(1);
  }
});

// Busca um usuário médico/dentista
db.get("SELECT * FROM usuarios WHERE tipo IN ('medico', 'dentista') LIMIT 1", [], (err, usuario) => {
  if (err || !usuario) {
    console.error('❌ Erro ao buscar usuário:', err);
    db.close();
    process.exit(1);
  }

  console.log('📋 ANTES DO UPDATE:');
  console.log(`  ID: ${usuario.id}`);
  console.log(`  Nome: ${usuario.nome}`);
  console.log(`  CRM: ${usuario.crm || 'NULL'}`);
  console.log(`  UF: ${usuario.uf || 'NULL'}\n`);

  // Tenta fazer UPDATE
  const testCrm = '999999';
  const testUf = 'TEST';

  console.log(`🔄 Executando UPDATE...`);
  console.log(`  SET crm = '${testCrm}', uf = '${testUf}'`);
  console.log(`  WHERE id = '${usuario.id}'\n`);

  db.run(
    `UPDATE usuarios SET crm = ?, uf = ? WHERE id = ?`,
    [testCrm, testUf, usuario.id],
    function (err) {
      if (err) {
        console.error('❌ ERRO NO UPDATE:', err);
        db.close();
        process.exit(1);
      }

      console.log(`✅ UPDATE executado! Linhas afetadas: ${this.changes}\n`);

      // Busca novamente para verificar
      db.get("SELECT * FROM usuarios WHERE id = ?", [usuario.id], (err, updated) => {
        if (err) {
          console.error('❌ Erro ao verificar:', err);
          db.close();
          process.exit(1);
        }

        console.log('📋 DEPOIS DO UPDATE:');
        console.log(`  ID: ${updated.id}`);
        console.log(`  Nome: ${updated.nome}`);
        console.log(`  CRM: ${updated.crm || 'NULL'}`);
        console.log(`  UF: ${updated.uf || 'NULL'}\n`);

        if (updated.crm === testCrm && updated.uf === testUf) {
          console.log('✅ SUCESSO! O UPDATE FUNCIONOU!\n');
          console.log('🔍 CONCLUSÃO:');
          console.log('  O banco está OK. O problema deve estar no código do servidor.');
          console.log('  Verifique os logs do servidor quando fizer o UPDATE via API.\n');
        } else {
          console.log('❌ FALHA! O UPDATE NÃO SALVOU!\n');
          console.log('🔍 CONCLUSÃO:');
          console.log('  Há um problema com o banco de dados ou permissões.');
        }

        db.close();
      });
    }
  );
});