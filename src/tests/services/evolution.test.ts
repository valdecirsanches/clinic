/**
 * Evolution API como alternativa ao WAHA (server/services/evolution.js):
 * pedidos no formato do WAHA vão para a Evolution quando a sessão é de uma
 * clínica que a escolheu, e o webhook da Evolution vira o evento do WAHA.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const evo = require('../../server/services/evolution');

const WAHA = 'https://waha.exemplo.com';
const EVO = 'https://evo.exemplo.com';

type Chamada = { url: string; metodo: string; corpo: any; headers: Record<string, string> };

/** fetch falso: responde como a Evolution em EVO e registra o que chegou no WAHA */
function servidorFalso() {
  const chamadas: Chamada[] = [];
  const instancias: Record<string, { state: string; webhook?: any }> = { clinica_evo: { state: 'open' } };
  const resp = (status: number, corpo: any) => ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(corpo),
    json: async () => corpo,
    headers: { get: () => 'application/json' }
  });
  const fetchFalso = async (url: string, init: any = {}) => {
    const corpo = init.body ? JSON.parse(init.body) : null;
    chamadas.push({ url, metodo: init.method || 'GET', corpo, headers: init.headers || {} });
    if (!url.startsWith(EVO)) return resp(200, { waha: true });
    if (init.headers?.apikey !== 'chave-evo') return resp(401, { message: 'Unauthorized' });
    const u = new URL(url);
    const [, grupo, acao, inst] = u.pathname.split('/');
    const nome = decodeURIComponent(inst || u.searchParams.get('instanceName') || '');
    const i = instancias[nome];
    const rota = `${grupo}/${acao}`;
    if (rota === 'instance/create') {
      if (instancias[corpo.instanceName]) return resp(403, { response: { message: ['This name is already in use.'] } });
      instancias[corpo.instanceName] = { state: 'close' };
      return resp(201, { instance: { instanceName: corpo.instanceName } });
    }
    if (!i) return resp(404, { response: { message: [`The "${nome}" instance does not exist`] } });
    switch (rota) {
      case 'instance/connectionState': return resp(200, { instance: { instanceName: nome, state: i.state } });
      case 'instance/connect': i.state = i.state === 'open' ? 'open' : 'connecting'; return resp(200, { base64: 'data:image/png;base64,iVBORw0KGgo=', code: 'x' });
      case 'instance/fetchInstances': return resp(200, [{ name: nome, ownerJid: '5511999990000@s.whatsapp.net', profileName: 'Clínica' }]);
      case 'instance/logout': i.state = 'close'; return resp(200, { status: 'SUCCESS' });
      case 'instance/restart': return resp(200, { status: 'SUCCESS' });
      case 'webhook/set': i.webhook = corpo.webhook; return resp(201, corpo);
      case 'webhook/find': return resp(200, i.webhook || null);
      case 'message/sendText':
      case 'message/sendMedia':
      case 'message/sendLocation':
        return resp(201, { key: { remoteJid: `${String(corpo.number).replace(/\D/g, '')}@s.whatsapp.net`, fromMe: true, id: 'ABC123' }, status: 'PENDING' });
      case 'chat/whatsappNumbers': return resp(200, corpo.numbers.map((n: string) => ({ exists: n !== '5511000000000', jid: `${n}@s.whatsapp.net`, number: n })));
      case 'chat/fetchProfilePictureUrl': return resp(200, { wuid: corpo.number, profilePictureUrl: 'https://pps.whatsapp.net/foto.jpg' });
      case 'chat/findContacts': return resp(200, [{ remoteJid: corpo.where.remoteJid, pushName: 'Maria', remoteJidAlt: '5511988887777@s.whatsapp.net' }]);
      case 'chat/getBase64FromMediaMessage': return resp(200, { base64: Buffer.from('conteudo-do-pdf').toString('base64'), mimetype: 'application/pdf; charset=binary' });
      default: return resp(404, { error: `rota falsa sem ${rota}` });
    }
  };
  return { chamadas, instancias, fetchFalso };
}

const ambienteOriginal = { ...process.env };
afterAll(() => {
  process.env = ambienteOriginal;
  evo.definirResolvedor(null);
});

