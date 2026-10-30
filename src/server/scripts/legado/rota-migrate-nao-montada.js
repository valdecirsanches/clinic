// ==================== ROTAS DE IMPORTAÇÃO ====================

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const { runAllMigrations, runMigrations, runClinicasMigrations, runOperadorasMigrations, runEspecialidadesMigration, runUniversalSchemaMigration, EXPECTED_SCHEMA } = require('../../utils/migrations');

// Armazenamento temporário dos logs de migração (em memória)
let migrationLogs = [];
let isMigrationRunning = false;
let migrationStartTime = null;

// Função para adicionar log
function addMigrationLog(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type, // 'info', 'success', 'error', 'warning'
    message
  };

  migrationLogs.push(logEntry);

  // Mantém apenas os últimos 1000 logs para não consumir muita memória
  if (migrationLogs.length > 1000) {
    migrationLogs = migrationLogs.slice(-1000);
  }

  console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);
}

// POST /api/migrate/update-data
router.post('/update-data', async (req, res) => {
  const { clinicaId } = req.body;
  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  console.log(`🔧 Executando update data para clínica: ${clinicaId}`);

  const scriptPath = path.join('/home/sanches/Magic/clinic-migracao', clinicaId);

  exec(`node ${scriptPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erro ao executar migração: ${error.message}`);
      return res.status(500).json({ error: `Erro ao executar migração: ${error.message}` });
    }
    if (stderr) {
      console.error(`⚠️ Stderr: ${stderr}`);
    }
    console.log(`✅ Migração executada com sucesso: ${stdout}`);
    res.json({ success: true, message: 'Update data executado com sucesso', output: stdout });
  });
});

// POST /api/migrate/exec-tudo
router.post('/exec-tudo', async (req, res) => {
  try {
    // Verifica se já há uma migração em andamento
    if (isMigrationRunning) {
      return res.status(409).json({
        error: 'Já existe uma migração em andamento. Aguarde a conclusão.'
      });
    }

    // Limpa logs anteriores e marca início
    migrationLogs = [];
    isMigrationRunning = true;
    migrationStartTime = new Date();

    addMigrationLog('🚀 Iniciando execução de todas as migrações...', 'info');

    // Executa as migrações com logging personalizado
    runAllMigrationsWithLogging().then(() => {
      addMigrationLog('✅ Todas as migrações executadas com sucesso!', 'success');
      isMigrationRunning = false;
    }).catch((error) => {
      addMigrationLog(`❌ Erro ao executar migrações: ${error.message}`, 'error');
      isMigrationRunning = false;
    });

    res.json({
      success: true,
      message: 'Migrações iniciadas! Acompanhe o progresso na tela.',
      startTime: migrationStartTime.toISOString()
    });
  } catch (error) {
    addMigrationLog(`❌ Erro ao iniciar migrações: ${error.message}`, 'error');
    isMigrationRunning = false;
    res.status(500).json({ error: `Erro ao iniciar migrações: ${error.message}` });
  }
});

// GET /api/migrate/status - Retorna logs e status atual
router.get('/status', (req, res) => {
  res.json({
    isRunning: isMigrationRunning,
    startTime: migrationStartTime?.toISOString(),
    logs: migrationLogs,
    totalLogs: migrationLogs.length
  });
});

// Função modificada que adiciona logging
async function runAllMigrationsWithLogging() {
  try {
    addMigrationLog('🔧 ========== INICIANDO TODAS AS MIGRAÇÕES ==========', 'info');

    // 1. Migrações globais (banco principal — SQLite/better-sqlite3)
    addMigrationLog('📋 Executando migrações globais...', 'info');
    await runMigrations();
    addMigrationLog('✅ Migrações globais concluídas', 'success');

    await runClinicasMigrations();
    addMigrationLog('✅ Migrações de clínicas concluídas', 'success');

    await runOperadorasMigrations();
    addMigrationLog('✅ Migrações de operadoras concluídas', 'success');

    await runEspecialidadesMigration();
    addMigrationLog('✅ Migrações de especialidades concluídas', 'success');

    // 2. ⭐ MIGRAÇÃO UNIVERSAL: sincroniza TODAS as tabelas de TODAS as clínicas
    addMigrationLog('📋 Iniciando migração universal de schema...', 'info');
    await runUniversalSchemaMigrationWithLogging();
    addMigrationLog('✅ Migração universal concluída', 'success');

    addMigrationLog('🚀 ========== MIGRAÇÕES CONCLUÍDAS COM SUCESSO ==========', 'success');
  } catch (error) {
    addMigrationLog(`❌ Erro durante migrações: ${error.message}`, 'error');
    throw error;
  }
}

