// ==================== ROTAS DE IMPORTAÇÃO ====================

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const { runAllMigrations, runMigrations, runClinicasMigrations, runOperadorasMigrations, runEspecialidadesMigration, runUniversalSchemaMigration, EXPECTED_SCHEMA } = require('../utils/migrations');
const dbGlobal = require('../databaseGlobal');
const { getClinicaDBAsync } = require('../databaseClinica');
const { getClinicaDbName } = require('../config/mysql');

// Armazenamento temporário dos logs de importação (em memória)
let importacaoLogs = [];
let isImportacaoRunning = false;
let importacaoStartTime = null;

// Função para adicionar log
function addImportacaoLog(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type, // 'info', 'success', 'error', 'warning'
    message
  };

  importacaoLogs.push(logEntry);

  // Mantém apenas os últimos 1000 logs para não consumir muita memória
  if (importacaoLogs.length > 1000) {
    importacaoLogs = importacaoLogs.slice(-1000);
  }

  console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);
}

// POST /api/importacao/update-data
router.post('/update-data', async (req, res) => {
  const { clinicaId } = req.body;
  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  console.log(`🔧 Executando update data para clínica: ${clinicaId}`);

  const scriptPath = path.join(__dirname, '..', 'importacao', clinicaId, 'exec-todos.js');

  exec(`node ${scriptPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Erro ao executar importação: ${error.message}`);
      return res.status(500).json({ error: `Erro ao executar importação: ${error.message}` });
    }
    if (stderr) {
      console.error(`⚠️ Stderr: ${stderr}`);
    }
    console.log(`✅ Importação executada com sucesso: ${stdout}`);
    res.json({ success: true, message: 'Update data executado com sucesso', output: stdout });
  });
});

// POST /api/importacao/exec-tudo
router.post('/exec-tudo', async (req, res) => {
  try {
    const { clinicaId } = req.query;

    if (!clinicaId) {
      return res.status(400).json({ error: 'clinicaId é obrigatório como parâmetro de query' });
    }

    // Verifica se a clínica existe
    const clinica = await dbGlobal.prepare('SELECT id, nome FROM clinicas WHERE id = ?').get(clinicaId);
    if (!clinica) {
      return res.status(404).json({ error: 'Clínica não encontrada' });
    }

    // Verifica se já há uma importação em andamento
    if (isImportacaoRunning) {
      return res.status(409).json({
        error: 'Já existe uma importação em andamento. Aguarde a conclusão.'
      });
    }

    // Limpa logs anteriores e marca início
    importacaoLogs = [];
    isImportacaoRunning = true;
    importacaoStartTime = new Date();

    addImportacaoLog(`🚀 Iniciando importação para clínica: ${clinica.nome} (${clinica.id})`, 'info');

    // Executa a importação para a clínica específica
    runImportacaoClinicaEspecifica(clinica).then(() => {
      addImportacaoLog('✅ Importação concluída com sucesso!', 'success');
      isImportacaoRunning = false;
    }).catch((error) => {
      addImportacaoLog(`❌ Erro ao executar importação: ${error.message}`, 'error');
      isImportacaoRunning = false;
    });

    res.json({
      success: true,
      message: `Importação iniciada para a clínica: ${clinica.nome}! Acompanhe o progresso na tela.`,
      clinica: { id: clinica.id, nome: clinica.nome },
      startTime: importacaoStartTime.toISOString()
    });
  } catch (error) {
    addImportacaoLog(`❌ Erro ao iniciar importação: ${error.message}`, 'error');
    isImportacaoRunning = false;
    res.status(500).json({ error: `Erro ao iniciar importação: ${error.message}` });
  }
});

// GET /api/importacao/status - Retorna logs e status atual
router.get('/status', (req, res) => {
  res.json({
    isRunning: isImportacaoRunning,
    startTime: importacaoStartTime?.toISOString(),
    logs: importacaoLogs,
    totalLogs: importacaoLogs.length
  });
});

// Função que executa importação para uma clínica específica
async function runImportacaoClinicaEspecifica(clinica) {
  try {
    addImportacaoLog(`🏥 Iniciando importação para clínica: ${clinica.nome} (${clinica.id})`, 'info');

    const scriptPath = path.join(__dirname, '..', 'importacao', clinica.id, 'exec-todos.js');

    // Verifica se o arquivo existe
    const fs = require('fs');
    if (!fs.existsSync(scriptPath)) {
      addImportacaoLog(`⚠️ Arquivo exec-todos.js não encontrado para clínica ${clinica.id}: ${scriptPath}`, 'warning');
      addImportacaoLog(`ℹ️ Para importar dados, crie a pasta: src/server/importacao/${clinica.id}/`, 'info');
      addImportacaoLog(`ℹ️ E adicione o arquivo exec-todos.js e os scripts de importação`, 'info');
      addImportacaoLog(`❌ Importação cancelada - estrutura de importação não encontrada`, 'error');
      return;
    }

    // Executa o script com Promise
    await new Promise((resolve, reject) => {
      exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
          addImportacaoLog(`❌ Erro na importação da clínica ${clinica.id}: ${error.message}`, 'error');
          if (stderr) {
            addImportacaoLog(`⚠️ Stderr da clínica ${clinica.id}: ${stderr}`, 'warning');
          }
          reject(error);
          return;
        }

        // Processa stdout linha por linha
        if (stdout) {
          const lines = stdout.split('\n').filter((line) => line.trim());
          lines.forEach((line) => {
            addImportacaoLog(`[${clinica.id}] ${line}`, 'info');
          });
        }

        if (stderr) {
          addImportacaoLog(`⚠️ Stderr da clínica ${clinica.id}: ${stderr}`, 'warning');
        }

        addImportacaoLog(`✅ Importação concluída para clínica: ${clinica.nome} (${clinica.id})`, 'success');
        resolve();
      });
    });

  } catch (error) {
    addImportacaoLog(`❌ Erro inesperado na importação da clínica ${clinica.id}: ${error.message}`, 'error');
    throw error;
  }
}

module.exports = router;