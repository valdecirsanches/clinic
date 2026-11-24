'use strict';
/**
 * Evolution API (v2) como alternativa ao WAHA, clínica a clínica.
 *
 * Mesmo desenho do Inno: o sistema continua "falando WAHA" em todo lugar e
 * este módulo traduz. O fetch do WhatsApp (whatsapp-shared.js) passa por
 * `comEvolution(fetch)`: quando o pedido é para o WAHA e a sessão pertence a
 * uma clínica que escolheu a Evolution, o pedido vai para a Evolution e a
 * resposta volta no formato do WAHA. Nos outros casos o fetch segue intacto.
 * No webhook, `eventoComoWaha` faz o caminho inverso (evento da Evolution →
 * evento "message" do WAHA).
 *
 * O servidor vem do .env (o mesmo para todas as clínicas):
 *   EVOLUTION_URL, EVOLUTION_API_KEY e, opcional, EVOLUTION_WEBHOOK_URL
 * A instância na Evolution tem o nome da sessão da clínica (whatsapp_config.sessionName).
 * A escolha fica em whatsapp_config.servidorWhatsapp ('waha' | 'evolution').
 */

const EVOLUTION = 'evolution';
const WAHA = 'waha';

const limpa = (v) => String(v || '').trim().replace(/^['"]|['"]$/g, '');
const ehObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function servidor() {
  // mesmos nomes aceitos no Fácil e no Inno
  const url = limpa(process.env.EVOLUTION_URL || process.env.EVOLUTION_API_URL || process.env.EVOLUTION_SERVER_URL).replace(/\/+$/, '');
  const chave = limpa(process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_APIKEY || process.env.EVOLUTION_KEY);
  return { url: url && !/^https?:\/\//i.test(url) ? `https://${url}` : url, chave };
}
const disponivel = () => Boolean(servidor().url);
const comProtocolo = (u) => (u && !/^https?:\/\//i.test(u) ? `https://${u}` : u);

/**
 * Endereço do WAHA no .env.local (WAHA_URL). Com ele, vale para todas as
 * clínicas e o endereço gravado na clínica é ignorado (como no Inno); sem ele,
 * vale o gravado na clínica.
 */
const wahaUrlDoEnv = () => comProtocolo(limpa(process.env.WAHA_URL).replace(/\/+$/, ''));

/**
 * URL do webhook (para onde o servidor do WhatsApp manda as respostas), do
 * .env.local: EVOLUTION_WEBHOOK_URL na Evolution, WAHA_WEBHOOK_URL no WAHA
 * (WHATSAPP_WEBHOOK_URL vale para os dois). Vazio: a rota monta pelo endereço da API.
 */
function webhookUrlDoEnv(servidorEscolhido = WAHA) {
  const nomes = servidorEscolhido === EVOLUTION ?
    ['EVOLUTION_WEBHOOK_URL', 'WHATSAPP_WEBHOOK_URL', 'WAHA_WEBHOOK_URL'] :
    ['WAHA_WEBHOOK_URL', 'WHATSAPP_WEBHOOK_URL'];
  for (const n of nomes) {
    const v = limpa(process.env[n]);
    if (v) return v;
  }
  return '';
}
const webhookDoEnv = () => webhookUrlDoEnv(EVOLUTION);
const normalizaServidor = (v) => (String(v || '').toLowerCase() === EVOLUTION ? EVOLUTION : WAHA);

// ------------------------------------------------------------ sessão → servidor
// O resolvedor (whatsapp-shared.js) diz qual servidor a clínica da sessão usa.
let resolvedor = null;
const cache = new Map(); // sessão → { servidor, em }
const CACHE_TTL = 60 * 1000;

function definirResolvedor(fn) { resolvedor = fn; }
/** grava na memória o servidor de uma sessão que ainda não está no banco (ex.: criação) */
function lembrarSessao(sessao, servidorEscolhido) {
  if (sessao) cache.set(String(sessao), { servidor: normalizaServidor(servidorEscolhido), em: Date.now() });
}
function limparCache() { cache.clear(); }

async function servidorDaSessao(sessao) {
  const s = String(sessao || '').trim();
  if (!s) return WAHA;
  const c = cache.get(s);
  if (c && Date.now() - c.em < CACHE_TTL) return c.servidor;
  let escolhido = WAHA;
  try {
    if (resolvedor) escolhido = normalizaServidor(await resolvedor(s));
  } catch (e) {
    // sem banco: fica no WAHA, que é o padrão
  }
  cache.set(s, { servidor: escolhido, em: Date.now() });
  return escolhido;
}

// ------------------------------------------------------- resposta tipo fetch()
class RespostaLocal {
  constructor(status, corpo, tipo = 'application/json') {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.statusText = this.ok ? 'OK' : 'Error';
    this.url = '';
    this.evolution = true;
    this._buf = Buffer.isBuffer(corpo) ? corpo : Buffer.from(typeof corpo === 'string' ? corpo : JSON.stringify(corpo ?? {}), 'utf8');
    const cabecalhos = { 'content-type': tipo, 'content-length': String(this._buf.length) };
    this.headers = {
      get: (k) => cabecalhos[String(k).toLowerCase()] ?? null,
      has: (k) => String(k).toLowerCase() in cabecalhos,
      forEach: (fn) => Object.entries(cabecalhos).forEach(([k, v]) => fn(v, k)),
      raw: () => Object.fromEntries(Object.entries(cabecalhos).map(([k, v]) => [k, [v]]))
    };
  }
  async text() { return this._buf.toString('utf8'); }
  async json() { return JSON.parse(this._buf.toString('utf8')); }
  async buffer() { return this._buf; }
  async arrayBuffer() { return this._buf.buffer.slice(this._buf.byteOffset, this._buf.byteOffset + this._buf.byteLength); }
  clone() { return new RespostaLocal(this.status, this._buf, this.headers.get('content-type')); }
}
const json = (status, corpo) => new RespostaLocal(status, corpo);

// --------------------------------------------------------- números e chatIds
const digitos = (v) => String(v || '').split('@')[0].replace(/\D/g, '');
/** chatId do WAHA (55...@c.us) → "number" da Evolution (dígitos; @lid e @g.us vão inteiros) */
function numeroEvolution(chatId) {
  const s = String(chatId || '').trim();
  if (/@(lid|g\.us|broadcast)$/.test(s)) return s;
  return digitos(s);
}
/** jid da Evolution (55...@s.whatsapp.net) → chatId do WAHA (55...@c.us) */
function jidParaWaha(jid) {
  const s = String(jid || '');
  if (!s) return '';
  if (s.endsWith('@s.whatsapp.net')) return s.replace('@s.whatsapp.net', '@c.us');
  if (!s.includes('@')) return `${digitos(s)}@c.us`;
  return s;
}
const ehTelefoneJid = (v) => typeof v === 'string' && /^\d{10,15}(@s\.whatsapp\.net|@c\.us)?$/.test(v);

// ------------------------------------------------- pedido WAHA → operação
function lerCorpo(init) {
  const b = init && init.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b) || {}; } catch (e) { return {}; } }
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8')) || {}; } catch (e) { return {}; } }
  return ehObj(b) ? b : {};
}

const ENVIOS = ['sendText', 'sendImage', 'sendFile', 'sendVoice', 'sendVideo', 'sendLocation', 'sendSeen', 'startTyping', 'stopTyping'];
const ACOES = ['start', 'stop', 'restart', 'logout'];
const MIDIA = ['media', 'download', 'download-media'];

/**
 * Entende um pedido feito ao WAHA. Devolve { sessao, op, ... } ou null quando
 * não é um pedido do WAHA com sessão conhecida (listagens, health, outros sites).
 */
function interpretar(url, init = {}) {
  let u;
  try { u = new URL(String(url)); } catch (e) { return null; }
  const i = u.pathname.indexOf('/api/');
  if (i < 0) return null;
  const seg = u.pathname.slice(i + 5).split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch (e) { return s; } });
  if (!seg.length) return null;
  const metodo = String(init.method || 'GET').toUpperCase();
  const q = (k) => u.searchParams.get(k) || '';
  const corpo = lerCorpo(init);
  const p = (op, sessao, extra = {}) => (sessao ? { op, sessao: String(sessao), corpo, metodo, ...extra } : null);
  const [a, b, c, d] = seg;

  // envios: /api/sendText, /api/{sessão}/chatting/sendFile
  if (seg.length === 1 && ENVIOS.includes(a) && metodo === 'POST') return p(a, corpo.session);
  if (seg.length === 3 && b === 'chatting' && ENVIOS.includes(c)) return p(c, a);

  // sessões
  if (a === 'sessions') {
    if (seg.length === 1) return metodo === 'POST' ? p('criar', corpo.name) : null; // listagem: segue para o WAHA
    if (seg.length === 2 && ACOES.includes(b) && metodo === 'POST') return p(b, corpo.name || corpo.session);
    if (seg.length === 2) {
      if (metodo === 'GET') return p('info', b);
      if (metodo === 'PUT' || metodo === 'PATCH') return p('configurar', b, { config: ehObj(corpo.config) ? corpo.config : {} });
      if (metodo === 'DELETE') return p('apagar', b);
      return null;
    }
    if (seg.length === 3 && ACOES.includes(c)) return p(c, b);
    if (seg.length === 3 && c === 'send-message') return p('legado', b);
    if (seg.length === 3 && c === 'config') return p('configurar', b, { config: corpo });
    if (seg.length === 3 && c === 'webhooks') return p('configurar', b, { config: { webhooks: [corpo] } });
    if (seg.length === 3 && c === 'me') return p('me', b);
    if (seg.length === 3 && ['qr', 'screenshot'].includes(c)) return p('qr', b);
    if (seg.length === 4 && c === 'auth' && d === 'qr') return p('qr', b);
    if (seg.length === 5 && c === 'messages' && MIDIA.includes(seg[4])) return p('midia', b, { messageId: d });
    if (seg.length === 4 && c === 'messages' && d === 'download') return p('midia', b, { messageId: corpo.messageId });
    if (seg.length === 3 && c === 'getMessageMedia') return p('midia', b, { messageId: corpo.messageId });
    return null;
  }
  if (a === 'webhook' && seg.length === 1 && corpo.session) return p('configurar', corpo.session, { config: { webhooks: [corpo] } });
  if (a === 'auth' && b === 'qr') return p('qr', q('session'));
  if (a === 'contacts') {
    if (b === 'check-exists') return p('existe', q('session'), { telefone: q('phone') });
    if (b === 'profile-picture') return p('foto', q('session'), { contato: q('contactId') });
    if (seg.length === 1 && metodo === 'GET') return p('contato', q('session'), { contato: q('contactId') });
    return null;
  }
  if (a === 'chatting' && b === 'getMedia') return p('midia', corpo.session, { messageId: corpo.messageId });
  if (a === 'messages' && b === 'download') return p('midia', corpo.session, { messageId: corpo.messageId });
  if (a === 'files' && seg.length === 3) return p('midia', b, { messageId: c.replace(/\.[a-z0-9]+$/i, '') });

  // rotas com a sessão no começo: /api/{sessão}/...
  if (seg.length === 2 && b === 'status') return p('info', a);
  if (seg.length === 2 && b === 'qr') return p('qr', a);
  if (seg.length === 3 && b === 'auth' && c === 'qr') return p('qr', a);
  if (seg.length === 3 && b === 'lids') return p('lid', a, { lid: c });
  if (seg.length === 3 && b === 'contacts' && c === 'profile-picture') return p('foto', a, { contato: q('contactId') });
  if (seg.length === 4 && b === 'messages' && MIDIA.includes(d)) return p('midia', a, { messageId: c });
  if (seg.length === 3 && b === 'chatting' && c === 'getMedia') return p('midia', a, { messageId: corpo.messageId });
  return null;
}