let falso: ReturnType<typeof servidorFalso>;
let fetchWa: (url: string, init?: any) => Promise<any>;

beforeEach(() => {
  process.env.EVOLUTION_URL = EVO;
  process.env.EVOLUTION_API_KEY = 'chave-evo';
  delete process.env.EVOLUTION_WEBHOOK_URL;
  evo.limparCache();
  evo.definirResolvedor(async (s: string) => (s.startsWith('clinica_evo') || s === 'nova_evo' ? 'evolution' : 'waha'));
  falso = servidorFalso();
  fetchWa = evo.comEvolution(falso.fetchFalso);
});

const post = (corpo: any) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

describe('interpretar (pedido do WAHA → operação)', () => {
  it('reconhece envios, sessões, QR, contatos e mídia', () => {
    const casos: Array<[string, any, string, string]> = [
    [`${WAHA}/api/sendText`, post({ session: 's1', chatId: '1@c.us' }), 'sendText', 's1'],
    [`${WAHA}/api/s1/chatting/sendFile`, post({}), 'sendFile', 's1'],
    [`${WAHA}/api/sessions/s1`, {}, 'info', 's1'],
    [`${WAHA}/api/sessions/s1`, { method: 'PUT', body: '{"config":{}}' }, 'configurar', 's1'],
    [`${WAHA}/api/sessions`, post({ name: 'nova' }), 'criar', 'nova'],
    [`${WAHA}/api/sessions/start`, post({ name: 's1' }), 'start', 's1'],
    [`${WAHA}/api/sessions/s1/logout`, post({}), 'logout', 's1'],
    [`${WAHA}/api/s1/auth/qr`, {}, 'qr', 's1'],
    [`${WAHA}/api/auth/qr?session=s1`, {}, 'qr', 's1'],
    [`${WAHA}/api/contacts/check-exists?phone=5511&session=s1`, {}, 'existe', 's1'],
    [`${WAHA}/api/contacts/profile-picture?contactId=1@c.us&session=s1`, {}, 'foto', 's1'],
    [`${WAHA}/api/s1/lids/123@lid`, {}, 'lid', 's1'],
    [`${WAHA}/api/sessions/s1/messages/false_1%40c.us_ID/media`, {}, 'midia', 's1'],
    [`${WAHA}/api/files/s1/ID.jpeg`, {}, 'midia', 's1'],
    [`${WAHA}/api/sessions/s1/send-message`, post({ number: '1', message: 'oi' }), 'legado', 's1']];

    for (const [url, init, op, sessao] of casos) {
      const p = evo.interpretar(url, init);
      expect(p, url).toBeTruthy();
      expect([p.op, p.sessao], url).toEqual([op, sessao]);
    }
  });

  it('listagens, health e outros sites não são do WAHA com sessão', () => {
    expect(evo.interpretar(`${WAHA}/api/sessions?all=true`, {})).toBeNull();
    expect(evo.interpretar(`${WAHA}/api/health`, {})).toBeNull();
    expect(evo.interpretar('https://graph.facebook.com/v19.0/123/messages', post({}))).toBeNull();
    expect(evo.interpretar('http://localhost:5171/api/aniversarios/enviar-todos', post({ clinicaId: 'x' }))).toBeNull();
  });
});

