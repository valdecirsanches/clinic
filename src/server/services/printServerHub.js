/**
 * ============================================
 * WEBSOCKET HUB - PrintServer
 * ============================================
 * Gerencia comunicação entre o ERP e os PrintServers
 * instalados nas máquinas dos clientes.
 *
 * ARQUITETURA:
 *   [EasyClin API] ---> [WebSocket Hub] <--- [PrintServer Cliente A]
 *                                       <--- [PrintServer Cliente B]
 */

const WebSocket = require('ws');
const { parse } = require('url');

// ============================================
// CLASSE PRINCIPAL
// ============================================

class PrintServerHub {
  constructor(server, options = {}) {
    this.clients = new Map(); // id -> client object
    this.printJobs = new Map(); // jobId -> job object
    this.pendingJobs = new Map(); // clientId -> [jobs] (fila para offline)
    this.maxJobHistory = options.maxJobHistory || 500;
    this.authToken = options.authToken || process.env.PRINTSERVER_TOKEN || null;

    // Cria WebSocket Server anexado ao HTTP server existente
    this.wss = new WebSocket.Server({
      server,
      path: '/printserver',
      verifyClient: (info, cb) => {
        // Autenticação opcional via token na query string
        if (this.authToken) {
          const url = parse(info.req.url || '', true);
          const token = url.query.token;
          if (token !== this.authToken) {
            console.log('[PrintServerHub] ❌ Token inválido - conexão rejeitada');
            cb(false, 401, 'Token inválido');
            return;
          }
        }
        cb(true);
      }
    });

    this.wss.on('connection', this._handleConnection.bind(this));

    // Ping/pong para manter conexões vivas
    this._pingInterval = setInterval(() => this._pingClients(), 30000);

    // Limpar jobs antigos a cada 5 minutos
    this._cleanupInterval = setInterval(() => this._cleanupOldJobs(), 300000);

    console.log('[PrintServerHub] ✅ WebSocket Hub iniciado em /printserver');
    if (this.authToken) {
      console.log('[PrintServerHub] 🔒 Autenticação por token ATIVADA');
    }
  }

  // ============================================
  // CONEXÃO DE NOVOS PRINTSERVERS
  // ============================================

  _handleConnection(ws, request) {
    const url = parse(request.url || '', true);
    const clientId = url.query.clientId;

    if (!clientId) {
      ws.close(4001, 'clientId obrigatório na query string');
      return;
    }

    console.log(`[PrintServerHub] 🖨️ Novo PrintServer conectado: ${clientId}`);

    // Remove conexão antiga se existir (reconexão)
    const existing = this._getClientByClientId(clientId);
    if (existing) {
      console.log(`[PrintServerHub] ♻️ Reconexão de ${clientId} - fechando conexão antiga`);
      try {existing.ws.close(4000, 'Nova conexão');} catch (e) {}
      this.clients.delete(existing.id);
    }

    const client = {
      id: this._generateId(),
      ws,
      clientId,
      clientName: clientId,
      printers: [],
      connectedAt: new Date(),
      lastPing: new Date(),
      printerConfig: {}
    };

    this.clients.set(client.id, client);

    // Handlers
    ws.on('message', (data) => this._handleMessage(client, data.toString()));
    ws.on('close', () => this._handleDisconnect(client));
    ws.on('error', (err) => console.error(`[PrintServerHub] ❌ Erro ${clientId}:`, err.message));
    ws.on('pong', () => {client.lastPing = new Date();});

    // Confirmação
    this._send(ws, {
      type: 'connected',
      message: 'Conectado ao servidor EasyClin',
      clientId
    });

    // Envia jobs pendentes (fila)
    this._flushPendingJobs(clientId);
  }

  // ============================================
  // MENSAGENS DO PRINTSERVER
  // ============================================