// --------------------------------------------------------------- Evolution
const TEMPO_PADRAO_MS = 15000; // consultas (como no Fácil)
const TEMPO_ENVIO_MS = 60000; // envios e mídia
const TEMPO_WAHA_MS = 20000; // consultas ao WAHA sem limite próprio
const MAPA_STATUS = { open: 'WORKING', connecting: 'SCAN_QR_CODE', close: 'STOPPED', closed: 'STOPPED', refused: 'FAILED' };
const EVENTOS_WAHA = ['message', 'message.any', 'session.status'];

class Evolution {
  constructor(sessao, fetchBase) {
    const s = servidor();
    this.url = s.url;
    this.chave = s.chave;
    this.sessao = String(sessao || '').trim();
    this.fetch = fetchBase;
  }

  get inst() { return encodeURIComponent(this.sessao); }

  /**
   * [status, dados]; lança só em falha de rede ou tempo esgotado (como o fetch).
   * Toda chamada tem limite de tempo (como no Fácil): sem ele, uma Evolution
   * fora do ar deixava a tela esperando para sempre.
   */
  async chama(metodo, caminho, corpo = null, sinal = undefined, tempoMs = TEMPO_PADRAO_MS) {
    const headers = { Accept: 'application/json', apikey: this.chave };
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), tempoMs);
    if (sinal) {
      if (sinal.aborted) controle.abort();
      else sinal.addEventListener('abort', () => controle.abort(), { once: true });
    }
    const opcoes = { method: metodo, headers, signal: controle.signal };
    if (corpo !== null) {
      headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }
    let r;
    let texto;
    try {
      r = await this.fetch(`${this.url}${caminho}`, opcoes);
      texto = await r.text().catch(() => '');
    } catch (e) {
      if (controle.signal.aborted) {
        const erro = new Error(`A Evolution API (${this.url}) não respondeu em ${Math.round(tempoMs / 1000)}s.`);
        erro.name = 'AbortError';
        erro.type = 'aborted';
        throw erro;
      }
      throw e;
    } finally {
      clearTimeout(relogio);
    }
    let dados;
    try { dados = texto ? JSON.parse(texto) : {}; } catch (e) { dados = { raw: texto.slice(0, 500) }; }
    return [r.status, dados];
  }

  static erro(st, d) {
    if (!ehObj(d)) return `HTTP ${st}`;
    const msg = ehObj(d.response) ? d.response.message : null;
    if (Array.isArray(msg)) return msg.map((m) => (ehObj(m) ? JSON.stringify(m) : String(m))).join('; ');
    return msg || d.message || d.error || `HTTP ${st}`;
  }

  /** 'open' | 'connecting' | 'close' | 'inexistente' | 'recusada' | 'erro' */
  async estado(sinal) {
    const [st, d] = await this.chama('GET', `/instance/connectionState/${this.inst}`, null, sinal);
    if (st === 404) return 'inexistente';
    if (st === 401 || st === 403) return 'recusada';
    if (st >= 400) return 'erro';
    const inst = ehObj(d) && ehObj(d.instance) ? d.instance : {};
    return String(inst.state || (ehObj(d) && d.state) || inst.status || 'close').toLowerCase();
  }

  /** resposta pronta para os estados que impedem a operação; null se pode seguir */
  static respostaDoEstado(e, sessao) {
    if (e === 'inexistente') return json(404, { error: `A instância "${sessao}" não existe na Evolution API.`, statusCode: 404 });
    if (e === 'recusada') return json(401, { error: 'A Evolution API recusou a chave (EVOLUTION_API_KEY).', statusCode: 401, message: 'Unauthorized' });
    if (e === 'erro') return json(502, { error: 'A Evolution API não respondeu como esperado.' });
    return null;
  }

  async me() {
    try {
      const [st, d] = await this.chama('GET', `/instance/fetchInstances?instanceName=${this.inst}`);
      if (st >= 400) return null;
      const lista = Array.isArray(d) ? d : [d];
      const x = lista.map((i) => (ehObj(i) && ehObj(i.instance) ? i.instance : i)).find((i) => ehObj(i) && (i.name || i.instanceName) === this.sessao) || lista[0];
      if (!ehObj(x)) return null;
      const dono = x.ownerJid || x.owner || (x.number ? `${digitos(x.number)}@s.whatsapp.net` : '');
      return dono ? { id: jidParaWaha(dono), pushName: x.profileName || '' } : null;
    } catch (e) {
      return null;
    }
  }

  async webhookAtual() {
    try {
      const [st, d] = await this.chama('GET', `/webhook/find/${this.inst}`);
      if (st >= 400 || !ehObj(d)) return null;
      const w = ehObj(d.webhook) ? d.webhook : d;
      return { url: w.url || '', enabled: Boolean(w.enabled), events: Array.isArray(w.events) ? w.events : [] };
    } catch (e) {
      return null;
    }
  }

  async gravaWebhook(url) {
    const destino = webhookDoEnv() || url;
    if (!destino) return false;
    const eventos = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'];
    let [st] = await this.chama('POST', `/webhook/set/${this.inst}`, {
      webhook: { enabled: true, url: destino, byEvents: false, webhookByEvents: false, base64: true, webhookBase64: true, events: eventos }
    });
    if (st < 400) return true;
    // Evolution v1
    [st] = await this.chama('POST', `/webhook/set/${this.inst}`, { url: destino, enabled: true, webhook_by_events: false, webhook_base64: true, events: eventos });
    return st < 400;
  }

  /** a sessão no formato do GET /api/sessions/{sessão} do WAHA */
  async info(sinal) {
    const e = await this.estado(sinal);
    const parada = Evolution.respostaDoEstado(e, this.sessao);
    if (parada) return parada;
    const status = MAPA_STATUS[e] || 'STOPPED';
    const w = await this.webhookAtual();
    const webhooks = w && w.enabled && w.url && w.events.some((x) => /MESSAGES_UPSERT/i.test(String(x))) ?
      [{ url: w.url, events: EVENTOS_WAHA }] : [];
    return json(200, {
      name: this.sessao,
      status,
      me: status === 'WORKING' ? await this.me() : null,
      engine: { engine: 'EVOLUTION' },
      servidor: EVOLUTION,
      config: { webhooks }
    });
  }

  async criar(config = {}) {
    const ganchos = ehObj(config) && Array.isArray(config.webhooks) ? config.webhooks : [];
    const [st, d] = await this.chama('POST', '/instance/create', { instanceName: this.sessao, qrcode: true, integration: 'WHATSAPP-BAILEYS' });
    if (st >= 400) {
      const msg = Evolution.erro(st, d);
      // a Evolution responde 403 "This name ... is already in use" quando a instância já existe
      if (/already|in use|exist/i.test(JSON.stringify(d))) return json(422, { error: `Session "${this.sessao}" already exists`, detalhe: msg });
      if (st === 401 || st === 403) return json(401, { error: 'A Evolution API recusou a chave (EVOLUTION_API_KEY).' });
      return json(st, { error: msg });
    }
    if (ganchos[0] && ganchos[0].url) await this.gravaWebhook(ganchos[0].url).catch(() => false);
    return json(201, { name: this.sessao, status: 'SCAN_QR_CODE', servidor: EVOLUTION });
  }

  async iniciar() {
    const e = await this.estado();
    const parada = Evolution.respostaDoEstado(e, this.sessao);
    if (parada) return parada; // iniciar nunca cria (igual ao WAHA)
    if (e === 'open') return json(201, { name: this.sessao, status: 'WORKING' });
    const [st, d] = await this.chama('GET', `/instance/connect/${this.inst}`);
    if (st >= 400) return json(st, { error: Evolution.erro(st, d) });
    return json(201, { name: this.sessao, status: 'SCAN_QR_CODE' });
  }

  /** a Evolution não tem "parar" sem desconectar: a instância continua como está */
  async parar() {
    const e = await this.estado();
    const parada = Evolution.respostaDoEstado(e, this.sessao);
    if (parada) return parada;
    return json(201, { name: this.sessao, status: MAPA_STATUS[e] || 'STOPPED', aviso: 'A Evolution API não tem "parar"; a instância foi mantida.' });
  }

  async reiniciar() {
    let [st, d] = await this.chama('POST', `/instance/restart/${this.inst}`, {});
    if (st === 404 && /not.*exist|não existe/i.test(JSON.stringify(d))) return Evolution.respostaDoEstado('inexistente', this.sessao);
    if (st === 404 || st === 405) [st, d] = await this.chama('PUT', `/instance/restart/${this.inst}`, {});
    if (st >= 400) return this.iniciar();
    return json(201, { name: this.sessao, status: 'STARTING' });
  }

  async logout() {
    const [st, d] = await this.chama('DELETE', `/instance/logout/${this.inst}`);
    if (st === 404) return Evolution.respostaDoEstado('inexistente', this.sessao);
    if (st >= 400 && !/not connected|close/i.test(JSON.stringify(d))) return json(st, { error: Evolution.erro(st, d) });
    return json(201, { name: this.sessao, status: 'STOPPED' });
  }

  async apagar() {
    const [st, d] = await this.chama('DELETE', `/instance/delete/${this.inst}`);
    if (st >= 400) return json(st, { error: Evolution.erro(st, d) });
    return json(200, { name: this.sessao, deleted: true });
  }

  /** PUT/PATCH da sessão: da configuração só os webhooks valem na Evolution */
  async configurar(config = {}) {
    const e = await this.estado();
    const parada = Evolution.respostaDoEstado(e, this.sessao);
    if (parada) return parada; // não cria a instância por aqui
    const ganchos = Array.isArray(config.webhooks) ? config.webhooks.filter((w) => ehObj(w) && w.url) : [];
    if (ganchos.length && !(await this.gravaWebhook(ganchos[0].url))) {
      return json(502, { error: 'A Evolution API não aceitou o webhook.' });
    }
    return this.info();
  }

  async qr(sinal) {
    const e = await this.estado(sinal);
    const parada = Evolution.respostaDoEstado(e, this.sessao);
    if (parada) return parada;
    if (e === 'open') return json(422, { error: 'A sessão já está conectada.', status: 'WORKING' });
    const [st, d] = await this.chama('GET', `/instance/connect/${this.inst}`, null, sinal);
    if (st >= 400) return json(st, { error: Evolution.erro(st, d) });
    const b64 = String((ehObj(d) && (d.base64 || (ehObj(d.qrcode) && d.qrcode.base64))) || '');
    if (!b64) return json(404, { error: 'A Evolution API ainda não gerou o QR Code. Tente de novo em instantes.' });
    return new RespostaLocal(200, Buffer.from(b64.replace(/^data:[^,]*,/, ''), 'base64'), 'image/png');
  }

  async enviar(op, corpo, sinal) {
    const numero = numeroEvolution(corpo.chatId || corpo.number || '');
    if (['sendSeen', 'startTyping', 'stopTyping'].includes(op)) return json(200, { ok: true });
    if (!numero) return json(400, { error: 'chatId é obrigatório' });
    const arq = ehObj(corpo.file) ? corpo.file : {};
    const midia = String(arq.data || arq.url || '').replace(/^data:[^,]*,/, '');
    let caminho;
    let envio;
    if (op === 'sendText') {
      caminho = 'sendText';
      envio = { number: numero, text: String(corpo.text ?? '') };
      if (corpo.linkPreview !== undefined) envio.linkPreview = Boolean(corpo.linkPreview);
    } else if (op === 'sendLocation') {
      caminho = 'sendLocation';
      envio = { number: numero, latitude: Number(corpo.latitude), longitude: Number(corpo.longitude), name: corpo.title || corpo.name || '', address: corpo.address || '' };
    } else if (op === 'sendVoice') {
      caminho = 'sendWhatsAppAudio';
      envio = { number: numero, audio: midia };
    } else {
      const tipo = op === 'sendImage' ? 'image' : op === 'sendVideo' ? 'video' : (String(arq.mimetype || '').startsWith('image/') ? 'image' : String(arq.mimetype || '').startsWith('video/') ? 'video' : 'document');
      caminho = 'sendMedia';
      envio = {
        number: numero,
        mediatype: tipo,
        mimetype: arq.mimetype || (tipo === 'image' ? 'image/jpeg' : tipo === 'video' ? 'video/mp4' : 'application/pdf'),
        media: midia,
        fileName: arq.filename || (tipo === 'image' ? 'imagem.jpg' : tipo === 'video' ? 'video.mp4' : 'documento.pdf'),
        caption: corpo.caption || ''
      };
    }
    if (!['sendText', 'sendLocation'].includes(op) && !midia) return json(400, { error: 'Arquivo ausente (file.url ou file.data).' });
    const [st, d0] = await this.chama('POST', `/message/${caminho}/${this.inst}`, envio, sinal, TEMPO_ENVIO_MS);
    const d = ehObj(d0) ? d0 : { resposta: d0 };
    if (st >= 400) return json(st, { error: Evolution.erro(st, d), evolution: d });
    const chave = ehObj(d.key) ? d.key : {};
    const chatId = jidParaWaha(chave.remoteJid || `${digitos(numero)}@s.whatsapp.net`);
    return json(201, { ...d, id: chave.id || d.id || '', chatId, to: chatId, servidor: EVOLUTION });
  }

  /** [true, chatId] / [false, null] / [null, null] (não deu para checar) */
  async numeroExiste(telefone) {
    const [st, d] = await this.chama('POST', `/chat/whatsappNumbers/${this.inst}`, { numbers: [digitos(telefone)] });
    const lista = Array.isArray(d) ? d : (ehObj(d) ? d.data : null);
    if (st >= 400 || !Array.isArray(lista)) return [null, null];
    const x = lista[0] || {};
    if (x.exists) return [true, jidParaWaha(x.jid || `${digitos(telefone)}@s.whatsapp.net`)];
    return [false, null];
  }

  async existe(telefone) {
    const [ok, chatId] = await this.numeroExiste(telefone);
    if (ok === null) return json(502, { error: 'Não foi possível consultar o número na Evolution API.' });
    return json(200, { numberExists: ok, chatId: chatId || null });
  }

  async foto(contato) {
    const [st, d] = await this.chama('POST', `/chat/fetchProfilePictureUrl/${this.inst}`, { number: numeroEvolution(contato) });
    const url = ehObj(d) ? d.profilePictureUrl || d.profilePicUrl || d.url || null : null;
    if (st >= 400 || !url) return json(404, { error: 'Foto não encontrada' });
    return json(200, { profilePictureURL: url, url });
  }

  /** os contatos da instância com este jid (para achar o telefone de um @lid) */
  async procuraContato(jid) {
    const [st, d] = await this.chama('POST', `/chat/findContacts/${this.inst}`, { where: { remoteJid: jid } });
    if (st >= 400) return { contatos: [], telefone: '' };
    const contatos = Array.isArray(d) ? d : (ehObj(d) && Array.isArray(d.data) ? d.data : []);
    const achados = [];
    const procura = (o) => {
      if (Array.isArray(o)) o.forEach(procura);
      else if (ehObj(o)) {
        for (const [k, v] of Object.entries(o)) {
          if (ehTelefoneJid(v) && /(pn|alt|phone|number|jid)/i.test(k) && !String(v).endsWith('@lid')) achados.push(digitos(v));
          else procura(v);
        }
      }
    };
    procura(contatos);
    return { contatos, telefone: achados[0] || '' };
  }

  async contato(contatoId) {
    const jid = String(contatoId || '').replace('@c.us', '@s.whatsapp.net');
    const { contatos, telefone } = await this.procuraContato(jid);
    const c = contatos[0] || {};
    const fone = telefone || (jid.endsWith('@lid') ? '' : digitos(jid));
    if (!contatos.length && !fone) return json(404, { error: 'Contato não encontrado' });
    return json(200, {
      id: fone ? `${fone}@c.us` : contatoId,
      number: fone,
      name: c.pushName || c.name || '',
      pushname: c.pushName || '',
      profilePictureURL: c.profilePicUrl || null
    });
  }

  async lid(lid) {
    const numero = String(lid || '').split('@')[0];
    const { telefone } = await this.procuraContato(`${numero}@lid`);
    if (!telefone) return json(404, { error: 'LID não encontrado' });
    return json(200, { lid: `${numero}@lid`, pn: `${telefone}@c.us` });
  }

  async midia(messageId, sinal) {
    if (!messageId) return json(400, { error: 'messageId é obrigatório' });
    // o WAHA usa ids "false_55...@c.us_ABC"; a Evolution só o final
    const id = String(messageId).split('_').pop();
    const [st, d] = await this.chama('POST', `/chat/getBase64FromMediaMessage/${this.inst}`, { message: { key: { id } }, convertToMp4: true }, sinal, TEMPO_ENVIO_MS);
    const b64 = ehObj(d) ? String(d.base64 || '') : '';
    if (st >= 400 || !b64) return json(st >= 400 ? st : 404, { error: Evolution.erro(st, d) });
    const tipo = String(d.mimetype || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
    return new RespostaLocal(200, Buffer.from(b64.replace(/^data:[^,]*,/, ''), 'base64'), tipo);
  }

  /** executa o pedido do WAHA (interpretar) na Evolution e responde como o WAHA */
  async executar(pedido, init = {}) {
    const sinal = init.signal;
    const c = pedido.corpo || {};
    switch (pedido.op) {
      case 'info': return this.info(sinal);
      case 'me': return json(200, (await this.me()) || {});
      case 'criar': return this.criar(c.config);
      case 'start': return this.iniciar();
      case 'stop': return this.parar();
      case 'restart': return this.reiniciar();
      case 'logout': return this.logout();
      case 'apagar': return this.apagar();
      case 'configurar': return this.configurar(pedido.config || {});
      case 'qr': return this.qr(sinal);
      case 'legado': return this.enviar('sendText', { chatId: c.number || c.chatId, text: c.message || c.text }, sinal);
      case 'existe': return this.existe(pedido.telefone);
      case 'foto': return this.foto(pedido.contato);
      case 'contato': return this.contato(pedido.contato);
      case 'lid': return this.lid(pedido.lid);
      case 'midia': return this.midia(pedido.messageId, sinal);
      default:
        if (ENVIOS.includes(pedido.op)) return this.enviar(pedido.op, c, sinal);
        return json(400, { error: `Operação "${pedido.op}" não existe na Evolution API.` });
    }
  }
}

