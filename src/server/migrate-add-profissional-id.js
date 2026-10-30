const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🔧 MIGRAÇÃO: Adicionar profissionalId às agendas existentes\n');

// Conecta ao banco global para pegar usuários
const dbGlobalPath = path.join(__dirname, 'data', 'principal.db');
const dbGlobal = new sqlite3.Database(dbGlobalPath);

// Busca todos os bancos de clínica na pasta data/
const dataDir = path.join(__dirname, 'data');
const clinicaDbs = fs.existsSync(dataDir) ?
fs.readdirSync(dataDir).filter((f) => f.endsWith('.db') && f !== 'principal.db') :
[];

console.log(`📊 Encontrados ${clinicaDbs.length} bancos de clínica\n`);

// Primeiro, busca todos os usuários
dbGlobal.all('SELECT id, nome, clinicaId FROM usuarios WHERE tipo IN ("medico", "dentista")', [], (err, usuarios) => {
  if (err) {
    console.error('❌ Erro ao buscar usuários:', err);
    process.exit(1);
  }

  console.log(`👥 ${usuarios.length} profissionais encontrados no sistema\n`);

  // Para cada banco de clínica
  let processados = 0;

  clinicaDbs.forEach((dbFile) => {
    const clinicaId = dbFile.replace('easyclin-clinica-', '').replace('.db', '');
    const dbPath = path.join(dataDir, dbFile);
    const db = new sqlite3.Database(dbPath);

    console.log(`\n🏥 Processando clínica: ${clinicaId}`);

    // Busca agendas sem profissionalId
    db.all('SELECT id, profissionalNome FROM agendas WHERE profissionalId IS NULL', [], (err, agendas) => {
      if (err) {
        console.error(`❌ Erro ao buscar agendas da clínica ${clinicaId}:`, err);
        return;
      }

      if (agendas.length === 0) {
        console.log(`   ✅ Nenhuma agenda sem profissionalId`);
        processados++;
        if (processados === clinicaDbs.length) {
          console.log('\n✅ MIGRAÇÃO CONCLUÍDA!\n');
          dbGlobal.close();
          process.exit(0);
        }
        return;
      }

      console.log(`   📋 ${agendas.length} agendas sem profissionalId encontradas`);

      let atualizadas = 0;
      let naoEncontradas = 0;

      agendas.forEach((agenda) => {
        // Tenta encontrar o usuário por nome (match inteligente)
        const nomeLimpo = agenda.profissionalNome.trim().toLowerCase();
        const palavrasChave = nomeLimpo.
        replace(/\b(dr|dra|doutor|doutora)\b\.?\s*/gi, '').
        split(/\s+/).
        filter((p) => p.length > 2);

        const usuario = usuarios.find((u) => {
          if (u.clinicaId !== clinicaId) return false;

          const usuarioNomeLimpo = u.nome.trim().toLowerCase();

          // Match exato
          if (usuarioNomeLimpo === nomeLimpo) return true;

          // Match por inclusão
          if (usuarioNomeLimpo.includes(nomeLimpo) || nomeLimpo.includes(usuarioNomeLimpo)) return true;

          // Match inteligente por palavras-chave
          const usuarioPalavras = usuarioNomeLimpo.
          replace(/\b(dr|dra|doutor|doutora)\b\.?\s*/gi, '').
          split(/\s+/);

          return palavrasChave.every((palavra) =>
          usuarioPalavras.some((up) => up.includes(palavra) || palavra.includes(up))
          );
        });

        if (usuario) {
          // Atualiza a agenda com o profissionalId
          db.run(
            'UPDATE agendas SET profissionalId = ? WHERE id = ?',
            [usuario.id, agenda.id],
            (err) => {
              if (err) {
                console.error(`   ❌ Erro ao atualizar agenda ${agenda.id}:`, err);
              } else {
                atualizadas++;
                console.log(`   ✅ Agenda "${agenda.profissionalNome}" → profissionalId: ${usuario.id}`);
              }

              // Verifica se terminou
              if (atualizadas + naoEncontradas === agendas.length) {
                console.log(`\n   📊 Resumo da clínica ${clinicaId}:`);
                console.log(`      - Atualizadas: ${atualizadas}`);
                console.log(`      - Não encontradas: ${naoEncontradas}`);

                db.close();
                processados++;

                if (processados === clinicaDbs.length) {
                  console.log('\n✅ MIGRAÇÃO CONCLUÍDA!\n');
                  dbGlobal.close();
                  process.exit(0);
                }
              }
            }
          );
        } else {
          naoEncontradas++;
          console.log(`   ⚠️ Usuário não encontrado para agenda: "${agenda.profissionalNome}"`);

          // Verifica se terminou
          if (atualizadas + naoEncontradas === agendas.length) {
            console.log(`\n   📊 Resumo da clínica ${clinicaId}:`);
            console.log(`      - Atualizadas: ${atualizadas}`);
            console.log(`      - Não encontradas: ${naoEncontradas}`);

            db.close();
            processados++;

            if (processados === clinicaDbs.length) {
              console.log('\n✅ MIGRAÇÃO CONCLUÍDA!\n');
              dbGlobal.close();
              process.exit(0);
            }
          }
        }
      });
    });
  });
});