describe('comEvolution (fetch do WhatsApp)', () => {
  it('sessão do WAHA segue para o WAHA sem mudança', async () => {
    const r = await fetchWa(`${WAHA}/api/sendText`, post({ session: 'clinica_waha', chatId: '5511@c.us', text: 'oi' }));
    expect(await r.json()).toEqual({ waha: true });
    expect(falso.chamadas).toHaveLength(1);
    expect(falso.chamadas[0].url).toBe(`${WAHA}/api/sendText`);
  });

  it('sem EVOLUTION_URL no .env tudo vai para o WAHA', async () => {
    delete process.env.EVOLUTION_URL;
    await fetchWa(`${WAHA}/api/sendText`, post({ session: 'clinica_evo', chatId: '5511@c.us', text: 'oi' }));
    expect(falso.chamadas[0].url).toBe(`${WAHA}/api/sendText`);
  });

  it('sendText vai para a Evolution e responde como o WAHA', async () => {
    const r = await fetchWa(`${WAHA}/api/sendText`, post({ session: 'clinica_evo', chatId: '5511988887777@c.us', text: 'Olá!', linkPreview: true }));
    expect(r.ok).toBe(true);
    expect(r.evolution).toBe(true);
    const d = await r.json();
    expect(d.chatId).toBe('5511988887777@c.us');
    expect(d.id).toBe('ABC123');
    const c = falso.chamadas[0];
    expect(c.url).toBe(`${EVO}/message/sendText/clinica_evo`);
    expect(c.headers.apikey).toBe('chave-evo');
    expect(c.corpo).toEqual({ number: '5511988887777', text: 'Olá!', linkPreview: true });
  });

  it('arquivo (url ou base64) vira sendMedia; localização vira sendLocation', async () => {
    await fetchWa(`${WAHA}/api/clinica_evo/chatting/sendFile`, post({
      chatId: '5511988887777@c.us', caption: 'Receita', session: 'clinica_evo',
      file: { mimetype: 'application/pdf', filename: 'receita.pdf', data: 'data:application/pdf;base64,JVBERi0=' }
    }));
    expect(falso.chamadas[0].corpo).toMatchObject({ mediatype: 'document', fileName: 'receita.pdf', media: 'JVBERi0=', caption: 'Receita' });

    await fetchWa(`${WAHA}/api/sendLocation`, post({ session: 'clinica_evo', chatId: '5511988887777@c.us', latitude: -23.5, longitude: -46.6, title: 'Clínica', address: 'Rua A' }));
    expect(falso.chamadas[1].url).toBe(`${EVO}/message/sendLocation/clinica_evo`);
    expect(falso.chamadas[1].corpo).toMatchObject({ latitude: -23.5, longitude: -46.6, name: 'Clínica', address: 'Rua A' });
  });

  it('contato @lid é enviado com o jid inteiro', async () => {
    await fetchWa(`${WAHA}/api/sendText`, post({ session: 'clinica_evo', chatId: '185224809992420@lid', text: 'oi' }));
    expect(falso.chamadas[0].corpo.number).toBe('185224809992420@lid');
  });

  it('GET da sessão devolve status, me e webhooks no formato do WAHA', async () => {
    falso.instancias.clinica_evo.webhook = { enabled: true, url: 'https://app/api/webhook/whatsapp', events: ['MESSAGES_UPSERT'] };
    const r = await fetchWa(`${WAHA}/api/sessions/clinica_evo`, { method: 'GET' });
    const d = await r.json();
    expect(d.status).toBe('WORKING');
    expect(d.me).toEqual({ id: '5511999990000@c.us', pushName: 'Clínica' });
    expect(d.config.webhooks).toEqual([{ url: 'https://app/api/webhook/whatsapp', events: ['message', 'message.any', 'session.status'] }]);
  });

  it('instância inexistente responde 404 marcado como Evolution (sem criar nada)', async () => {
    const r = await fetchWa(`${WAHA}/api/sessions/clinica_evo_2`, { method: 'GET' });
    expect(r.status).toBe(404);
    expect(r.evolution).toBe(true);
    const start = await fetchWa(`${WAHA}/api/sessions/clinica_evo_2/start`, post({}));
    expect(start.status).toBe(404);
    expect(falso.chamadas.some((c) => c.url.includes('/instance/create'))).toBe(false);
  });

  it('chave recusada vira 401 como no WAHA', async () => {
    process.env.EVOLUTION_API_KEY = 'errada';
    const r = await fetchWa(`${WAHA}/api/sessions/clinica_evo`, { method: 'GET' });
    expect(r.status).toBe(401);
  });

  it('criar sessão cria a instância e grava o webhook (com mídia em base64)', async () => {
    const r = await fetchWa(`${WAHA}/api/sessions`, post({ name: 'nova_evo', start: true, config: { webhooks: [{ url: 'https://app/api/webhook/whatsapp' }] } }));
    expect(r.status).toBe(201);
    expect(falso.instancias.nova_evo).toBeTruthy();
    expect(falso.instancias.nova_evo.webhook).toMatchObject({ enabled: true, url: 'https://app/api/webhook/whatsapp', webhookBase64: true, webhookByEvents: false });
    // de novo: "já existe" vira 422 (o que a rota de criação já aceita)
    const r2 = await fetchWa(`${WAHA}/api/sessions`, post({ name: 'nova_evo' }));
    expect(r2.status).toBe(422);
  });

  it('PUT da sessão com webhooks grava o webhook; EVOLUTION_WEBHOOK_URL tem prioridade', async () => {
    process.env.EVOLUTION_WEBHOOK_URL = 'https://publico/api/webhook/whatsapp';
    const r = await fetchWa(`${WAHA}/api/sessions/clinica_evo`, { method: 'PUT', body: JSON.stringify({ config: { webhooks: [{ url: 'https://interno/x', events: ['message'] }] } }) });
    expect(r.ok).toBe(true);
    expect(falso.instancias.clinica_evo.webhook.url).toBe('https://publico/api/webhook/whatsapp');
  });

  it('QR Code vem como imagem PNG', async () => {
    falso.instancias.clinica_evo.state = 'close';
    const r = await fetchWa(`${WAHA}/api/clinica_evo/auth/qr`, { method: 'GET' });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('logout desconecta a instância', async () => {
    const r = await fetchWa(`${WAHA}/api/sessions/clinica_evo/logout`, post({}));
    expect(r.status).toBe(201);
    expect(falso.instancias.clinica_evo.state).toBe('close');
  });

  it('check-exists, foto, LID e contato', async () => {
    const existe = await (await fetchWa(`${WAHA}/api/contacts/check-exists?phone=5511988887777&session=clinica_evo`)).json();
    expect(existe).toEqual({ numberExists: true, chatId: '5511988887777@c.us' });
    const nao = await (await fetchWa(`${WAHA}/api/contacts/check-exists?phone=5511000000000&session=clinica_evo`)).json();
    expect(nao.numberExists).toBe(false);

    const foto = await (await fetchWa(`${WAHA}/api/contacts/profile-picture?contactId=5511988887777%40c.us&session=clinica_evo`)).json();
    expect(foto.profilePictureURL).toBe('https://pps.whatsapp.net/foto.jpg');

    const lid = await (await fetchWa(`${WAHA}/api/clinica_evo/lids/185224809992420%40lid`)).json();
    expect(lid.pn).toBe('5511988887777@c.us');

    const contato = await (await fetchWa(`${WAHA}/api/contacts?contactId=185224809992420%40lid&session=clinica_evo`)).json();
    expect(contato.number).toBe('5511988887777');
  });

  it('mídia recebida é baixada pela Evolution (id do WAHA ou da Evolution)', async () => {
    const r = await fetchWa(`${WAHA}/api/sessions/clinica_evo/messages/${encodeURIComponent('false_5511@c.us_3EB0ABC')}/media`);
    expect(r.ok).toBe(true);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe('conteudo-do-pdf');
    expect(falso.chamadas[0].corpo.message.key.id).toBe('3EB0ABC');
  });

  it('o servidor de cada sessão fica em cache e lembrarSessao vale antes de gravar no banco', async () => {
    let consultas = 0;
    evo.definirResolvedor(async () => {consultas++;return 'waha';});
    evo.limparCache();
    await fetchWa(`${WAHA}/api/sessions/easyclin_x`);
    await fetchWa(`${WAHA}/api/sessions/easyclin_x`);
    expect(consultas).toBe(1);
    evo.lembrarSessao('easyclin_y', 'evolution');
    await fetchWa(`${WAHA}/api/sessions/easyclin_y`);
    expect(falso.chamadas.at(-1)!.url.startsWith(EVO)).toBe(true);
  });
});

describe('eventoComoWaha (webhook da Evolution → WAHA)', () => {
  const evento = (data: any, event = 'messages.upsert') => ({ event, instance: 'clinica_evo', data, apikey: 'x', server_url: EVO });

  it('reconhece o corpo da Evolution e não confunde com o do WAHA', () => {
    expect(evo.ehEventoEvolution(evento({}))).toBe(true);
    expect(evo.ehEventoEvolution({ event: 'message', session: 's', payload: {} })).toBe(false);
  });

  it('mensagem de texto', () => {
    const w = evo.eventoComoWaha(evento({
      key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'MSG1' },
      pushName: 'Maria', message: { conversation: 'SIM' }, messageType: 'conversation', messageTimestamp: 1700000000
    }));
    expect(w.event).toBe('message');
    expect(w.session).toBe('clinica_evo');
    expect(w.payload).toMatchObject({ id: 'MSG1', from: '5511988887777@c.us', fromMe: false, body: 'SIM', type: 'chat', hasMedia: false, notifyName: 'Maria' });
  });

  it('@lid com o telefone em remoteJidAlt chega com o telefone (e o LID para o cache)', () => {
    const w = evo.eventoComoWaha(evento({
      key: { remoteJid: '185224809992420@lid', remoteJidAlt: '5511988887777@s.whatsapp.net', fromMe: false, id: 'MSG2' },
      message: { extendedTextMessage: { text: '1' } }, messageType: 'extendedTextMessage'
    }));
    expect(w.payload.from).toBe('5511988887777@c.us');
    expect(w.payload._data.author).toBe('185224809992420@lid');
    expect(w.payload.body).toBe('1');
  });

  it('@lid com o telefone em outra chave do evento (ex.: participantPn) também chega com o telefone', () => {
    const w = evo.eventoComoWaha(evento({
      key: { remoteJid: '185224809992420@lid', id: 'MSG3' }, contextInfo: { participantPn: '5511977776666@s.whatsapp.net' },
      message: { conversation: '2', extendedTextMessage: { contextInfo: { participantNumber: '5599999999999' } } }
    }));
    expect(w.payload.from).toBe('5511977776666@c.us');
  });

  it('@lid sem o telefone fica como LID (o webhook resolve depois)', () => {
    const w = evo.eventoComoWaha(evento({ key: { remoteJid: '185224809992420@lid', id: 'M' }, message: { conversation: 'oi' } }));
    expect(w.payload.from).toBe('185224809992420@lid');
  });

  it('imagem com base64 e legenda; áudio de voz vira ptt; documento com nome', () => {
    const img = evo.eventoComoWaha(evento({
      key: { remoteJid: '5511988887777@s.whatsapp.net', id: 'I1' }, messageType: 'imageMessage',
      message: { imageMessage: { mimetype: 'image/jpeg', caption: 'meu RG' }, base64: 'QUJD' }
    })).payload;
    expect(img).toMatchObject({ type: 'image', hasMedia: true, mimetype: 'image/jpeg', mediaData: 'QUJD', body: 'meu RG' });
    expect(img.media).toMatchObject({ mimetype: 'image/jpeg', data: 'QUJD' });

    const voz = evo.eventoComoWaha(evento({
      key: { remoteJid: '5511988887777@s.whatsapp.net', id: 'A1' }, messageType: 'audioMessage',
      message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true } }
    })).payload;
    expect(voz).toMatchObject({ type: 'ptt', hasMedia: true, mimetype: 'audio/ogg', mediaData: null });

    const doc = evo.eventoComoWaha(evento({
      key: { remoteJid: '5511988887777@s.whatsapp.net', id: 'D1' }, messageType: 'documentWithCaptionMessage',
      message: { documentWithCaptionMessage: { message: { documentMessage: { mimetype: 'application/pdf', fileName: 'exame.pdf', caption: 'exame' } } } }
    })).payload;
    expect(doc).toMatchObject({ type: 'document', hasMedia: true, mimetype: 'application/pdf', body: 'exame' });
    expect(doc.media.filename).toBe('exame.pdf');
  });

  it('mensagem enviada por nós continua marcada fromMe', () => {
    const w = evo.eventoComoWaha(evento({ key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: true, id: 'X' }, message: { conversation: 'lembrete' } }));
    expect(w.payload.fromMe).toBe(true);
  });

  it('CONNECTION_UPDATE vira session.status; outros eventos são ignorados pelo webhook', () => {
    expect(evo.eventoComoWaha(evento({ state: 'open' }, 'CONNECTION_UPDATE'))).toMatchObject({ event: 'session.status', session: 'clinica_evo', payload: { status: 'WORKING' } });
    expect(evo.eventoComoWaha(evento({}, 'CONTACTS_UPDATE')).event).toBe('evolution.contacts.update');
  });
});