/**
 * Envolve o fetch usado com o WAHA: pedidos de sessões que usam a Evolution
 * vão para ela; todo o resto segue para o fetch original sem mudança.
 */
// rotas do WAHA que não têm sessão (listagem, saúde do servidor)
const WAHA_SEM_SESSAO = /^\/api\/(sessions|health|server\/status|version)\/?$|^\/health\/?$/;

/** pedido do WAHA → mesmo caminho no endereço do .env.local (WAHA_URL), se houver */
function paraWahaDoEnv(url, pedido) {
  const env = wahaUrlDoEnv();
  if (!env) return url;
  let u;
  try { u = new URL(url); } catch (e) { return url; }
  if (!pedido && !WAHA_SEM_SESSAO.test(u.pathname)) return url; // não é do WAHA
  // servidores próprios do código de acesso / cadastro, quando configurados, ficam como estão
  const proprios = ['WAHA_2FA_SERVER_URL', 'CADASTRO_WAHA_SERVER_URL']
    .map((n) => { try { return new URL(comProtocolo(limpa(process.env[n]))).host; } catch (e) { return ''; } })
    .filter(Boolean);
  if (proprios.includes(u.host)) return url;
  const i = u.pathname.indexOf('/api/');
  const caminho = i >= 0 ? u.pathname.slice(i) : u.pathname;
  const destino = `${env}${caminho}${u.search}`;
  return destino === url ? url : destino;
}

