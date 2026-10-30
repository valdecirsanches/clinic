const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Conecta ao banco GLOBAL
const dbPath = path.join(__dirname, 'data', 'principal.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err);
    process.exit(1);
  } else {
    console.log('✅ Conectado ao banco:', dbPath);
  }
});

console.log('\n🔧 Iniciando migração: Adicionar tabela memed_profissionais\n');

// Cria tabela memed_profissionais
db.run(`
  CREATE TABLE IF NOT EXISTS memed_profissionais (
    id TEXT PRIMARY KEY,
    usuarioId TEXT NOT NULL,
    external_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    sobrenome TEXT NOT NULL,
    cpf TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    board_code TEXT NOT NULL,
    board_number TEXT NOT NULL,
    board_state TEXT NOT NULL,
    token TEXT,
    status TEXT DEFAULT 'Em análise',
    criadoEm TEXT NOT NULL,
    atualizadoEm TEXT NOT NULL,
    FOREIGN KEY (usuarioId) REFERENCES usuarios(id)
  )
`, (err) => {
  if (err) {
    console.error('❌ Erro ao criar tabela memed_profissionais:', err);
    process.exit(1);
  }

  console.log('✅ Tabela memed_profissionais criada com sucesso!');

  // Verifica se a tabela foi criada
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='memed_profissionais'", [], (err, rows) => {
    if (err) {
      console.error('❌ Erro ao verificar tabela:', err);
    } else if (rows.length > 0) {
      console.log('✅ Tabela memed_profissionais confirmada no banco de dados!');

      // Mostra estrutura da tabela
      db.all("PRAGMA table_info(memed_profissionais)", [], (err, columns) => {
        if (err) {
          console.error('❌ Erro ao verificar colunas:', err);
        } else {
          console.log('\n📋 Estrutura da tabela memed_profissionais:');
          columns.forEach((col) => {
            console.log(`  - ${col.name} (${col.type})`);
          });
        }

        console.log('\n✅ Migração concluída com sucesso!\n');
        db.close();
      });
    } else {
      console.error('❌ Tabela não foi criada!');
      db.close();
      process.exit(1);
    }
  });
});