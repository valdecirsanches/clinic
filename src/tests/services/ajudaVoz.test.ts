/**
 * Ajuda por voz: o super admin escolhe a voz; qualquer usuário logado ouve
 * a ajuda de uma tela. Só textos do catálogo são narrados, e cada áudio é
 * gerado uma única vez (cache em disco).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';

const require = createRequire(import.meta.url);

// ---- banco global simulado (só configuracoes_globais e usuarios) ----
const configs = new Map<string, string>();
const usuarios: Record<string, any> = {
  su: { id: 'su', nome: 'Super', email: 'su@x', tipo: 'super_admin', ativo: 1 },
  at: { id: 'at', nome: 'Atendente', email: 'at@x', tipo: 'atendente', ativo: 1 }
};
const dbFalso = {
  prepare(sql: string) {
    return {
      async get(...p: any[]) {
        if (/FROM usuarios/.test(sql)) return usuarios[p[0]];
        const v = configs.get(p[0]);
        return v === undefined ? undefined : { valor: v };
      },
      async run(...p: any[]) {
        if (/^UPDATE/.test(sql)) {
          if (!configs.has(p[2])) return { changes: 0 };
          configs.set(p[2], p[0]);
          return { changes: 1 };
        }
        configs.set(p[1], p[2]);
        return { changes: 1 };
      }
    };
  }
};
const caminhoDb = require.resolve('../../server/databaseGlobal');
require.cache[caminhoDb] = { id: caminhoDb, filename: caminhoDb, loaded: true, exports: dbFalso } as any;

// ---- ElevenLabs simulada ----
const fetchOriginal = globalThis.fetch;
let chamadasTts: { url: string; corpo: any }[] = [];
globalThis.fetch = (async (url: any, opcoes: any) => {
  const u = String(url);
  if (u.startsWith('https://api.elevenlabs.io/')) {
    if (u.includes('/text-to-speech/')) {
      chamadasTts.push({ url: u, corpo: JSON.parse(opcoes.body) });
      return new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { status: 200 });
    }
    return new Response(JSON.stringify({ voices: [{ voice_id: 'vozA1234abcd', name: 'Ana', labels: {} }] }), { status: 200 });
  }
  return fetchOriginal(url, opcoes);
}) as any;

const pastaCache = fs.mkdtempSync(path.join(os.tmpdir(), 'ajuda-voz-'));
process.env.AJUDA_VOZ_CACHE_DIR = pastaCache;
process.env.ELEVENLABS_API_KEY = 'sk_teste';

const express = require('../../server/node_modules/express');
const rota = require('../../server/routes/ajuda-voz');
const { catalogo, textoNarracao, buscarTopico } = require('../../server/ajuda/catalogo');

let base = '';
let servidor: any;

beforeAll(async () => {
  const app = express();
  app.use((req: any, _res: any, next: any) => {
    const id = req.get('x-teste-usuario');
    if (id) req.usuario = usuarios[id];
    next();
  });
  app.use('/api/ajuda-voz', rota);
  await new Promise<void>((ok) => {
    servidor = app.listen(0, '127.0.0.1', () => ok());
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/ajuda-voz`;
});

afterAll(() => {
  servidor?.close();
  globalThis.fetch = fetchOriginal;
  fs.rmSync(pastaCache, { recursive: true, force: true });
});

beforeEach(() => {
  chamadasTts = [];
});

function pedir(caminho: string, usuario: string, corpo?: unknown) {
  return fetchOriginal(`${base}${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { 'x-teste-usuario': usuario, 'Content-Type': 'text/plain;charset=UTF-8' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
}

describe('catálogo de ajuda', () => {
  it('tem ids únicos e todo tópico com título, resumo e passos', () => {
    const ids = catalogo.topicos.map((t: any) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of catalogo.topicos) {
      expect(t.titulo, t.id).toBeTruthy();
      expect(t.resumo, t.id).toBeTruthy();
      expect(Array.isArray(t.passos), t.id).toBe(true);
    }
  });

  it('cobre todas as telas do menu', () => {
    const telas = [
    'dashboard', 'agenda', 'fila_atendimento', 'agenda_profissional', 'pacientes', 'prontuarios',
    'prontuario_atendimento', 'clinicas', 'convenios', 'empresas_conveniadas', 'especialidades',
    'medicamentos', 'operadoras', 'planos_saude', 'procedimentos', 'usuarios', 'cobrancas',
    'assinatura', 'assinatura_gestao', 'planos', 'ponto', 'ponto_facial', 'auditoria', 'sessoes',
    'backup', 'cid10', 'dossie', 'video_demo', 'mensagens', 'whatsapp_meta', 'configuracoes',
    'configuracoes_globais', 'memed_profissionais'];
    for (const tela of telas) expect(buscarTopico(tela), tela).not.toBeNull();
  });

  it('narra título, resumo, passos e dicas em frases', () => {
    const texto = textoNarracao(buscarTopico('agenda'));
    expect(texto.startsWith('Agenda. ')).toBe(true);
    expect(texto).toContain('Dica:');
    expect(texto.length).toBeLessThan(2500);
  });
});

describe('rota /api/ajuda-voz', () => {
  it('começa desativada e não narra', async () => {
    const r = await pedir('/config', 'at');
    expect(await r.json()).toEqual({ ativo: false, vozNome: null });
    const f = await pedir('/falar', 'at', { topico: 'agenda' });
    expect(f.status).toBe(409);
  });

  it('só o super admin lista vozes, testa e salva a configuração', async () => {
    expect((await pedir('/vozes', 'at')).status).toBe(403);
    expect((await pedir('/admin', 'at', { ativo: true, vozId: 'vozA1234abcd' })).status).toBe(403);
    expect((await pedir('/teste', 'at', { vozId: 'vozA1234abcd' })).status).toBe(403);

    const vozes = await (await pedir('/vozes', 'su')).json();
    expect(vozes[0]).toMatchObject({ id: 'vozA1234abcd', nome: 'Ana' });

    const teste = await pedir('/teste', 'su', { vozId: 'vozA1234abcd' });
    expect(teste.headers.get('content-type')).toBe('audio/mpeg');

    const semVoz = await pedir('/admin', 'su', { ativo: true, vozId: '' });
    expect(semVoz.status).toBe(400);

    const salvo = await pedir('/admin', 'su', {
      ativo: true, vozId: 'vozA1234abcd', vozNome: 'Ana', ajustes: { velocidade: 9 }
    });
    expect(salvo.status).toBe(200);
    const { config } = await salvo.json();
    expect(config.ajustes.velocidade).toBe(1.2); // limitado

    expect(await (await pedir('/config', 'at')).json()).toEqual({ ativo: true, vozNome: 'Ana' });
  });

  it('narra só tópicos do catálogo, com a voz escolhida, e usa o cache', async () => {
    expect((await pedir('/falar', 'at', { topico: 'qualquer coisa' })).status).toBe(404);

    const primeira = await pedir('/falar', 'at', { topico: 'pacientes' });
    expect(primeira.status).toBe(200);
    expect(primeira.headers.get('x-ajuda-cache')).toBe('nao');
    expect(chamadasTts).toHaveLength(1);
    expect(chamadasTts[0].url).toContain('/text-to-speech/vozA1234abcd');
    expect(chamadasTts[0].corpo.text).toBe(textoNarracao(buscarTopico('pacientes')));

    const segunda = await pedir('/falar', 'at', { topico: 'pacientes' });
    expect(segunda.headers.get('x-ajuda-cache')).toBe('sim');
    expect(chamadasTts).toHaveLength(1);
  });

  it('narra um passo do tour pelo índice', async () => {
    const { passosDoTour } = require('../../server/ajuda/catalogo');
    const r = await pedir('/falar', 'at', { topico: 'agenda', passo: 1 });
    expect(r.status).toBe(200);
    expect(chamadasTts[0].corpo.text).toBe(passosDoTour(buscarTopico('agenda'))[1].texto);
    expect((await pedir('/falar', 'at', { topico: 'agenda', passo: 99 })).status).toBe(404);
    expect((await pedir('/falar', 'at', { topico: 'agenda', passo: 'x' })).status).toBe(404);
  });

  it('pedidos simultâneos do mesmo tópico geram o áudio uma vez só', async () => {
    const respostas = await Promise.all([1, 2, 3].map(() => pedir('/falar', 'at', { topico: 'cobrancas' })));
    expect(respostas.every((r) => r.status === 200)).toBe(true);
    expect(chamadasTts).toHaveLength(1);
  });

  it('sem chave da ElevenLabs a ajuda aparece como desativada', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    try {
      expect(await (await pedir('/config', 'at')).json()).toEqual({ ativo: false, vozNome: 'Ana' });
    } finally {
      process.env.ELEVENLABS_API_KEY = 'sk_teste';
    }
  });
});
