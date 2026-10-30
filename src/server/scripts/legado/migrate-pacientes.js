const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('🔄 Iniciando migração das tabelas de pacientes...');

// Lista todos os bancos de dados de clínicas na pasta data/
const dataDir = path.join(__dirname, '..', '..', 'data');
const files = fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : [];
const clinicaDBs = files.filter((f) => f.endsWith('.db') && f !== 'principal.db');

console.log(`📊 Encontrados ${clinicaDBs.length} bancos de clínicas`);

// Colunas a serem adicionadas
const newColumns = [
{ name: 'matricula', type: 'TEXT' },
{ name: 'status', type: 'TEXT DEFAULT "pre_cadastro"' },
{ name: 'numeroContrato', type: 'TEXT' },
{ name: 'dataInicio', type: 'TEXT' },
{ name: 'idade', type: 'INTEGER' },
{ name: 'genero', type: 'TEXT DEFAULT "nao_informar"' },
{ name: 'estadoCivil', type: 'TEXT DEFAULT "solteiro"' },
{ name: 'dificuldadeLocomocao', type: 'INTEGER DEFAULT 0' },
{ name: 'rg', type: 'TEXT' },
{ name: 'emissorRg', type: 'TEXT' },
{ name: 'cns', type: 'TEXT' },
{ name: 'pisPasep', type: 'TEXT' },
{ name: 'convenio', type: 'TEXT' },
{ name: 'empresa', type: 'TEXT' },
{ name: 'plano', type: 'TEXT' },
{ name: 'profissao', type: 'TEXT' },
{ name: 'grauInstrucao', type: 'TEXT' },
{ name: 'profissionalResponsavel', type: 'TEXT' },
{ name: 'nomeMae', type: 'TEXT' },
{ name: 'nomePai', type: 'TEXT' },
{ name: 'nomeResponsavel', type: 'TEXT' },
{ name: 'rgResponsavel', type: 'TEXT' },
{ name: 'cpfResponsavel', type: 'TEXT' },
{ name: 'registroEmpresa', type: 'TEXT' },
{ name: 'cep', type: 'TEXT' },
{ name: 'logradouro', type: 'TEXT' },
{ name: 'numero', type: 'TEXT' },
{ name: 'complemento', type: 'TEXT' },
{ name: 'bairro', type: 'TEXT' },
{ name: 'cidade', type: 'TEXT' },
{ name: 'uf', type: 'TEXT' },
{ name: 'codigoIbge', type: 'TEXT' },
{ name: 'telefoneResidencial', type: 'TEXT' },
{ name: 'observacoes', type: 'TEXT' },
{ name: 'anotacoes', type: 'TEXT' },
{ name: 'dataCadastro', type: 'TEXT' }];


// Migra cada banco
let completed = 0;
clinicaDBs.forEach((dbFile) => {
  const dbPath = path.join(dataDir, dbFile);
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error(`❌ Erro ao abrir ${dbFile}:`, err);
      return;
    }

    console.log(`\n📝 Migrando ${dbFile}...`);

    // Verifica colunas existentes
    db.all("PRAGMA table_info(pacientes)", [], (err, columns) => {
      if (err) {
        console.error(`❌ Erro ao ler colunas de ${dbFile}:`, err);
        db.close();
        return;
      }

      const existingColumns = columns.map((c) => c.name);
      console.log(`   Colunas existentes: ${existingColumns.length}`);

      // Adiciona colunas faltantes
      let added = 0;
      newColumns.forEach((col) => {
        if (!existingColumns.includes(col.name)) {
          db.run(`ALTER TABLE pacientes ADD COLUMN ${col.name} ${col.type}`, (err) => {
            if (err) {
              console.error(`   ❌ Erro ao adicionar coluna ${col.name}:`, err.message);
            } else {
              added++;
              console.log(`   ✅ Coluna ${col.name} adicionada`);
            }
          });
        }
      });

      setTimeout(() => {
        console.log(`   ✅ ${dbFile} migrado! (${added} colunas adicionadas)`);
        db.close();
        completed++;

        if (completed === clinicaDBs.length) {
          console.log('\n🎉 Migração concluída com sucesso!');
          console.log('🔄 Reinicie o servidor para aplicar as mudanças.');
        }
      }, 1000);
    });
  });
});

if (clinicaDBs.length === 0) {
  console.log('ℹ️ Nenhum banco de clínica encontrado. Nada a migrar.');
}