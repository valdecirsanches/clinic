// ==================== ROTAS DE CONFIGURAÇÕES ====================

const express = require('express');
const router = express.Router();
const dbGlobal = require('../databaseGlobal');
const { getClinicaDB } = require('../databaseClinica');

// ==================== CONFIGURAÇÕES GLOBAIS ====================

// GET /api/configuracoes-globais/:chave
router.get('/globais/:chave', async (req, res) => {
  const { chave } = req.params;
  console.log(`🔍 GET /api/configuracoes-globais/${chave}`);
  try {
    const row = await dbGlobal.prepare('SELECT * FROM configuracoes_globais WHERE chave = ?').get(chave);
    if (!row) return res.status(404).json({ error: 'Configuração não encontrada' });
    let valor = row.valor;
    try {valor = JSON.parse(row.valor);} catch (e) {}
    res.json({ ...row, valor });
  } catch (err) {
    console.error('❌ Erro ao buscar configuração:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/configuracoes-globais
router.post('/globais', async (req, res) => {
  const { chave, valor } = req.body;
  if (!chave || valor === undefined) return res.status(400).json({ error: 'chave e valor são obrigatórios' });
  console.log(`💾 POST /api/configuracoes-globais - Chave: ${chave}`);
  try {
    const id = `cfg${Date.now()}`;
    const atualizadoEm = new Date().toISOString();
    const valorString = typeof valor === 'object' ? JSON.stringify(valor) : valor;
    const upd = await dbGlobal.prepare('UPDATE configuracoes_globais SET valor = ?, atualizadoEm = ? WHERE chave = ?').run(valorString, atualizadoEm, chave);
    if (upd.changes === 0) {
      await dbGlobal.prepare('INSERT INTO configuracoes_globais (id, chave, valor, atualizadoEm) VALUES (?, ?, ?, ?)').run(id, chave, valorString, atualizadoEm);
      console.log(`✅ Configuração criada: ${chave}`);
    } else {
      console.log(`✅ Configuração atualizada: ${chave}`);
    }
    res.json({ id, chave, valor, atualizadoEm });
  } catch (err) {
    console.error('❌ Erro ao salvar configuração:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/configuracoes-globais/:chave
router.delete('/globais/:chave', async (req, res) => {
  const { chave } = req.params;
  console.log(`🗑️ DELETE /api/configuracoes-globais/${chave}`);
  try {
    await dbGlobal.prepare('DELETE FROM configuracoes_globais WHERE chave = ?').run(chave);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao deletar configuração:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== CONFIGURAÇÕES DE WHATSAPP ====================
// WhatsApp usa databaseClinica (sqlite3 async) — mantém API de callbacks

router.get('/whatsapp', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  db.get('SELECT * FROM whatsapp_config WHERE clinicaId = ?', [clinicaId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Configuração não encontrada' });
    const webhookAtivo = row.webhookAtivo === undefined || row.webhookAtivo === null ?
    true :
    row.webhookAtivo !== 0 && row.webhookAtivo !== false && row.webhookAtivo !== '0';
    res.json({
      ...row,
      ativo: Boolean(row.ativo),
      enviarConfirmacao: Boolean(row.enviarConfirmacao),
      webhookAtivo
    });
  });
});

function garantirColunasWhatsApp(db, done) {
  const migrations = [
  `ALTER TABLE whatsapp_config ADD COLUMN apiKey TEXT DEFAULT ''`,
  `ALTER TABLE whatsapp_config ADD COLUMN webhookUrl VARCHAR(1000) DEFAULT ''`,
  `ALTER TABLE whatsapp_config ADD COLUMN webhookAtivo TINYINT(1) DEFAULT 1`,
  `ALTER TABLE whatsapp_config ADD COLUMN menuAjudaTemplate TEXT DEFAULT ''`,
  `ALTER TABLE whatsapp_config ADD COLUMN menuAjudaSituacoes TEXT DEFAULT ''`,
  `ALTER TABLE whatsapp_config ADD COLUMN menuAjudaAtivo TINYINT(1) DEFAULT 1`];


  const executarProxima = (index) => {
    if (index >= migrations.length) return done();
    db.run(migrations[index], () => executarProxima(index + 1));
  };

  executarProxima(0);
}

router.post('/whatsapp', (req, res) => {
  const { clinicaId, ...configData } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  console.log(`💾 POST /api/whatsapp-config - clinicaId: ${clinicaId}`);
  const hasApiKey = typeof configData.apiKey === 'string' && configData.apiKey.trim() !== '';
  const db = getClinicaDB(clinicaId);
  const id = `whatsapp_${Date.now()}`;
  const atualizadoEm = new Date().toISOString();
  const menuAjudaAtivoVal = configData.menuAjudaAtivo !== undefined ?
  configData.menuAjudaAtivo ? 1 : 0 :
  1;
  const webhookAtivoVal = configData.webhookAtivo !== undefined ?
  configData.webhookAtivo ? 1 : 0 :
  1;

  garantirColunasWhatsApp(db, () => {
    const setClauses = ['provider=?', 'serverUrl=?', 'sessionName=?'];
    const params = [configData.provider, configData.serverUrl, configData.sessionName];

    if (hasApiKey) {
      setClauses.push('apiKey=?');
      params.push(configData.apiKey);
    }

    setClauses.push(
      'ativo=?',
      'horasAntecedencia=?',
      'mensagemTemplate=?',
      'enviarConfirmacao=?',
      'webhookUrl=?',
      'webhookAtivo=?',
      'menuAjudaTemplate=?',
      'menuAjudaSituacoes=?',
      'menuAjudaAtivo=?',
      'atualizadoEm=?'
    );
    params.push(
      configData.ativo ? 1 : 0,
      configData.horasAntecedencia,
      configData.mensagemTemplate,
      configData.enviarConfirmacao ? 1 : 0,
      configData.webhookUrl || '',
      webhookAtivoVal,
      configData.menuAjudaTemplate || '',
      configData.menuAjudaSituacoes || '',
      menuAjudaAtivoVal,
      atualizadoEm,
      clinicaId
    );

    db.run(
      `UPDATE whatsapp_config SET ${setClauses.join(',')} WHERE clinicaId=?`,
      params,
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        if (global.limparCacheSessionClinica) {
          global.limparCacheSessionClinica();
        }

        if (this.changes > 0) {
          return res.json({
            clinicaId,
            ...configData,
            webhookAtivo: Boolean(webhookAtivoVal),
            menuAjudaAtivo: Boolean(menuAjudaAtivoVal),
            atualizadoEm
          });
        }

        db.run(
          `INSERT INTO whatsapp_config (id,clinicaId,provider,serverUrl,sessionName,apiKey,ativo,horasAntecedencia,mensagemTemplate,enviarConfirmacao,webhookUrl,webhookAtivo,menuAjudaTemplate,menuAjudaSituacoes,menuAjudaAtivo,atualizadoEm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
          id,
          clinicaId,
          configData.provider,
          configData.serverUrl,
          configData.sessionName,
          hasApiKey ? configData.apiKey : '',
          configData.ativo ? 1 : 0,
          configData.horasAntecedencia,
          configData.mensagemTemplate,
          configData.enviarConfirmacao ? 1 : 0,
          configData.webhookUrl || '',
          webhookAtivoVal,
          configData.menuAjudaTemplate || '',
          configData.menuAjudaSituacoes || '',
          menuAjudaAtivoVal,
          atualizadoEm],

          (insertErr) => {
            if (insertErr) return res.status(500).json({ error: insertErr.message });
            res.json({
              id,
              clinicaId,
              ...configData,
              webhookAtivo: Boolean(webhookAtivoVal),
              menuAjudaAtivo: Boolean(menuAjudaAtivoVal),
              atualizadoEm
            });
          }
        );
      }
    );
  });
});

// ==================== CONFIGURAÇÕES DE SMS (SMSGo) ====================
// Mesma convenção do WhatsApp: uma linha por clínica, criada/migrada de forma
// preguiçosa para não exigir migração manual em bases já existentes.

const SMSGO_BASE_URL_PADRAO = 'https://api.smsgo.com.br';

function garantirTabelaSms(db, done) {
  db.run(
    `CREATE TABLE IF NOT EXISTS sms_config (
      id VARCHAR(191) PRIMARY KEY,
      clinicaId VARCHAR(191) NOT NULL,
      provider VARCHAR(100) NOT NULL DEFAULT 'smsgo',
      baseUrl VARCHAR(500),
      apiKey TEXT,
      bearerToken TEXT,
      remetente VARCHAR(100),
      ativo TINYINT(1) DEFAULT 0,
      usarComoFallback TINYINT(1) DEFAULT 1,
      mensagemTemplate TEXT,
      atualizadoEm VARCHAR(50) NOT NULL
    )`,
    () => {
      const migrations = [
      `ALTER TABLE sms_config ADD COLUMN bearerToken TEXT`,
      `ALTER TABLE sms_config ADD COLUMN remetente VARCHAR(100) DEFAULT ''`,
      `ALTER TABLE sms_config ADD COLUMN usarComoFallback TINYINT(1) DEFAULT 1`,
      `ALTER TABLE sms_config ADD COLUMN mensagemTemplate TEXT`,
      // Tokens JWT da SMSGo passam de 1000 caracteres — amplia colunas antigas
      `ALTER TABLE sms_config MODIFY COLUMN bearerToken TEXT`,
      `ALTER TABLE sms_config MODIFY COLUMN apiKey TEXT`];

      const executarProxima = (index) => {
        if (index >= migrations.length) return done();
        db.run(migrations[index], () => executarProxima(index + 1));
      };
      executarProxima(0);
    }
  );
}

router.get('/sms', (req, res) => {
  const { clinicaId } = req.query;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  const db = getClinicaDB(clinicaId);
  garantirTabelaSms(db, () => {
    db.get('SELECT * FROM sms_config WHERE clinicaId = ?', [clinicaId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      // Credenciais fixas no server/.env.local valem para todas as clínicas
      const credenciaisServidor = Boolean(
        String(process.env.SMSGO_API_KEY || '').trim() || String(process.env.SMSGO_BEARER_TOKEN || '').trim()
      );
      if (!row) return res.status(404).json({ error: 'Configuração não encontrada', credenciaisServidor });
      res.json({
        ...row,
        credenciaisServidor,
        // Segredo do servidor nunca vai ao navegador
        ...(credenciaisServidor ? { apiKey: '', bearerToken: '' } : {}),
        baseUrl: row.baseUrl || SMSGO_BASE_URL_PADRAO,
        ativo: Boolean(row.ativo),
        usarComoFallback: row.usarComoFallback === null || row.usarComoFallback === undefined ?
        true :
        Boolean(row.usarComoFallback)
      });
    });
  });
});

router.post('/sms', (req, res) => {
  const { clinicaId, ...configData } = req.body;
  if (!clinicaId) return res.status(400).json({ error: 'clinicaId é obrigatório' });

  console.log(`💾 POST /api/sms-config - clinicaId: ${clinicaId}`);

  const db = getClinicaDB(clinicaId);
  const id = `sms_${Date.now()}`;
  const atualizadoEm = new Date().toISOString();
  // Credenciais em branco NÃO apagam o que já está salvo (mesma regra do
  // WhatsApp: o formulário nunca devolve o segredo completo).
  const hasApiKey = typeof configData.apiKey === 'string' && configData.apiKey.trim() !== '';
  const hasToken = typeof configData.bearerToken === 'string' && configData.bearerToken.trim() !== '';
  const ativoVal = configData.ativo ? 1 : 0;
  const fallbackVal = configData.usarComoFallback === undefined ?
  1 :
  configData.usarComoFallback ? 1 : 0;

  garantirTabelaSms(db, () => {
    const setClauses = ['provider=?', 'baseUrl=?', 'remetente=?'];
    const params = [
    configData.provider || 'smsgo',
    configData.baseUrl || SMSGO_BASE_URL_PADRAO,
    configData.remetente || ''];


    if (hasApiKey) {
      setClauses.push('apiKey=?');
      params.push(configData.apiKey.trim());
    }
    if (hasToken) {
      setClauses.push('bearerToken=?');
      params.push(configData.bearerToken.trim());
    }

    setClauses.push('ativo=?', 'usarComoFallback=?', 'mensagemTemplate=?', 'atualizadoEm=?');
    params.push(
      ativoVal,
      fallbackVal,
      configData.mensagemTemplate || '',
      atualizadoEm,
      clinicaId
    );

    db.run(
      `UPDATE sms_config SET ${setClauses.join(',')} WHERE clinicaId=?`,
      params,
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        if (this.changes > 0) {
          return res.json({
            clinicaId,
            ...configData,
            ativo: Boolean(ativoVal),
            usarComoFallback: Boolean(fallbackVal),
            atualizadoEm
          });
        }

        db.run(
          `INSERT INTO sms_config (id,clinicaId,provider,baseUrl,apiKey,bearerToken,remetente,ativo,usarComoFallback,mensagemTemplate,atualizadoEm)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [
          id,
          clinicaId,
          configData.provider || 'smsgo',
          configData.baseUrl || SMSGO_BASE_URL_PADRAO,
          hasApiKey ? configData.apiKey.trim() : '',
          hasToken ? configData.bearerToken.trim() : '',
          configData.remetente || '',
          ativoVal,
          fallbackVal,
          configData.mensagemTemplate || '',
          atualizadoEm],

          (insertErr) => {
            if (insertErr) return res.status(500).json({ error: insertErr.message });
            res.json({
              id,
              clinicaId,
              ...configData,
              ativo: Boolean(ativoVal),
              usarComoFallback: Boolean(fallbackVal),
              atualizadoEm
            });
          }
        );
      }
    );
  });
});

module.exports = router;
module.exports.garantirTabelaSms = garantirTabelaSms;
module.exports.SMSGO_BASE_URL_PADRAO = SMSGO_BASE_URL_PADRAO;