describe('endereços no .env.local (WAHA_URL e webhook)', () => {
  it('WAHA_URL substitui o endereço gravado nos pedidos do WAHA (e só neles)', async () => {
    process.env.WAHA_URL = 'https://whatsapp2.exemplo.com/';
    await fetchWa('https://antigo.exemplo.com/api/sendText', post({ session: 'clinica_waha', chatId: '5511@c.us', text: 'oi' }));
    await fetchWa('http://antigo.exemplo.com/api/sessions?all=true');
    await fetchWa('https://antigo.exemplo.com/health');
    await fetchWa('https://graph.facebook.com/v19.0/123/messages', post({}));
    await fetchWa('https://clinic-api.exemplo.com/api/whatsapp-meta/webhook');
    expect(falso.chamadas.map((c) => c.url)).toEqual([
    'https://whatsapp2.exemplo.com/api/sendText',
    'https://whatsapp2.exemplo.com/api/sessions?all=true',
    'https://whatsapp2.exemplo.com/health',
    'https://graph.facebook.com/v19.0/123/messages',
    'https://clinic-api.exemplo.com/api/whatsapp-meta/webhook']);
    delete process.env.WAHA_URL;
  });

  it('sem WAHA_URL vale o endereço gravado; o servidor do código de acesso fica como está', async () => {
    delete process.env.WAHA_URL;
    await fetchWa('https://antigo.exemplo.com/api/sendText', post({ session: 'clinica_waha', chatId: '5511@c.us', text: 'oi' }));
    process.env.WAHA_URL = 'whatsapp2.exemplo.com';
    process.env.WAHA_2FA_SERVER_URL = 'https://codigo.exemplo.com';
    await fetchWa('https://codigo.exemplo.com/api/sendText', post({ session: 'edssolution', chatId: '5511@c.us', text: '123456' }));
    expect(falso.chamadas.map((c) => c.url)).toEqual(['https://antigo.exemplo.com/api/sendText', 'https://codigo.exemplo.com/api/sendText']);
    delete process.env.WAHA_URL;
    delete process.env.WAHA_2FA_SERVER_URL;
  });

  it('URL do webhook: WAHA_WEBHOOK_URL no WAHA, EVOLUTION_WEBHOOK_URL na Evolution', () => {
    process.env.WAHA_WEBHOOK_URL = 'https://api/waha';
    process.env.EVOLUTION_WEBHOOK_URL = 'https://api/evo';
    expect(evo.webhookUrlDoEnv('waha')).toBe('https://api/waha');
    expect(evo.webhookUrlDoEnv('evolution')).toBe('https://api/evo');
    delete process.env.EVOLUTION_WEBHOOK_URL;
    expect(evo.webhookUrlDoEnv('evolution')).toBe('https://api/waha');
    delete process.env.WAHA_WEBHOOK_URL;
    expect(evo.webhookUrlDoEnv('waha')).toBe('');
  });
});