  _handleMessage(client, raw) {
    try {
      const message = JSON.parse(raw);

      switch (message.type) {
        case 'register':
          client.clientName = message.clientName || client.clientId;
          client.printers = message.printers || [];
          client.printerConfig = message.printerConfig || {};
          console.log(`[PrintServerHub] 📋 ${client.clientId} registrado: "${client.clientName}" com ${client.printers.length} impressora(s)`);
          if (client.printers.length > 0) {
            client.printers.forEach((p) => {
              console.log(`   🖨️ ${p.displayName || p.name}${p.isDefault ? ' (padrão)' : ''}`);
            });
          }
          break;

        case 'print_result':
          const job = this.printJobs.get(message.jobId);
          if (job) {
            job.status = message.success ? 'success' : 'error';
            job.error = message.error || null;
            job.completedAt = new Date();
            console.log(`[PrintServerHub] ${message.success ? '✅' : '❌'} Job ${message.jobId}: ${job.status}${job.error ? ' - ' + job.error : ''}`);
          }
          break;

        case 'pong':
          client.lastPing = new Date();
          break;

        default:
          console.log(`[PrintServerHub] ❓ Mensagem desconhecida de ${client.clientId}:`, message.type);
      }
    } catch (err) {
      console.error(`[PrintServerHub] ❌ Erro ao processar mensagem de ${client.clientId}:`, err.message);
    }
  }

  // ============================================
  // DESCONEXÃO
  // ============================================

  _handleDisconnect(client) {
    console.log(`[PrintServerHub] 🔌 PrintServer desconectado: ${client.clientId}`);
    this.clients.delete(client.id);
  }

  // ============================================
  // MÉTODOS PÚBLICOS - USE NO SEU ERP
  // ============================================

  /**
   * Envia comando de impressão para um PrintServer
   * @param {string} clientId - ID do cliente
   * @param {Array} printData - Array de objetos com dados OU array de strings XML-tag
   * @param {Object} options - { enqueue: true } para enfileirar se offline
   * @returns {{ jobId: string, status: string } | null}
   */
  print(clientId, printData, options = {}) {
    const { enqueue = false } = options;

    // Detecta se é array de strings (formato XML-tag) ou array de objetos
    const isStringArray = printData.length > 0 && typeof printData[0] === 'string';

    // Extrai a AÇÃO
    let action = 'UNKNOWN';
    if (isStringArray) {
      // Formato XML-tag: "<acao>RECIBO</acao>"
      const acaoStr = printData.find((s) => s.toLowerCase().includes('<acao>'));
      if (acaoStr) {
        const match = acaoStr.match(/<acao>(.*?)<\/acao>/i);
        if (match) action = match[1];
      }
    } else {
      const actionObj = printData.find((obj) => obj.ACAO);
      action = actionObj ? actionObj.ACAO : 'UNKNOWN';
    }

    // Cria o job
    const job = {
      id: this._generateId(),
      clientId,
      action,
      data: isStringArray ? printData : this._arrayToObject(printData),
      rawData: printData,
      status: 'pending',
      createdAt: new Date(),
      completedAt: null,
      error: null
    };

    this.printJobs.set(job.id, job);

    const client = this._getClientByClientId(clientId);

    if (!client) {
      if (enqueue) {
        // Enfileira para quando o cliente reconectar
        if (!this.pendingJobs.has(clientId)) {
          this.pendingJobs.set(clientId, []);
        }
        this.pendingJobs.get(clientId).push(job);
        job.status = 'queued';
        console.log(`[PrintServerHub] 📥 Job ${job.id} enfileirado para ${clientId} (${action}) - cliente offline`);
        return { jobId: job.id, status: 'queued' };
      }

      console.error(`[PrintServerHub] ❌ Cliente ${clientId} não conectado`);
      job.status = 'error';
      job.error = 'PrintServer não conectado';
      return null;
    }

    // Envia para o PrintServer
    this._send(client.ws, {
      type: 'print',
      jobId: job.id,
      action,
      data: job.data
    });

    job.status = 'sent';
    console.log(`[PrintServerHub] 📤 Job ${job.id} enviado para ${clientId} (${action})`);

    return { jobId: job.id, status: 'sent' };
  }