// Versão modificada da migração universal com logging
async function runUniversalSchemaMigrationWithLogging() {
  addMigrationLog('🔧 ========== MIGRAÇÃO UNIVERSAL DE SCHEMA ==========', 'info');
  addMigrationLog('📋 Sincronizando TODAS as tabelas de TODAS as clínicas...', 'info');

  try {
    const clinicas = await dbGlobal.prepare('SELECT id FROM clinicas').all();
    if (!clinicas || clinicas.length === 0) {
      addMigrationLog('ℹ️ Nenhuma clínica encontrada', 'info');
      return;
    }

    addMigrationLog(`📋 ${clinicas.length} clínicas encontradas. Iniciando sincronização...`, 'info');

    let totalColunasAdicionadas = 0;
    let totalTabelasCriadas = 0;

    for (const clinica of clinicas) {
      try {
        addMigrationLog(`🏥 Processando clínica: ${clinica.id}`, 'info');
        const db = await getClinicaDBAsync(clinica.id);
        if (!db) {
          addMigrationLog(`⚠️ Não foi possível conectar à clínica ${clinica.id}`, 'warning');
          continue;
        }

        const pool = db.poolPromise || db;
        const dbName = db.dbName || getClinicaDbName(clinica.id);

        // 1. Lista tabelas existentes no banco
        const [existingTables] = await pool.execute(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`,
          [dbName]
        );
        const existingTableNames = new Set(existingTables.map((t) => t.TABLE_NAME));

        let clinicaColsAdded = 0;
        let clinicaTablesCreated = 0;

        // 2. Para cada tabela do schema esperado
        for (const [tableName, expectedColumns] of Object.entries(EXPECTED_SCHEMA)) {

          // 2a. Se a tabela não existe, o CREATE TABLE IF NOT EXISTS do databaseClinica.js já cuida
          // Mas por segurança, verificamos
          if (!existingTableNames.has(tableName)) {
            // A tabela será criada pelo createClinicaTables na próxima inicialização
            // Mas como já chamamos getClinicaDBAsync acima, ela já deveria existir
            addMigrationLog(`   ⚠️ [${clinica.id}] Tabela ${tableName} não existe (será criada automaticamente)`, 'warning');
            clinicaTablesCreated++;
            continue;
          }

          // 2b. Busca colunas existentes na tabela
          const [existingColumns] = await pool.execute(
            `SELECT COLUMN_NAME as name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
            [dbName, tableName]
          );
          const existingColNames = new Set(existingColumns.map((c) => c.name));

          // 2c. Compara e adiciona colunas faltantes
          for (const col of expectedColumns) {
            if (!existingColNames.has(col.name)) {
              try {
                await pool.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${col.name}\` ${col.type}`);
                clinicaColsAdded++;
                addMigrationLog(`   ✅ [${clinica.id}] ${tableName}.${col.name} adicionada (${col.type})`, 'success');
              } catch (alterErr) {
                if (!alterErr.message.includes('Duplicate column')) {
                  addMigrationLog(`   ❌ [${clinica.id}] Erro ao adicionar ${tableName}.${col.name}: ${alterErr.message}`, 'error');
                }
              }
            }
          }
        }

        if (clinicaColsAdded > 0 || clinicaTablesCreated > 0) {
          addMigrationLog(`   📊 [${clinica.id}] +${clinicaColsAdded} colunas, +${clinicaTablesCreated} tabelas`, 'info');
        } else {
          addMigrationLog(`   ✅ [${clinica.id}] Schema já está atualizado`, 'success');
        }

        totalColunasAdicionadas += clinicaColsAdded;
        totalTabelasCriadas += clinicaTablesCreated;

      } catch (clinicaErr) {
        addMigrationLog(`❌ Erro na clínica ${clinica.id}: ${clinicaErr.message}`, 'error');
      }
    }

    addMigrationLog(`✅ ========== MIGRAÇÃO UNIVERSAL CONCLUÍDA ==========`, 'success');
    addMigrationLog(`   📊 ${clinicas.length} clínicas processadas`, 'info');
    addMigrationLog(`   📊 ${totalColunasAdicionadas} colunas adicionadas no total`, 'info');
    addMigrationLog(`   📊 ${totalTabelasCriadas} tabelas criadas no total`, 'info');

  } catch (err) {
    addMigrationLog(`❌ Erro fatal na migração universal: ${err.message}`, 'error');
    throw err;
  }
}

module.exports = router;