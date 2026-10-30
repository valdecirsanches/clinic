// ==================== ROTAS DO PRINTSERVER ====================
// API REST para enviar impressões e gerenciar PrintServers conectados
// ⭐ v2.0: Persiste registros no MySQL (tabela printserver)

const express = require('express');
const router = express.Router();
const { getClinicaDB } = require('../databaseClinica');

// O printHub é injetado via app.locals no start-server.js
function getHub(req) {
  return req.app.locals.printHub;
}

// ⭐ Gera ID único
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
}

// ⭐ Extrai valor de uma tag XML-style de um array de strings
function extractXmlTag(dados, tagName) {
  if (!Array.isArray(dados)) return '';
  const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, 'i');
  for (const item of dados) {
    if (typeof item === 'string') {
      const match = item.match(regex);
      if (match) return match[1] || '';
    } else if (typeof item === 'object' && item[tagName] !== undefined) {
      return String(item[tagName]);
    }
  }
  return '';
}

// ==================== RATE LIMITING (em memória) ====================
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 60;

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, entry);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: 'Muitas requisições',
      message: `Limite de ${RATE_LIMIT_MAX} requisições por minuto excedido.`,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000)
    });
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300000);

router.use(rateLimit);

// ==================== DEDUP DE IMPRESSAO (anti-flood) ====================
// FIX: protege contra rajadas indevidas que inseriam MILHARES de registros
// identicos (ex.: cliente PrintServer em loop reenviando o mesmo ticket).
// Guarda uma assinatura de conteudo das ultimas impressoes e, dentro de uma
// janela curta, ignora reenvios identicos - retorna o job anterior em vez de
// criar uma nova linha no banco. Impressoes legitimas (conteudo diferente, ou
// a mesma impressao alguns segundos depois) continuam funcionando.
const DEDUP_WINDOW_MS = 10000; // 10s
const recentPrints = new Map(); // signature -> { jobId, status, at }

setInterval(() => {
  const now = Date.now();
  for (const [sig, entry] of recentPrints) {
    if (now - entry.at > DEDUP_WINDOW_MS) recentPrints.delete(sig);
  }
}, 60000);

/**
 * POST /api/printserver/imprimir
 * Envia comando de impressão e persiste no banco de dados
 */