function comEvolution(fetchBase) {
  async function fetchWhatsApp(url, init = {}) {
    const texto = typeof url === 'string' ? url : (url && url.url) || String(url);
    const pedido = interpretar(texto, init || {});
    if (pedido && disponivel() && (await servidorDaSessao(pedido.sessao)) === EVOLUTION) {
      const r = await new Evolution(pedido.sessao, fetchBase).executar(pedido, init || {});
      r.url = texto;
      return r;
    }
    // WAHA: o endereço vem do .env.local (WAHA_URL) quando ele existe
    const destino = paraWahaDoEnv(texto, pedido);
    const ehWaha = Boolean(pedido) || destino !== texto || (() => {
      try { return WAHA_SEM_SESSAO.test(new URL(texto).pathname); } catch (e) { return false; }
    })();
    if (!ehWaha) return fetchBase(destino, init);
    // Limite de tempo também no WAHA: um WAHA que não responde não pode deixar a
    // tela esperando para sempre (quem já passa o próprio limite continua com ele).
    const tempoMs = pedido && (ENVIOS.includes(pedido.op) || pedido.op === 'midia' || pedido.op === 'legado') ? TEMPO_ENVIO_MS : TEMPO_WAHA_MS;
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), tempoMs);
    const externo = init && init.signal;
    if (externo) {
      if (externo.aborted) controle.abort();
      else externo.addEventListener('abort', () => controle.abort(), { once: true });
    }
    try {
      return await fetchBase(destino, { ...(init || {}), signal: controle.signal });
    } catch (e) {
      if (controle.signal.aborted && !(externo && externo.aborted)) {
        const erro = new Error(`O WAHA (${new URL(destino).host}) não respondeu em ${Math.round(tempoMs / 1000)}s.`);
        erro.name = 'AbortError';
        erro.type = 'aborted';
        throw erro;
      }
      throw e;
    } finally {
      clearTimeout(relogio);
    }
  }
  fetchWhatsApp.original = fetchBase;
  return fetchWhatsApp;
}

