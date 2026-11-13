/**
 * Voz do assistente: ElevenLabs ouve (Scribe) e fala (com a voz escolhida
 * pelo super admin); a OpenAI só entra se a ElevenLabs não estiver configurada.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const configs = new Map<string, string>();
const dbFalso = {
  prepare() {
    return {
      async get(chave: string) {
        const v = configs.get(chave);
        return v === undefined ? undefined : { valor: v };
      },
      async run() {
        return { changes: 1 };
      }
    };
  }
};
const caminhoDb = require.resolve('../../server/databaseGlobal');
require.cache[caminhoDb] = { id: caminhoDb, filename: caminhoDb, loaded: true, exports: dbFalso } as any;

const fetchOriginal = globalThis.fetch;
let chamadas: {url: string;opcoes: any;}[] = [];
globalThis.fetch = (async (url: any, opcoes: any) => {
  const u = String(url);
  chamadas.push({ url: u, opcoes });
  if (u.endsWith('/speech-to-text')) {
    return new Response(JSON.stringify({ text: ' marcar Maria quinta às nove ' }), { status: 200 });
  }
  if (u.includes('/text-to-speech/')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
  return new Response('{}', { status: 404 });
}) as any;

const VOZ = require('../../server/services/vozAssistente');

beforeEach(() => {
  chamadas = [];
  configs.clear();
  process.env.ELEVENLABS_API_KEY = 'sk_teste';
  delete process.env.OPENAI_API_KEY;
  delete process.env.ASSISTENTE_VOZ;
});

afterAll(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.ELEVENLABS_API_KEY;
});

describe('provedor da voz do assistente', () => {
  it('prefere a ElevenLabs; sem ela usa a OpenAI; sem nenhuma, nada', () => {
    expect(VOZ.provedor()).toBe('elevenlabs');
    process.env.OPENAI_API_KEY = 'sk-openai';
    expect(VOZ.provedor()).toBe('elevenlabs');
    process.env.ASSISTENTE_VOZ = 'openai';
    expect(VOZ.provedor()).toBe('openai');
    delete process.env.ASSISTENTE_VOZ;
    delete process.env.ELEVENLABS_API_KEY;
    expect(VOZ.provedor()).toBe('openai');
    delete process.env.OPENAI_API_KEY;
    expect(VOZ.provedor()).toBeNull();
  });
});

describe('ouvir e falar pela ElevenLabs', () => {
  it('transcreve com o Scribe em português', async () => {
    const audio = Buffer.alloc(2000, 7).toString('base64');
    const texto = await VOZ.transcrever(audio, 'audio/webm;codecs=opus');
    expect(texto).toBe('marcar Maria quinta às nove');
    expect(chamadas).toHaveLength(1);
    const form = chamadas[0].opcoes.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v2');
    expect(form.get('language_code')).toBe('pt');
    expect((form.get('file') as File).type).toBe('audio/webm');
    expect(chamadas[0].opcoes.headers['xi-api-key']).toBe('sk_teste');
  });

  it('recusa áudio curto sem chamar a ElevenLabs', async () => {
    await expect(VOZ.transcrever(Buffer.alloc(10).toString('base64'), 'audio/webm')).rejects.toThrow(/curto/);
    expect(chamadas).toHaveLength(0);
  });

  it('fala com a voz escolhida pelo super admin', async () => {
    configs.set('ajuda_voz', JSON.stringify({
      ativo: false, vozId: 'JBFqnCBsd6RMkjVDRZzb', vozNome: 'George', ajustes: { velocidade: 1.1 }
    }));
    const r = await VOZ.falar('Consulta marcada.');
    expect(r).toEqual({ audioBase64: Buffer.from([1, 2, 3, 4]).toString('base64'), mime: 'audio/mpeg' });
    expect(chamadas[0].url).toContain('/text-to-speech/JBFqnCBsd6RMkjVDRZzb');
    const corpo = JSON.parse(chamadas[0].opcoes.body);
    expect(corpo.text).toBe('Consulta marcada.');
    expect(corpo.voice_settings.speed).toBe(1.1);
  });

  it('sem voz escolhida, usa a voz padrão', async () => {
    await VOZ.falar('Olá');
    expect(chamadas[0].url).toContain(`/text-to-speech/${VOZ.VOZ_PADRAO_ELEVENLABS}`);
  });
});