router.post('/imprimir', async (req, res) => {
  const { clientId, dados, enqueue, clinicaId } = req.body;

  console.log(`\n📤📤📤 [PrintServer] ========================================`);
  console.log(`📤 [PrintServer] POST /imprimir`);
  console.log(`📤 [PrintServer] clientId: ${clientId}`);
  console.log(`📤 [PrintServer] clinicaId: ${clinicaId}`);
  console.log(`📤 [PrintServer] dados: ${dados ? `Array[${dados.length}]` : 'VAZIO/NULL'}`);
  console.log(`📤 [PrintServer] enqueue: ${enqueue}`);

  if (!clientId || !dados) {
    console.log(`📤 ❌ [PrintServer] Parâmetros faltando: clientId=${!!clientId}, dados=${!!dados}`);
    return res.status(400).json({
      error: 'Parâmetros obrigatórios: clientId, dados'
    });
  }

  if (!Array.isArray(dados) || dados.length === 0) {
    console.log(`📤 ❌ [PrintServer] dados não é array ou está vazio`);
    return res.status(400).json({
      error: 'O campo "dados" deve ser um array não vazio'
    });
  }

  const jobId = generateId();
  const agora = new Date().toISOString();

  // ⭐ Extrai campos dos dados (suporta XML-tag strings e objetos)
  const acao = extractXmlTag(dados, 'acao') || extractXmlTag(dados, 'ACAO') || 'RECIBO';
  const clinica = extractXmlTag(dados, 'clinica') || clinicaId || clientId || '';
  const contrato = extractXmlTag(dados, 'contrato') || '';
  const matricula = extractXmlTag(dados, 'matricula') || '';
  const dentista_nome = extractXmlTag(dados, 'dentista_nome') || '';
  const nome_paciente = extractXmlTag(dados, 'nome_paciente') || extractXmlTag(dados, 'nome') || '';
  const valor = extractXmlTag(dados, 'valor') || '';
  const titulo = extractXmlTag(dados, 'titulo') || '';
  const procedimento = extractXmlTag(dados, 'procedimento') || '';
  const empresa_nome = extractXmlTag(dados, 'empresa_nome') || '';
  const login = extractXmlTag(dados, 'login') || '';
  const clinica_fone = extractXmlTag(dados, 'clinica_fone') || '';

  console.log(`📤 [PrintServer] Extraído: acao=${acao}, clinica=${clinica}, nome=${nome_paciente}, valor=${valor}`);

  // ⭐ ANTI-FLOOD: ignora reenvios idênticos dentro de uma janela curta.
  // A assinatura usa o CONTEÚDO da impressão (NÃO o id_printserver, que muda a
  // cada clique via Date.now()). Assim, uma rajada do mesmo ticket é absorvida.
  const dedupSig = [
  clinica || clinicaId || clientId || '',
  acao,
  contrato,
  nome_paciente,
  valor,
  titulo,
  extractXmlTag(dados, 'hora'),
  extractXmlTag(dados, 'data')].
  join('|');
  const previo = recentPrints.get(dedupSig);
  if (previo && Date.now() - previo.at < DEDUP_WINDOW_MS) {
    console.warn(`📤 🛑 [PrintServer] DUPLICATA ignorada (anti-flood): sig="${dedupSig}" → reaproveitando job ${previo.jobId}`);
    return res.json({
      success: true,
      jobId: previo.jobId,
      status: previo.status,
      deduplicated: true,
      message: 'Impressão idêntica recente — reenvio ignorado para evitar duplicação'
    });
  }

  let jobStatus = 'queued';
  let hubResult = null;

  // ⭐ Tenta enviar via WebSocket Hub (se disponível)
  const hub = getHub(req);
  if (hub) {
    try {
      hubResult = hub.print(clientId, dados, { enqueue: !!enqueue });
      if (hubResult) {
        jobStatus = hubResult.status;
        console.log(`📤 [PrintServer] Hub result: jobId=${hubResult.jobId}, status=${hubResult.status}`);
      } else {
        console.log(`📤 [PrintServer] Hub retornou null (cliente offline, sem enqueue)`);
      }
    } catch (err) {
      console.error(`📤 ⚠️ [PrintServer] Erro no hub:`, err.message);
    }
  } else {
    console.log(`📤 [PrintServer] Hub não disponível — salvando apenas no banco`);
  }

  // ⭐ Persiste no banco de dados MySQL
  const cId = clinica || clinicaId || clientId;

  if (!cId) {
    console.log(`📤 ⚠️ [PrintServer] Nenhum clinicaId disponível para salvar no banco`);
    return res.json({
      success: true,
      jobId: hubResult?.jobId || jobId,
      status: jobStatus,
      message: 'Impressão registrada (sem persistência - clinicaId ausente)'
    });
  }

  try {
    const db = getClinicaDB(cId);
    const dadosJson = JSON.stringify(dados);

    console.log(`📤 [PrintServer] Salvando no banco: cId=${cId}, jobId=${jobId}, dadosJson.length=${dadosJson.length}`);

    // ⭐⭐⭐ FIX: Garante que a tabela existe ANTES do INSERT ⭐⭐⭐
    await new Promise((resolveTbl) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS printserver (
          id VARCHAR(191) PRIMARY KEY,
          clientId VARCHAR(191),
          acao VARCHAR(50),
          status VARCHAR(50) DEFAULT 'queued',
          dados LONGTEXT,
          clinica VARCHAR(191),
          contrato VARCHAR(191),
          matricula VARCHAR(255),
          dentista_nome VARCHAR(255),
          nome_paciente VARCHAR(255),
          valor VARCHAR(50),
          titulo VARCHAR(255),
          procedimento VARCHAR(255),
          empresa_nome VARCHAR(255),
          login VARCHAR(255),
          clinica_fone VARCHAR(100),
          erro TEXT,
          criadoEm VARCHAR(50) NOT NULL,
          enviadoEm VARCHAR(50),
          completadoEm VARCHAR(50)
        )
      `, (err) => {
        if (err) {
          console.log(`📤 [PrintServer] Tabela já existe ou erro ignorado: ${err.message}`);
        }
        resolveTbl();
      });
    });

    // ⭐⭐⭐ FIX: Aguarda o INSERT completar ANTES de responder ⭐⭐⭐
    const insertResult = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO printserver (id, clientId, acao, status, dados, clinica, contrato, matricula, dentista_nome, nome_paciente, valor, titulo, procedimento, empresa_nome, login, clinica_fone, criadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [jobId, clientId, acao, jobStatus, dadosJson, clinica, contrato, matricula, dentista_nome, nome_paciente, valor, titulo, procedimento, empresa_nome, login, clinica_fone, agora],
        function (err) {
          if (err) {
            console.error(`📤 ❌ [PrintServer] ERRO ao salvar no banco:`, err.message);
            console.error(`📤 ❌ [PrintServer] SQL params: jobId=${jobId}, clientId=${clientId}, acao=${acao}, dadosJson.length=${dadosJson.length}`);
            reject(err);
          } else {
            const changes = this.changes || this.affectedRows || 0;
            console.log(`📤 ✅ [PrintServer] Job ${jobId} salvo no banco (${acao}) clinica=${cId} changes=${changes}`);
            resolve({ changes });
          }
        }
      );
    });

    // ⭐⭐⭐ FIX: Verifica se o registro foi realmente salvo ⭐⭐⭐
    const verificacao = await new Promise((resolve) => {
      db.get('SELECT id, acao, status, LENGTH(dados) as dadosLen FROM printserver WHERE id = ?', [jobId], (err, row) => {
        if (err) {
          console.log(`📤 ⚠️ [PrintServer] Erro na verificação: ${err.message}`);
          resolve(null);
        } else {
          console.log(`📤 [PrintServer] Verificação: ${row ? `id=${row.id}, acao=${row.acao}, status=${row.status}, dadosLen=${row.dadosLen}` : 'NÃO ENCONTRADO!'}`);
          resolve(row);
        }
      });
    });

    if (!verificacao) {
      console.error(`📤 ❌❌❌ [PrintServer] REGISTRO NÃO ENCONTRADO APÓS INSERT! Possível problema no banco.`);
    }

    console.log(`📤 [PrintServer] Impressão: job=${jobId} cliente=${clientId} acao=${acao} status=${jobStatus}`);
    console.log(`📤📤📤 ======================================== FIM ✅\n`);

    // ⭐ ANTI-FLOOD: registra a assinatura desta impressão para deduplicar
    // reenvios idênticos imediatos.
    recentPrints.set(dedupSig, { jobId, status: jobStatus, at: Date.now() });

    res.json({
      success: true,
      jobId: hubResult?.jobId || jobId,
      status: jobStatus,
      dadosSalvos: !!verificacao,
      message: jobStatus === 'queued' ?
      'Impressão registrada e enfileirada' :
      jobStatus === 'sent' ?
      'Impressão enviada para o PrintServer do cliente' :
      'Impressão registrada com sucesso'
    });

  } catch (dbErr) {
    console.error(`📤 ❌ [PrintServer] Erro ao acessar banco:`, dbErr.message);
    console.log(`📤📤📤 ======================================== FIM ❌\n`);

    // ⭐ Mesmo com erro no banco, retorna sucesso parcial se o hub enviou
    res.json({
      success: hubResult ? true : false,
      jobId: hubResult?.jobId || jobId,
      status: hubResult ? hubResult.status : 'error',
      dbError: dbErr.message,
      message: hubResult ?
      'Impressão enviada via WebSocket (erro ao salvar no banco)' :
      'Erro ao salvar impressão no banco de dados'
    });
  }
});

/**
 * GET /api/printserver/jobs
 * Lista jobs de impressão do banco de dados
 * Query params: ?clinicaId=xxx&limit=50&status=queued
 */
router.get('/jobs', async (req, res) => {
  const { clinicaId, limit: limitStr, status: statusFilter } = req.query;

  if (!clinicaId) {
    // Tenta do hub em memória como fallback
    const hub = getHub(req);
    if (hub) {
      const allJobs = [];
      for (const job of hub.printJobs.values()) {
        if (statusFilter && job.status !== statusFilter) continue;
        allJobs.push({
          id: job.id,
          clientId: job.clientId,
          action: job.action,
          status: job.status,
          data: job.data,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          error: job.error
        });
      }
      allJobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const limit = parseInt(limitStr) || 100;
      return res.json({ total: allJobs.length, jobs: allJobs.slice(0, limit) });
    }
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  const limit = parseInt(limitStr) || 100;

  // ⭐⭐⭐ FIX: Garante que a tabela existe antes de consultar ⭐⭐⭐
  await new Promise((resolve) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS printserver (
        id VARCHAR(191) PRIMARY KEY,
        clientId VARCHAR(191),
        acao VARCHAR(50),
        status VARCHAR(50) DEFAULT 'queued',
        dados LONGTEXT,
        clinica VARCHAR(191),
        contrato VARCHAR(191),
        matricula VARCHAR(255),
        dentista_nome VARCHAR(255),
        nome_paciente VARCHAR(255),
        valor VARCHAR(50),
        titulo VARCHAR(255),
        procedimento VARCHAR(255),
        empresa_nome VARCHAR(255),
        login VARCHAR(255),
        clinica_fone VARCHAR(100),
        erro TEXT,
        criadoEm VARCHAR(50) NOT NULL,
        enviadoEm VARCHAR(50),
        completadoEm VARCHAR(50)
      )
    `, () => resolve());
  });

  let sql = `SELECT * FROM printserver`;
  const params = [];

  if (statusFilter) {
    sql += ` WHERE status = ?`;
    params.push(statusFilter);
  }

  sql += ` ORDER BY criadoEm DESC LIMIT ?`;
  params.push(limit);

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(`❌ [PrintServer] Erro ao buscar jobs:`, err.message);
      return res.status(500).json({ error: err.message });
    }

    const jobs = (rows || []).map((row) => {
      let dadosParsed = row.dados;
      try {dadosParsed = JSON.parse(row.dados);} catch (e) {}
      return {
        id: row.id,
        clientId: row.clientId,
        acao: row.acao,
        status: row.status,
        dados: dadosParsed,
        clinica: row.clinica,
        contrato: row.contrato,
        matricula: row.matricula,
        dentista_nome: row.dentista_nome,
        nome_paciente: row.nome_paciente,
        valor: row.valor,
        titulo: row.titulo,
        procedimento: row.procedimento,
        empresa_nome: row.empresa_nome,
        login: row.login,
        clinica_fone: row.clinica_fone,
        criadoEm: row.criadoEm,
        enviadoEm: row.enviadoEm,
        completadoEm: row.completadoEm,
        erro: row.erro
      };
    });

    res.json({
      clinicaId,
      total: jobs.length,
      jobs
    });
  });
});

