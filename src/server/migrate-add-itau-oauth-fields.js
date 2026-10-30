/**
 * Migração: Adiciona campos OAuth do Itaú na tabela configuracoes_banco
 * 
 * Campos adicionados:
 * - clientId: Client ID do OAuth Itaú
 * - clientSecret: Client Secret do OAuth Itaú
 * - itauKey: Chave de acesso Itaú
 * - tipoAmbiente: 1=Produção, 2=Homologação
 * - tokenOAuth: Token OAuth armazenado (renovado automaticamente)
 * - tokenValidade: Data/hora de expiração do token
 * - tipoJuros: Tipo de juros (1-9, conforme API Itaú)
 * - tipoMulta: Tipo de multa (1-3, conforme API Itaú)
 * - boletoRegistrado: Flag para indicar se usa API Itaú (1) ou geração local (0)
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Diretório onde ficam os bancos de dados das clínicas
const DB_DIR = path.join(__dirname, 'databases');

function migrateDatabase(dbPath, clinicaId) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error(`❌ Erro ao abrir banco ${clinicaId}:`, err.message);
        return reject(err);
      }

      console.log(`📂 Migrando banco: ${clinicaId}`);

      // Verifica se a tabela configuracoes_banco existe
      db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='configuracoes_banco'",
        [],
        (err, row) => {
          if (err) {
            console.error(`❌ Erro ao verificar tabela:`, err.message);
            db.close();
            return reject(err);
          }

          if (!row) {
            console.log(`⚠️ Tabela configuracoes_banco não existe em ${clinicaId}, pulando...`);
            db.close();
            return resolve();
          }

          // Verifica se os campos já existem
          db.all('PRAGMA table_info(configuracoes_banco)', [], (err, columns) => {
            if (err) {
              console.error(`❌ Erro ao ler estrutura da tabela:`, err.message);
              db.close();
              return reject(err);
            }

            const existingColumns = columns.map((c) => c.name);
            const fieldsToAdd = [];

            // Define campos a adicionar
            const newFields = [
            { name: 'clientId', type: 'TEXT' },
            { name: 'clientSecret', type: 'TEXT' },
            { name: 'itauKey', type: 'TEXT' },
            { name: 'tipoAmbiente', type: 'INTEGER DEFAULT 2' }, // 1=Produção, 2=Homologação
            { name: 'tokenOAuth', type: 'TEXT' },
            { name: 'tokenValidade', type: 'TEXT' },
            { name: 'tipoJuros', type: 'INTEGER DEFAULT 5' }, // 5=Isento
            { name: 'tipoMulta', type: 'INTEGER DEFAULT 3' }, // 3=Isento
            { name: 'boletoRegistrado', type: 'INTEGER DEFAULT 0' } // 0=Local, 1=API Itaú
            ];

            // Verifica quais campos precisam ser adicionados
            newFields.forEach((field) => {
              if (!existingColumns.includes(field.name)) {
                fieldsToAdd.push(field);
              }
            });

            if (fieldsToAdd.length === 0) {
              console.log(`✅ Campos OAuth já existem em ${clinicaId}`);
              db.close();
              return resolve();
            }

            console.log(`➕ Adicionando ${fieldsToAdd.length} campos em ${clinicaId}:`, fieldsToAdd.map((f) => f.name).join(', '));

            // Adiciona campos um por um
            let completed = 0;
            let hasError = false;

            fieldsToAdd.forEach((field) => {
              const sql = `ALTER TABLE configuracoes_banco ADD COLUMN ${field.name} ${field.type}`;

              db.run(sql, [], (err) => {
                if (err && !err.message.includes('duplicate column')) {
                  console.error(`❌ Erro ao adicionar campo ${field.name}:`, err.message);
                  hasError = true;
                }

                completed++;

                if (completed === fieldsToAdd.length) {
                  db.close((closeErr) => {
                    if (closeErr) {
                      console.error(`❌ Erro ao fechar banco:`, closeErr.message);
                    }

                    if (hasError) {
                      reject(new Error('Erro ao adicionar alguns campos'));
                    } else {
                      console.log(`✅ Migração concluída para ${clinicaId}`);
                      resolve();
                    }
                  });
                }
              });
            });
          });
        }
      );
    });
  });
}

async function runMigration() {
  console.log('🚀 Iniciando migração: Campos OAuth Itaú\n');

  try {
    // Verifica se o diretório de databases existe
    if (!fs.existsSync(DB_DIR)) {
      console.log('⚠️ Diretório de databases não encontrado. Nenhuma migração necessária.');
      return;
    }

    // Lista todos os arquivos .db no diretório
    const files = fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.db'));

    if (files.length === 0) {
      console.log('⚠️ Nenhum banco de dados encontrado.');
      return;
    }

    console.log(`📊 Encontrados ${files.length} bancos de dados\n`);

    // Migra cada banco
    for (const file of files) {
      const dbPath = path.join(DB_DIR, file);
      const clinicaId = file.replace('.db', '');

      try {
        await migrateDatabase(dbPath, clinicaId);
      } catch (err) {
        console.error(`❌ Falha ao migrar ${clinicaId}:`, err.message);
      }
    }

    console.log('\n✅ Migração concluída com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('   1. Configure Client ID, Client Secret e Itaú Key em Configurações → Configurações Bancárias');
    console.log('   2. Teste a conexão com o botão "Testar Conexão"');
    console.log('   3. Ao emitir boleto, escolha "Boleto Registrado" para usar a API do Itaú');

  } catch (error) {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
  }
}

// Executa migração se chamado diretamente
if (require.main === module) {
  runMigration().
  then(() => process.exit(0)).
  catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
}

module.exports = { runMigration };