// ------------------------------------------- webhook: Evolution → WAHA
const CAPAS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'editedMessage'];
const TIPOS = {
  conversation: 'chat', extendedTextMessage: 'chat', imageMessage: 'image', videoMessage: 'video',
  audioMessage: 'audio', documentMessage: 'document', stickerMessage: 'sticker', locationMessage: 'location',
  contactMessage: 'vcard', contactsArrayMessage: 'multi_vcard', buttonsResponseMessage: 'buttons_response',
  listResponseMessage: 'list_response', templateButtonReplyMessage: 'template_button_reply', reactionMessage: 'reaction'
};
const COM_MIDIA = ['image', 'video', 'audio', 'ptt', 'document', 'sticker'];

function desembrulha(m) {
  let msg = ehObj(m) ? m : {};
  for (let i = 0; i < 3; i++) {
    const capa = CAPAS.find((k) => ehObj(msg[k]) && ehObj(msg[k].message));
    if (!capa) break;
    msg = { ...msg[capa].message, base64: msg.base64 || msg[capa].message.base64 };
  }
  return msg;
}

function textoDaMensagem(m) {
  const g = (o, ...ks) => ks.reduce((x, k) => (ehObj(x) ? x[k] : undefined), o);
  return String(m.conversation || g(m, 'extendedTextMessage', 'text') || g(m, 'buttonsResponseMessage', 'selectedDisplayText') ||
  g(m, 'buttonsResponseMessage', 'selectedButtonId') || g(m, 'templateButtonReplyMessage', 'selectedDisplayText') ||
  g(m, 'listResponseMessage', 'singleSelectReply', 'selectedRowId') || g(m, 'listResponseMessage', 'title') ||
  g(m, 'imageMessage', 'caption') || g(m, 'videoMessage', 'caption') || g(m, 'documentMessage', 'caption') || '').trim();
}

