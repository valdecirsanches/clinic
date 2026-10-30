// ==================== FIX: Atualizar prontuários do "Dr. Roberto Silva" para o novo ID ====================
// Este script atualiza prontuários e atendimentos que têm o nome antigo "Dr. Roberto Silva"
// para usar o profissionalId correto (do usuário que foi renomeado)

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const SERVER_DIR = path.join(__dirname, '..', '..');
const globalDbPath = path.join(SERVER_DIR, 'data', 'principal.db');

console.log('🔄 FIX: Atualizar prontuários do "Dr. Roberto Silva"\n');

// Verifica se o banco global existe
if (!fs.existsSync(globalDbPath)) {
  console.error('❌ Banco global não encontrado:', globalDbPath);
  process.exit(1);
}

const globalDb = new sqlite3.Database(globalDbPath);

// Busca todos os profissionais para o usuário escolher
globalDb.all("SELECT id, nome, clinicaId FROM usuarios WHERE tipo IN ('medico', 'dentista') ORDER BY nome", [], (err, profissionais) => {
  if (err) {
    console.error('❌ Erro ao buscar profissionais:', err.message);
    globalDb.close();
    process.exit(1);
  }

  console.log('👨‍⚕️ Profissionais disponíveis:\n');
  profissionais.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.nome} (ID: ${p.id}, Clínica: ${p.clinicaId || 'N/A'})`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('\n📝 Digite o NÚMERO do profissional que substituirá "Dr. Roberto Silva": ', (answer) => {
    const index = parseInt(answer) - 1;

    if (isNaN(index) || index < 0 || index >= profissionais.length) {
      console.error('❌ Número inválido');
      rl.close();
      globalDb.close();
      process.exit(1);
    }

    const profissionalEscolhido = profissionais[index];
    console.log(`\n✅ Selecionado: ${profissionalEscolhido.nome} (ID: ${profissionalEscolhido.id})`);

    rl.question('\n⚠️ Confirma a atualização? (s/n): ', (confirm) => {
      rl.close();

      if (confirm.toLowerCase() !== 's') {
        console.log('❌ Operação cancelada');
        globalDb.close();
        process.exit(0);
      }

      // Processa todos os bancos de clínicas na pasta data/
      const dataDir = path.join(SERVER_DIR, 'data');
      const files = fs.existsSync(dataDir) ?
      fs.readdirSync(dataDir).filter((f) => f.endsWith('.db') && f !== 'principal.db') :
      [];

      console.log(`\n📁 Processando ${files.length} bancos de clínicas...\n`);

      let processados = 0;
      let totalAtualizados = 0;

      files.forEach((file) => {
        const dbPath = path.join(dataDir, file);
        const db = new sqlite3.Database(dbPath);
        const clinicaId = file.replace('easyclin-clinica-', '').replace('.db', '');

        // Atualiza prontuários
        db.run(
          `UPDATE prontuarios SET profissionalId = ? WHERE profissional LIKE '%Roberto%' AND (profissionalId IS NULL OR profissionalId = '')`,
          [profissionalEscolhido.id],
          function (err) {
            if (err) {
              console.error(`   ❌ Erro ao atualizar prontuários em ${clinicaId}:`, err.message);
            } else if (this.changes > 0) {
              console.log(`   ✅ ${clinicaId}: ${this.changes} prontuários atualizados`);
              totalAtualizados += this.changes;
            }

            // Atualiza atendimentos
            db.run(
              `UPDATE atendimentos SET profissionalId = ? WHERE profissional LIKE '%Roberto%' AND (profissionalId IS NULL OR profissionalId = '')`,
              [profissionalEscolhido.id],
              function (err) {
                if (err) {
                  console.error(`   ❌ Erro ao atualizar atendimentos em ${clinicaId}:`, err.message);
                } else if (this.changes > 0) {
                  console.log(`   ✅ ${clinicaId}: ${this.changes} atendimentos atualizados`);
                  totalAtualizados += this.changes;
                }

                db.close();
                processados++;

                if (processados === files.length) {
                  console.log(`\n✅ Migração concluída! Total de registros atualizados: ${totalAtualizados}`);
                  console.log('   Reinicie o servidor para aplicar as alterações.\n');
                  globalDb.close();
                }
              }
            );
          }
        );
      });
    });
  });
});