// ==================== MIGRAÇÃO: Adicionar profissionalId na tabela atendimentos ====================
// Este script adiciona a coluna profissionalId na tabela atendimentos
// e tenta popular com base no nome do profissional (buscando no banco GLOBAL)

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Os bancos ficam no mesmo diretório do servidor
const SERVER_DIR = path.join(__dirname, '..', '..');

// Banco GLOBAL (onde estão os usuários)
const globalDbPath = path.join(SERVER_DIR, 'data', 'principal.db');

console.log('🔄 Iniciando migração: Adicionar profissionalId em atendimentos...\n');
console.log('📁 Diretório do servidor:', SERVER_DIR);
console.log('📁 Banco global:', globalDbPath);

// Verifica se o banco global existe
if (!fs.existsSync(globalDbPath)) {
  console.error('❌ Banco global não encontrado:', globalDbPath);
  process.exit(1);
}

// Conecta ao banco global para buscar profissionais
const globalDb = new sqlite3.Database(globalDbPath);

// Carrega todos os profissionais do banco global
globalDb.all("SELECT id, nome, clinicaId FROM usuarios WHERE tipo IN ('medico', 'dentista')", [], (err, todosProfissionais) => {
  if (err) {
    console.error('❌ Erro ao buscar profissionais do banco global:', err.message);
    globalDb.close();
    process.exit(1);
  }

  if (!todosProfissionais) todosProfissionais = [];

  console.log(`\n👨‍⚕️ Total de profissionais no banco global: ${todosProfissionais.length}`);
  todosProfissionais.forEach((p) => {
    console.log(`   - ${p.nome} (ID: ${p.id}, Clínica: ${p.clinicaId || 'N/A'})`);
  });

  // Lista todos os bancos de clínicas na pasta data/
  const dataDir = path.join(SERVER_DIR, 'data');
  const files = fs.existsSync(dataDir) ?
  fs.readdirSync(dataDir).filter((f) => f.endsWith('.db') && f !== 'principal.db') :
  [];

  console.log(`\n📁 Encontrados ${files.length} bancos de clínicas\n`);

  if (files.length === 0) {
    console.log('⚠️ Nenhum banco de clínica encontrado.');
    globalDb.close();
    process.exit(0);
  }

  let processados = 0;

  files.forEach((file) => {
    const dbPath = path.join(dataDir, file);
    const db = new sqlite3.Database(dbPath);
    const clinicaId = file.replace('easyclin-clinica-', '').replace('.db', '');

    console.log(`\n📋 Processando clínica: ${clinicaId} (${file})`);

    // Filtra profissionais desta clínica
    const profissionaisClinica = todosProfissionais.filter((p) => p.clinicaId === clinicaId);
    console.log(`   👨‍⚕️ Profissionais desta clínica: ${profissionaisClinica.length}`);

    // Verifica se a coluna já existe
    db.all("PRAGMA table_info(atendimentos)", [], (err, columns) => {
      if (err) {
        console.error(`   ❌ Erro ao verificar tabela atendimentos:`, err.message);
        db.close();
        processados++;
        verificarConclusao();
        return;
      }

      if (!columns || columns.length === 0) {
        console.log(`   ⚠️ Tabela atendimentos não existe ou está vazia`);
        db.close();
        processados++;
        verificarConclusao();
        return;
      }

      const temProfissionalId = columns.some((col) => col.name === 'profissionalId');

      if (temProfissionalId) {
        console.log(`   ✅ Coluna profissionalId já existe`);
        popularProfissionalId(db, clinicaId, profissionaisClinica, todosProfissionais);
      } else {
        console.log(`   ➕ Adicionando coluna profissionalId...`);

        db.run("ALTER TABLE atendimentos ADD COLUMN profissionalId TEXT", [], (err) => {
          if (err) {
            console.error(`   ❌ Erro ao adicionar coluna:`, err.message);
            db.close();
            processados++;
            verificarConclusao();
            return;
          }

          console.log(`   ✅ Coluna adicionada com sucesso`);
          popularProfissionalId(db, clinicaId, profissionaisClinica, todosProfissionais);
        });
      }
    });

    function popularProfissionalId(db, clinicaId, profissionaisClinica, todosProfissionais) {
      // Busca atendimentos sem profissionalId
      db.all("SELECT id, profissional FROM atendimentos WHERE profissionalId IS NULL OR profissionalId = ''", [], (err, atendimentos) => {
        if (err) {
          console.error(`   ❌ Erro ao buscar atendimentos:`, err.message);
          db.close();
          processados++;
          verificarConclusao();
          return;
        }

        if (!atendimentos) atendimentos = [];

        console.log(`   📝 Atendimentos sem profissionalId: ${atendimentos.length}`);

        if (atendimentos.length === 0) {
          console.log(`   ✅ Todos os atendimentos já têm profissionalId`);
          db.close();
          processados++;
          verificarConclusao();
          return;
        }

        let atualizados = 0;
        let naoEncontrados = 0;
        let processadosAtend = 0;

        atendimentos.forEach((atend) => {
          if (!atend.profissional) {
            naoEncontrados++;
            processadosAtend++;
            if (processadosAtend === atendimentos.length) {
              finalizarClinica();
            }
            return;
          }

          // Tenta encontrar o profissional pelo nome
          const profissionalNome = atend.profissional.toLowerCase().trim();

          // 1. Primeiro busca nos profissionais desta clínica (busca exata)
          let prof = profissionaisClinica.find((p) => p.nome.toLowerCase().trim() === profissionalNome);

          // 2. Busca parcial nos profissionais desta clínica
          if (!prof) {
            prof = profissionaisClinica.find((p) =>
            p.nome.toLowerCase().includes(profissionalNome) ||
            profissionalNome.includes(p.nome.toLowerCase())
            );
          }

          // 3. Se não encontrou, busca em TODOS os profissionais (busca exata)
          if (!prof) {
            prof = todosProfissionais.find((p) => p.nome.toLowerCase().trim() === profissionalNome);
          }

          // 4. Busca parcial em todos os profissionais
          if (!prof) {
            prof = todosProfissionais.find((p) =>
            p.nome.toLowerCase().includes(profissionalNome) ||
            profissionalNome.includes(p.nome.toLowerCase())
            );
          }

          if (prof) {
            db.run("UPDATE atendimentos SET profissionalId = ? WHERE id = ?", [prof.id, atend.id], (err) => {
              if (err) {
                console.error(`      ❌ Erro ao atualizar atendimento ${atend.id}:`, err.message);
              } else {
                atualizados++;
                console.log(`      ✅ "${atend.profissional}" → ${prof.id} (${prof.nome})`);
              }

              processadosAtend++;
              if (processadosAtend === atendimentos.length) {
                finalizarClinica();
              }
            });
          } else {
            naoEncontrados++;
            console.log(`      ⚠️ Profissional não encontrado: "${atend.profissional}"`);

            processadosAtend++;
            if (processadosAtend === atendimentos.length) {
              finalizarClinica();
            }
          }
        });

        function finalizarClinica() {
          console.log(`   📊 Resultado: ${atualizados} atualizados, ${naoEncontrados} não encontrados`);
          db.close();
          processados++;
          verificarConclusao();
        }
      });
    }
  });

  function verificarConclusao() {
    if (processados === files.length) {
      console.log('\n✅ Migração concluída!');
      console.log('   Reinicie o servidor para aplicar as alterações.\n');
      globalDb.close();
    }
  }
});