  /**
   * Lista todos os PrintServers conectados
   */
  getConnectedClients() {
    return Array.from(this.clients.values()).map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      printers: c.printers,
      connectedAt: c.connectedAt,
      lastPing: c.lastPing
    }));
  }

  /**
   * Verifica se um cliente está conectado
   */
  isClientConnected(clientId) {
    return !!this._getClientByClientId(clientId);
  }

  /**
   * Obtém status de um job
   */
  getJobStatus(jobId) {
    return this.printJobs.get(jobId) || null;
  }

  /**
   * Lista jobs de um cliente
   */
  getClientJobs(clientId, limit = 50) {
    const jobs = [];
    for (const job of this.printJobs.values()) {
      if (job.clientId === clientId) {
        jobs.push(job);
      }
    }
    return jobs.
    sort((a, b) => b.createdAt - a.createdAt).
    slice(0, limit).
    map((j) => ({
      id: j.id,
      action: j.action,
      status: j.status,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
      error: j.error
    }));
  }

  /**
   * Retorna estatísticas do hub
   */
  getStats() {
    let pending = 0,sent = 0,success = 0,error = 0,queued = 0;
    for (const job of this.printJobs.values()) {
      switch (job.status) {
        case 'pending':pending++;break;
        case 'sent':sent++;break;
        case 'success':success++;break;
        case 'error':error++;break;
        case 'queued':queued++;break;
      }
    }

    let totalPending = 0;
    for (const jobs of this.pendingJobs.values()) {
      totalPending += jobs.length;
    }

    return {
      clientesConectados: this.clients.size,
      totalJobs: this.printJobs.size,
      jobsPendentes: pending,
      jobsEnviados: sent,
      jobsSucesso: success,
      jobsErro: error,
      jobsNaFila: totalPending
    };
  }

  // ============================================
  // FILA DE JOBS PENDENTES
  // ============================================

  _flushPendingJobs(clientId) {
    const pending = this.pendingJobs.get(clientId);
    if (!pending || pending.length === 0) return;

    const client = this._getClientByClientId(clientId);
    if (!client) return;

    console.log(`[PrintServerHub] 📬 Enviando ${pending.length} job(s) pendente(s) para ${clientId}`);

    for (const job of pending) {
      this._send(client.ws, {
        type: 'print',
        jobId: job.id,
        action: job.action,
        data: job.data
      });
      job.status = 'sent';
      console.log(`[PrintServerHub] 📤 Job pendente ${job.id} enviado (${job.action})`);
    }

    this.pendingJobs.delete(clientId);
  }

  // ============================================
  // UTILIDADES
  // ============================================

  _getClientByClientId(clientId) {
    for (const client of this.clients.values()) {
      if (client.clientId === clientId) return client;
    }
    return null;
  }

  _send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  _pingClients() {
    const now = Date.now();
    for (const [id, client] of this.clients) {
      if (now - client.lastPing.getTime() > 60000) {
        console.log(`[PrintServerHub] ⏰ Removendo cliente inativo: ${client.clientId}`);
        try {client.ws.terminate();} catch (e) {}
        this.clients.delete(id);
        continue;
      }
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }

  _cleanupOldJobs() {
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    const now = Date.now();
    let removed = 0;

    for (const [id, job] of this.printJobs) {
      if (now - job.createdAt.getTime() > maxAge) {
        this.printJobs.delete(id);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[PrintServerHub] 🧹 ${removed} job(s) antigo(s) removido(s)`);
    }
  }

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
  }

  _arrayToObject(arr) {
    return arr.reduce((acc, obj) => ({ ...acc, ...obj }), {});
  }

  /**
   * Encerra o hub (para shutdown graceful)
   */
  shutdown() {
    clearInterval(this._pingInterval);
    clearInterval(this._cleanupInterval);
    for (const client of this.clients.values()) {
      try {client.ws.close(1001, 'Servidor encerrando');} catch (e) {}
    }
    this.clients.clear();
    console.log('[PrintServerHub] 🛑 Hub encerrado');
  }
}

module.exports = { PrintServerHub };