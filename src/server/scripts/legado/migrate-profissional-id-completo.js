// ==================== MIGRAÇÃO COMPLETA: profissionalId em prontuarios e atendimentos ====================
// Este script:
// 1. Adiciona coluna profissionalId em prontuarios (se não existir)
// 2. Adiciona coluna profissionalId em atendimentos (se não existir)
// 3. Popula os registros com base no nome do profissional

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const SERVER_DIR = path.join(__dirname, '..', '..');
const globalDbPath = path.join(SERVER_DIR, 'data', 'principal.db');

console.log('🔄 MIGRAÇÃO COMPLETA: profissionalId em prontuarios e atendimentos\n');

// Verifica banco global
if (!fs.existsSync(globalDbPath)) {
  console.error('❌ Banco global não encontrado:', globalDbPath);
  process.exit(1);
}

const globalDb = new sqlite3.Database(globalDbPath);

// Carrega profissionais do banco global
globalDb.all("SELECT id, nome, clinicaId FROM usuarios WHERE tipo IN ('medico', 'dentista')", [], (err, todosProfissionais) => {
  if (err) {
    console.error('❌ Erro ao buscar profissionais:', err.message);
    globalDb.close();
    process.exit(1);
  }

  todosProfissionais = todosProfissionais || [];
  console.log(`👨‍⚕️ Profissionais encontrados: ${todosProfissionais.length}`);
  todosProfissionais.forEach((p) => console.log(`   - ${p.nome} (ID: ${p.id})`));

  // Lista bancos de clínicas na pasta data/
  const dataDir = path.join(SERVER_DIR, 'data');
  const files = fs.existsSync(dataDir) ?
  fs.readdirSync(dataDir).filter((f) => f.endsWith('.db') && f !== 'principal.db') :
  [];
  console.log(`\n📁 Bancos de clínicas: ${files.length}\n`);

  let processados = 0;

  files.forEach((file) => {
    const dbPath = path.join(dataDir, file);
    const db = new sqlite3.Database(dbPath);
    const clinicaId = file.replace('easyclin-clinica-', '').replace('.db', '');

    console.log(`\n📋 Clínica: ${clinicaId}`);

    // Função para adicionar coluna se não existir
    const adicionarColuna = (tabela, callback) => {
      db.all(`PRAGMA table_info(${tabela})`, [], (err, columns) => {
        if (err || !columns || columns.length === 0) {
          console.log(`   ⚠️ Tabela ${tabela} não existe`);
          callback();
          return;
        }

        const temColuna = columns.some((c) => c.name === 'profissionalId');
        if (temColuna) {
          console.log(`   ✅ ${tabela}.profissionalId já existe`);
          callback();
        } else {
          console.log(`   ➕ Adicionando ${tabela}.profissionalId...`);
          db.run(`ALTER TABLE ${tabela} ADD COLUMN profissionalId TEXT`, (err) => {
            if (err) {
              console.log(`   ❌ Erro ao adicionar coluna em ${tabela}:`, err.message);
            } else {
              console.log(`   ✅ Coluna adicionada em ${tabela}`);
            }
            callback();
          });
        }
      });
    };

    // Função para popular profissionalId
    const popularProfissionalId = (tabela, callback) => {
      db.all(`SELECT id, profissional FROM ${tabela} WHERE profissionalId IS NULL OR profissionalId = ''`, [], (err, registros) => {
        if (err) {
          console.log(`   ⚠️ Erro ao buscar ${tabela}:`, err.message);
          callback();
          return;
        }

        registros = registros || [];
        if (registros.length === 0) {
          console.log(`   ✅ ${tabela}: todos já têm profissionalId`);
          callback();
          return;
        }

        console.log(`   📝 ${tabela}: ${registros.length} registros para atualizar`);

        let atualizados = 0;
        let pendentes = registros.length;

        registros.forEach((reg) => {
          if (!reg.profissional) {
            pendentes--;
            if (pendentes === 0) callback();
            return;
          }

          const nome = reg.profissional.toLowerCase().trim();
          let prof = todosProfissionais.find((p) => p.nome.toLowerCase().trim() === nome);
          if (!prof) {
            prof = todosProfissionais.find((p) =>
            p.nome.toLowerCase().includes(nome) || nome.includes(p.nome.toLowerCase())
            );
          }

          if (prof) {
            db.run(`UPDATE ${tabela} SET profissionalId = ? WHERE id = ?`, [prof.id, reg.id], (err) => {
              if (!err) atualizados++;
              pendentes--;
              if (pendentes === 0) {
                console.log(`   ✅ ${tabela}: ${atualizados} atualizados`);
                callback();
              }
            });
          } else {
            console.log(`      ⚠️ Não encontrado: "${reg.profissional}"`);
            pendentes--;
            if (pendentes === 0) {
              console.log(`   ✅ ${tabela}: ${atualizados} atualizados`);
              callback();
            }
          }
        });
      });
    };

    // Executa migração: prontuarios -> atendimentos
    adicionarColuna('prontuarios', () => {
      adicionarColuna('atendimentos', () => {
        popularProfissionalId('prontuarios', () => {
          popularProfissionalId('atendimentos', () => {
            db.close();
            processados++;
            if (processados === files.length) {
              console.log('\n✅ MIGRAÇÃO COMPLETA!');
              console.log('   Reinicie o servidor.\n');
              globalDb.close();
            }
          });
        });
      });
    });
  });
});