describe('limite de tempo (Evolution fora do ar não trava a tela)', () => {
  it('a consulta da sessão desiste quando a Evolution não responde', async () => {
    const parado = (_u: string, init: any) => new Promise((_r, rejeita) => {
      init.signal.addEventListener('abort', () => rejeita(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    const fw = evo.comEvolution(parado);
    const controle = new AbortController();
    setTimeout(() => controle.abort(), 50); // o /status usa 4s; aqui 50ms
    const inicio = Date.now();
    await expect(fw(`${WAHA}/api/sessions/clinica_evo`, { method: 'GET', signal: controle.signal })).rejects.toThrow(/não respondeu/);
    expect(Date.now() - inicio).toBeLessThan(2000);
  });
});

describe('limite de tempo no WAHA', () => {
  it('pedido ao WAHA sem limite próprio recebe um (sinal repassado ao fetch)', async () => {
    let sinal: any = null;
    const fw = evo.comEvolution(async (_u: string, init: any) => {sinal = init.signal;return { ok: true, status: 200 };});
    await fw(`${WAHA}/api/sessions/clinica_waha/start`, post({}));
    expect(sinal).toBeTruthy();
    expect(sinal.aborted).toBe(false);
  });

  it('pedidos que não são do WAHA seguem sem mudança', async () => {
    let initRecebido: any = 'nada';
    const fw = evo.comEvolution(async (_u: string, init: any) => {initRecebido = init;return { ok: true, status: 200 };});
    const init = post({ x: 1 });
    await fw('https://graph.facebook.com/v19.0/123/messages', init);
    expect(initRecebido).toBe(init);
  });
});

describe('códigos da plataforma (duas etapas e cadastro) pela Evolution', () => {
  const limpar = () => ['WHATSAPP_2FA_SERVIDOR', 'EVOLUTION_2FA_INSTANCIA', 'WAHA_2FA_SESSION', 'CADASTRO_WHATSAPP_SERVIDOR', 'CADASTRO_EVOLUTION_INSTANCIA', 'CADASTRO_WAHA_SESSION'].forEach((n) => delete process.env[n]);

  it('padrão: WAHA com a sessão do 2FA', () => {
    limpar();
    process.env.WAHA_2FA_SESSION = 'edssolution';
    expect(evo.servidorDosCodigos('2fa')).toEqual({ servidor: 'waha', instancia: 'edssolution' });
    expect(evo.servidorDosCodigos('cadastro')).toEqual({ servidor: 'waha', instancia: 'edssolution' });
  });

  it('WHATSAPP_2FA_SERVIDOR=evolution vale para o 2FA e para o cadastro; o cadastro pode ter o seu', () => {
    limpar();
    process.env.WHATSAPP_2FA_SERVIDOR = 'evolution';
    process.env.EVOLUTION_2FA_INSTANCIA = 'plataforma';
    expect(evo.servidorDosCodigos('2fa')).toEqual({ servidor: 'evolution', instancia: 'plataforma' });
    expect(evo.servidorDosCodigos('cadastro')).toEqual({ servidor: 'evolution', instancia: 'plataforma' });
    process.env.CADASTRO_WHATSAPP_SERVIDOR = 'waha';
    expect(evo.servidorDosCodigos('cadastro').servidor).toBe('waha');
    process.env.CADASTRO_WHATSAPP_SERVIDOR = 'evolution';
    process.env.CADASTRO_EVOLUTION_INSTANCIA = 'cadastro';
    expect(evo.servidorDosCodigos('cadastro')).toEqual({ servidor: 'evolution', instancia: 'cadastro' });
    limpar();
  });

  it('enviarTextoEvolution manda direto para a instância, sem depender da sessão de clínica', async () => {
    evo.definirResolvedor(async () => 'waha'); // a mesma sessão numa clínica do WAHA não atrapalha
    const r = await evo.enviarTextoEvolution('clinica_evo', '5511988887777', 'Seu código é 123456', falso.fetchFalso);
    expect(r).toEqual({ success: true, chatId: '5511988887777@c.us' });
    expect(falso.chamadas[0].url).toBe(`${EVO}/message/sendText/clinica_evo`);
    expect(falso.chamadas[0].corpo).toMatchObject({ number: '5511988887777', text: 'Seu código é 123456' });
    const falha = await evo.enviarTextoEvolution('nao_existe', '5511988887777', 'x', falso.fetchFalso);
    expect(falha.success).toBe(false);
    delete process.env.EVOLUTION_URL;
    expect((await evo.enviarTextoEvolution('clinica_evo', '5511', 'x', falso.fetchFalso)).error).toMatch(/EVOLUTION_URL/);
  });
});

describe('WAHA com dois motores: WEBJS e GOWS', () => {
  beforeEach(() => {
    process.env.WAHA_URL = 'https://whatsapp2.exemplo.com';
    process.env.WAHA_GOWS_URL = 'https://whatsapp.exemplo.com';
    evo.definirResolvedor(async (s: string) => (s === 'clinica_gows' ? 'waha_gows' : s === 'clinica_evo' ? 'evolution' : 'waha'));
    evo.limparCache();
  });
  afterAll(() => { delete process.env.WAHA_URL; delete process.env.WAHA_GOWS_URL; delete process.env.WAHA_GOWS_API_KEY; });

  it('normaliza os três valores (o antigo "waha" continua sendo o WEBJS)', () => {
    expect(evo.normalizaServidor('waha')).toBe('waha');
    expect(evo.normalizaServidor('waha_gows')).toBe('waha_gows');
    expect(evo.normalizaServidor('GOWS')).toBe('waha_gows');
    expect(evo.normalizaServidor('evolution')).toBe('evolution');
    expect(evo.normalizaServidor('')).toBe('waha');
  });

  it('cada clínica vai para o WAHA do seu motor', async () => {
    await fetchWa('https://antigo.exemplo.com/api/sendText', post({ session: 'clinica_gows', chatId: '5511@c.us', text: 'oi' }));
    await fetchWa('https://antigo.exemplo.com/api/sendText', post({ session: 'clinica_webjs', chatId: '5511@c.us', text: 'oi' }));
    // mesmo vindo com o endereço do outro motor, vai para o da clínica
    await fetchWa('https://whatsapp2.exemplo.com/api/sessions/clinica_gows', { method: 'GET' });
    expect(falso.chamadas.map((c) => c.url)).toEqual([
    'https://whatsapp.exemplo.com/api/sendText',
    'https://whatsapp2.exemplo.com/api/sendText',
    'https://whatsapp.exemplo.com/api/sessions/clinica_gows']);
  });

  it('listagem sem sessão num WAHA configurado fica onde está', async () => {
    await fetchWa('https://whatsapp.exemplo.com/api/sessions?all=true');
    await fetchWa('https://whatsapp2.exemplo.com/api/sessions?all=true');
    await fetchWa('https://antigo.exemplo.com/api/sessions?all=true');
    expect(falso.chamadas.map((c) => c.url)).toEqual([
    'https://whatsapp.exemplo.com/api/sessions?all=true',
    'https://whatsapp2.exemplo.com/api/sessions?all=true',
    'https://whatsapp2.exemplo.com/api/sessions?all=true']);
  });

  it('WAHA_GOWS_API_KEY troca a chave só nos pedidos do GOWS', async () => {
    process.env.WAHA_GOWS_API_KEY = 'chave-gows';
    const h = { 'Content-Type': 'application/json', 'X-Api-Key': 'chave-webjs' };
    await fetchWa('https://x/api/sendText', { method: 'POST', headers: h, body: JSON.stringify({ session: 'clinica_gows', chatId: '1@c.us', text: 'a' }) });
    await fetchWa('https://x/api/sendText', { method: 'POST', headers: h, body: JSON.stringify({ session: 'clinica_webjs', chatId: '1@c.us', text: 'a' }) });
    expect(falso.chamadas[0].headers['X-Api-Key']).toBe('chave-gows');
    expect(falso.chamadas[1].headers['X-Api-Key']).toBe('chave-webjs');
  });

  it('servidorDisponivel: GOWS só com WAHA_GOWS_URL; webhook do GOWS cai no do WAHA', () => {
    expect(evo.servidorDisponivel('waha_gows')).toBe(true);
    delete process.env.WAHA_GOWS_URL;
    expect(evo.servidorDisponivel('waha_gows')).toBe(false);
    expect(evo.servidorDisponivel('waha')).toBe(true);
    process.env.WAHA_WEBHOOK_URL = 'https://api/w';
    expect(evo.webhookUrlDoEnv('waha_gows')).toBe('https://api/w');
    process.env.WAHA_GOWS_WEBHOOK_URL = 'https://api/gows';
    expect(evo.webhookUrlDoEnv('waha_gows')).toBe('https://api/gows');
    delete process.env.WAHA_WEBHOOK_URL;
    delete process.env.WAHA_GOWS_WEBHOOK_URL;
  });
});