/** telefones em qualquer chave do evento com nome de telefone (pn, alt, phone, number) */
function telefonesNoEvento(o, achados = [], nivel = 0) {
  if (nivel > 6) return achados;
  if (Array.isArray(o)) o.forEach((v) => telefonesNoEvento(v, achados, nivel + 1));
  else if (ehObj(o)) {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'message') continue; // conteúdo da mensagem, não remetente
      if (typeof v === 'string' && /(pn|alt|phone|number)/i.test(k) && ehTelefoneJid(v)) achados.push(v);
      else if (typeof v === 'object') telefonesNoEvento(v, achados, nivel + 1);
    }
  }
  return achados;
}

const ehEventoEvolution = (corpo) => ehObj(corpo) && 'instance' in corpo && 'data' in corpo && !('payload' in corpo);
const nomeEvento = (e) => String(e || '').toLowerCase().replace(/_/g, '.');

/** corpo do webhook da Evolution → { event, session, payload } como o WAHA manda */
function eventoComoWaha(corpo) {
  const evento = nomeEvento(corpo.event);
  const sessao = String(corpo.instance || '');
  if (evento === 'connection.update') {
    const estado = String((ehObj(corpo.data) && corpo.data.state) || '').toLowerCase();
    return { event: 'session.status', session: sessao, payload: { name: sessao, status: MAPA_STATUS[estado] || 'STOPPED' }, evolution: true };
  }
  if (evento !== 'messages.upsert') return { event: `evolution.${evento || 'desconhecido'}`, session: sessao, payload: {}, evolution: true };

  let d = corpo.data || {};
  if (Array.isArray(d)) d = d[0] || {};
  if (Array.isArray(d.messages) && d.messages.length) d = d.messages[0];
  const k = ehObj(d.key) ? d.key : {};
  const m = desembrulha(d.message);
  // messageType pode ser o da "capa" (ex.: documentWithCaptionMessage): vale a chave de dentro
  const chaveTipo = d.messageType && ehObj(m[d.messageType]) && TIPOS[d.messageType] ?
    d.messageType : (Object.keys(TIPOS).find((t) => t in m) || '');
  let tipo = TIPOS[chaveTipo] || 'chat';
  const inner = ehObj(m[chaveTipo]) ? m[chaveTipo] : {};
  if (tipo === 'audio' && inner.ptt) tipo = 'ptt';
  const temMidia = COM_MIDIA.includes(tipo);
  const mimetype = temMidia ? String(inner.mimetype || '').split(';')[0].trim() : '';
  const base64 = temMidia ? String(m.base64 || d.base64 || '').replace(/^data:[^,]*,/, '') : '';

  // contato identificado por @lid: o telefone pode vir em outras chaves
  // (remoteJidAlt, senderPn, participantPn...), como no Inno
  const remoto = String(k.remoteJid || '');
  const alternativos = [k.remoteJidAlt, k.senderPn, d.senderPn, k.participantPn, k.participantAlt, ...telefonesNoEvento(d)]
    .filter((v) => ehTelefoneJid(v) || (typeof v === 'string' && /^\d{10,15}@s\.whatsapp\.net$/.test(v)));
  let from = jidParaWaha(remoto);
  const dadosExtras = { id: { id: k.id || '' }, notifyName: d.pushName || '' };
  if (remoto.endsWith('@lid') && alternativos.length) {
    from = jidParaWaha(alternativos[0].includes('@') ? alternativos[0] : `${digitos(alternativos[0])}@s.whatsapp.net`);
    dadosExtras.author = remoto; // o webhook guarda LID → telefone no cache
  }

  const payload = {
    id: k.id || null,
    from,
    to: '',
    fromMe: Boolean(k.fromMe),
    body: textoDaMensagem(m),
    type: tipo,
    hasMedia: temMidia,
    mimetype,
    mediaData: base64 || null,
    media: temMidia ? { mimetype, filename: inner.fileName || null, ...(base64 ? { data: base64 } : {}) } : null,
    participant: k.participant ? jidParaWaha(k.participant) : '',
    notifyName: d.pushName || '',
    timestamp: Number(d.messageTimestamp) || Math.floor(Date.now() / 1000),
    _data: dadosExtras,
    evolution: true
  };
  if (tipo === 'location' && ehObj(m.locationMessage)) {
    payload.location = { latitude: m.locationMessage.degreesLatitude, longitude: m.locationMessage.degreesLongitude };
  }
  return { event: 'message', session: sessao, payload, evolution: true };
}