/**
 * GET /api/printserver/clientes
 * Lista todos os PrintServers conectados (via WebSocket hub)
 */
router.get('/clientes', (req, res) => {
  const hub = getHub(req);
  if (!hub) {
    return res.json({ total: 0, clientes: [], message: 'PrintServer Hub não inicializado (WebSocket)' });
  }

  const clients = hub.getConnectedClients();

  res.json({
    total: clients.length,
    clientes: clients.map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      impressoras: c.printers.length,
      printers: c.printers,
      conectadoEm: c.connectedAt,
      ultimoPing: c.lastPing
    }))
  });
});

/**
 * GET /api/printserver/cliente/:clientId/status
 */
router.get('/cliente/:clientId/status', (req, res) => {
  const hub = getHub(req);
  const { clientId } = req.params;
  const connected = hub ? hub.isClientConnected(clientId) : false;

  res.json({
    clientId,
    connected,
    message: connected ?
    'PrintServer online e pronto para imprimir' :
    'PrintServer offline - cliente precisa abrir o aplicativo'
  });
});

/**
 * GET /api/printserver/cliente/:clientId/jobs
 */
router.get('/cliente/:clientId/jobs', (req, res) => {
  const hub = getHub(req);
  if (!hub) {
    return res.json({ clientId: req.params.clientId, total: 0, jobs: [] });
  }

  const { clientId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const jobs = hub.getClientJobs(clientId, limit);

  res.json({ clientId, total: jobs.length, jobs });
});

/**
 * GET /api/printserver/job/:jobId
 */
router.get('/job/:jobId', (req, res) => {
  const hub = getHub(req);
  if (!hub) {
    return res.status(404).json({ error: 'Job não encontrado (hub offline)' });
  }

  const job = hub.getJobStatus(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job não encontrado' });
  }

  res.json({
    jobId: job.id,
    clientId: job.clientId,
    action: job.action,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    error: job.error
  });
});

/**
 * POST /api/printserver/job/:jobId/impresso
 * Marca um job como "impresso" para não reenviar (evita duplicação)
 */
router.post('/job/:jobId/impresso', (req, res) => {
  const { jobId } = req.params;
  const { clinicaId } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();

  db.run(
    `UPDATE printserver SET status = 'impresso', completadoEm = ? WHERE id = ?`,
    [agora, jobId],
    function (err) {
      if (err) {
        console.error(`❌ [PrintServer] Erro ao marcar job como impresso:`, err.message);
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0 && this.affectedRows === undefined) {
        // Tenta verificar se o job existe
        db.get('SELECT id, status FROM printserver WHERE id = ?', [jobId], (err2, row) => {
          if (!row) {
            return res.status(404).json({ error: 'Job não encontrado' });
          }
          // Job existe mas já estava com outro status — tenta novamente
          res.json({ success: true, jobId, status: 'impresso', message: 'Job já processado anteriormente' });
        });
        return;
      }

      console.log(`✅ [PrintServer] Job ${jobId} marcado como IMPRESSO`);

      // Atualiza no hub em memória também (se disponível)
      const hub = getHub(req);
      if (hub) {
        const job = hub.printJobs.get(jobId);
        if (job) {
          job.status = 'impresso';
          job.completedAt = new Date();
        }
      }

      res.json({
        success: true,
        jobId,
        status: 'impresso',
        completadoEm: agora,
        message: 'Job marcado como impresso — não será reenviado'
      });
    }
  );
});

/**
 * POST /api/printserver/jobs/impresso
 * Marca MÚLTIPLOS jobs como "impresso" de uma vez (batch)
 * Body: { clinicaId: "xxx", jobIds: ["id1", "id2", ...] }
 */
router.post('/jobs/impresso', (req, res) => {
  const { clinicaId, jobIds } = req.body;

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
    return res.status(400).json({ error: 'jobIds deve ser um array não vazio' });
  }

  const db = getClinicaDB(clinicaId);
  const agora = new Date().toISOString();
  const placeholders = jobIds.map(() => '?').join(',');

  db.run(
    `UPDATE printserver SET status = 'impresso', completadoEm = ? WHERE id IN (${placeholders})`,
    [agora, ...jobIds],
    function (err) {
      if (err) {
        console.error(`❌ [PrintServer] Erro ao marcar jobs em batch:`, err.message);
        return res.status(500).json({ error: err.message });
      }

      const atualizados = this.changes || this.affectedRows || 0;
      console.log(`✅ [PrintServer] ${atualizados} job(s) marcado(s) como IMPRESSO (batch)`);

      // Atualiza no hub em memória
      const hub = getHub(req);
      if (hub) {
        for (const id of jobIds) {
          const job = hub.printJobs.get(id);
          if (job) {
            job.status = 'impresso';
            job.completedAt = new Date();
          }
        }
      }

      res.json({
        success: true,
        atualizados,
        total: jobIds.length,
        status: 'impresso',
        message: `${atualizados} job(s) marcado(s) como impresso`
      });
    }
  );
});

