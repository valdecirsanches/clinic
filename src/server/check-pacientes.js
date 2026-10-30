
const { getClinicaDB } = require('./databaseClinica');

// Substitua pelo ID da sua clínica
const clinicaId = 'c1766863485306';

console.log(`🔍 Verificando pacientes na clínica: ${clinicaId}`);

const db = getClinicaDB(clinicaId);

// Conta total
db.get('SELECT COUNT(*) as total FROM pacientes', [], (err, row) => {
  if (err) {
    console.error('❌ Erro ao contar:', err);
    process.exit(1);
  }

  console.log(`📊 Total de pacientes: ${row.total}`);

  if (row.total === 0) {
    console.log('⚠️ Nenhum paciente encontrado no banco!');
    process.exit(0);
  }

  // Lista os primeiros 5 pacientes
  db.all('SELECT id, nome, cpf, telefone, email FROM pacientes LIMIT 5', [], (err, rows) => {
    if (err) {
      console.error('❌ Erro ao listar:', err);
      process.exit(1);
    }

    console.log('\n📋 Primeiros 5 pacientes:');
    rows.forEach((p, i) => {
      console.log(`${i + 1}. ${p.nome} - CPF: ${p.cpf || 'N/A'} - Tel: ${p.telefone || 'N/A'}`);
    });

    // Testa busca
    const searchTerm = rows[0].nome.substring(0, 3); // Pega as 3 primeiras letras do primeiro nome
    console.log(`\n🔍 Testando busca por: "${searchTerm}"`);

    db.all(
      'SELECT id, nome FROM pacientes WHERE nome LIKE ? LIMIT 5',
      [`%${searchTerm}%`],
      (err, searchResults) => {
        if (err) {
          console.error('❌ Erro na busca:', err);
          process.exit(1);
        }

        console.log(`✅ Encontrados ${searchResults.length} pacientes:`);
        searchResults.forEach((p, i) => {
          console.log(`${i + 1}. ${p.nome}`);
        });

        process.exit(0);
      }
    );
  });
});