// ------------------------------- códigos da plataforma (duas etapas, cadastro)
/**
 * Servidor que envia os códigos da plataforma pelo WhatsApp, escolhido no .env.local:
 *   WHATSAPP_2FA_SERVIDOR=waha|evolution          (padrão: waha)
 *   EVOLUTION_2FA_INSTANCIA=nome                   (padrão: WAHA_2FA_SESSION ou edssolution)
 * O cadastro segue a mesma escolha, a menos que tenha a sua:
 *   CADASTRO_WHATSAPP_SERVIDOR / CADASTRO_EVOLUTION_INSTANCIA
 * Na Evolution o envio vai direto para a instância (não depende da sessão de
 * nenhuma clínica: a mesma sessão pode ser de uma clínica no WAHA).
 */
function servidorDosCodigos(uso = '2fa') {
  const doCadastro = uso === 'cadastro' ? limpa(process.env.CADASTRO_WHATSAPP_SERVIDOR) : '';
  const servidorEscolhido = normalizaServidor(doCadastro || limpa(process.env.WHATSAPP_2FA_SERVIDOR));
  const instancia = (uso === 'cadastro' && limpa(process.env.CADASTRO_EVOLUTION_INSTANCIA)) ||
    limpa(process.env.EVOLUTION_2FA_INSTANCIA) ||
    (uso === 'cadastro' && limpa(process.env.CADASTRO_WAHA_SESSION)) ||
    limpa(process.env.WAHA_2FA_SESSION) || 'edssolution';
  return { servidor: servidorEscolhido, instancia };
}

/** envia um texto pela Evolution; { success, chatId?, error? } (nunca lança) */
async function enviarTextoEvolution(instancia, numero, texto, fetchBase = globalThis.fetch) {
  if (!disponivel()) return { success: false, error: 'EVOLUTION_URL não está no .env.local do servidor.' };
  try {
    const r = await new Evolution(instancia, fetchBase).enviar('sendText', { chatId: `${digitos(numero)}@c.us`, text: texto });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { success: true, chatId: d.chatId || null } : { success: false, error: d.error || `HTTP ${r.status}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  servidorDosCodigos, enviarTextoEvolution,
  EVOLUTION, WAHA, servidor, disponivel, normalizaServidor, wahaUrlDoEnv, webhookUrlDoEnv, paraWahaDoEnv,
  definirResolvedor, lembrarSessao, limparCache, servidorDaSessao,
  interpretar, comEvolution, Evolution, RespostaLocal,
  numeroEvolution, jidParaWaha,
  ehEventoEvolution, eventoComoWaha
};