/**
 * GET /api/printserver/jobs/pendentes
 * Lista APENAS jobs que ainda NÃO foram impressos (status != 'impresso')
 * Útil para o PrintServer cliente buscar o que precisa imprimir sem duplicar
 * Query: ?clinicaId=xxx&clientId=yyy&limit=50
 */
router.get('/jobs/pendentes', async (req, res) => {
  const { clinicaId, clientId, limit: limitStr } = req.query;

  // Log silenciado — polling frequente gerava ruído excessivo

  if (!clinicaId) {
    return res.status(400).json({ error: 'clinicaId é obrigatório' });
  }

  const db = getClinicaDB(clinicaId);
  const limit = parseInt(limitStr) || 100;

  // ⭐⭐⭐ FIX: Garante que a tabela existe antes de consultar ⭐⭐⭐
  await new Promise((resolve) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS printserver (
        id VARCHAR(191) PRIMARY KEY,
        clientId VARCHAR(191),
        acao VARCHAR(50),
        status VARCHAR(50) DEFAULT 'queued',
        dados LONGTEXT,
        clinica VARCHAR(191),
        contrato VARCHAR(191),
        matricula VARCHAR(255),
        dentista_nome VARCHAR(255),
        nome_paciente VARCHAR(255),
        valor VARCHAR(50),
        titulo VARCHAR(255),
        procedimento VARCHAR(255),
        empresa_nome VARCHAR(255),
        login VARCHAR(255),
        clinica_fone VARCHAR(100),
        erro TEXT,
        criadoEm VARCHAR(50) NOT NULL,
        enviadoEm VARCHAR(50),
        completadoEm VARCHAR(50)
      )
    `, () => resolve());
  });

  let sql = `SELECT * FROM printserver WHERE status != 'impresso'`;
  const params = [];

  if (clientId) {
    sql += ` AND clientId = ?`;
    params.push(clientId);
  }

  sql += ` ORDER BY criadoEm DESC LIMIT ?`;
  params.push(limit);

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(`🔍 ❌ [PrintServer] Erro ao buscar jobs pendentes:`, err.message);
      return res.status(500).json({ error: err.message });
    }

    const jobs = (rows || []).map((row) => {
      let dadosParsed = row.dados;

      // ⭐⭐⭐ FIX: Log detalhado quando dados está vazio ⭐⭐⭐
      if (!row.dados) {
        console.log(`🔍 ⚠️ [PrintServer] Job ${row.id} tem dados NULO/VAZIO! acao=${row.acao}, criadoEm=${row.criadoEm}`);
      }

      try {
        if (row.dados) {
          dadosParsed = JSON.parse(row.dados);
        }
      } catch (e) {
        console.log(`🔍 ⚠️ [PrintServer] Job ${row.id} erro ao parsear dados: ${e.message}`);
      }

      return {
        id: row.id,
        clientId: row.clientId,
        acao: row.acao,
        status: row.status,
        dados: dadosParsed,
        clinica: row.clinica,
        contrato: row.contrato,
        matricula: row.matricula,
        dentista_nome: row.dentista_nome,
        nome_paciente: row.nome_paciente,
        valor: row.valor,
        titulo: row.titulo,
        procedimento: row.procedimento,
        empresa_nome: row.empresa_nome,
        criadoEm: row.criadoEm
      };
    });

    // ⭐ Log resumo dos jobs retornados
    if (jobs.length > 0) {
      jobs.forEach((j) => {
        console.log(`🔍 [PrintServer]   → Job ${j.id}: acao=${j.acao}, paciente=${j.nome_paciente || '?'}, dados=${j.dados ? Array.isArray(j.dados) ? `Array[${j.dados.length}]` : 'Object' : 'VAZIO'}`);
      });
    } else {






      // Logs de "nenhum job pendente" silenciados — polling frequente
    }res.json({ clinicaId, total: jobs.length, jobs });
  });
});

/**
 * GET /api/printserver/stats
 */
router.get('/stats', (req, res) => {
  const hub = getHub(req);
  if (hub) {
    return res.json(hub.getStats());
  }
  res.json({
    clientesConectados: 0,
    totalJobs: 0,
    message: 'Hub WebSocket não inicializado - jobs persistidos no banco MySQL'
  });
});

module.exports = router;