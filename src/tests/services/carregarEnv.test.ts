/**
 * Todos os .env.local são lidos: o de server/ vence o de src/, mas uma chave
 * que só existe em src/.env.local (ex.: OPENAI_API_KEY) não é mais ignorada.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { caminhosPadrao, carregarEnv } = require('../../server/services/carregarEnv');
const dotenv = require('../../server/node_modules/dotenv');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'env-'));
const serverDir = path.join(raiz, 'src', 'server');
fs.mkdirSync(serverDir, { recursive: true });

afterAll(() => fs.rmSync(raiz, { recursive: true, force: true }));

describe('carregarEnv', () => {
  it('lê server/ e src/; server/ vence; arquivo vence o ambiente herdado', () => {
    fs.writeFileSync(path.join(serverDir, '.env.local'), 'MYSQL_HOST=servidor\nELEVENLABS_API_KEY=sk_el\n');
    fs.writeFileSync(path.join(raiz, 'src', '.env.local'), 'MYSQL_HOST=src\nOPENAI_API_KEY=sk-openai\n');
    const env: Record<string, string> = { MYSQL_HOST: 'herdado-do-pm2', OUTRA: 'fica' };

    const { arquivos, origem } = carregarEnv(caminhosPadrao(serverDir, serverDir), { dotenv, env });

    expect(arquivos).toHaveLength(2);
    expect(env.MYSQL_HOST).toBe('servidor');
    expect(env.ELEVENLABS_API_KEY).toBe('sk_el');
    expect(env.OPENAI_API_KEY).toBe('sk-openai');
    expect(env.OUTRA).toBe('fica');
    expect(origem.OPENAI_API_KEY).toBe(path.join(raiz, 'src', '.env.local'));
  });

  it('não repete o mesmo arquivo quando o diretório de execução coincide', () => {
    const lista = caminhosPadrao(serverDir, serverDir);
    expect(new Set(lista).size).toBe(lista.length);
  });
});
