/**
 * Programas da clínica sem login (PrintServer e leitor biométrico):
 * só as rotas deles passam sem usuário, com chave opcional por variável.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { autorizarPrograma } = require('../../server/services/autenticacao');

function req(method: string, path: string, { headers = {}, query = {} }: any = {}) {
  return { method, path, originalUrl: `/api${path}`, headers, query } as any;
}

afterEach(() => {
  delete process.env.PRINTSERVER_API_KEY;
  delete process.env.BIOMETRIA_API_KEY;
});

describe('autorizarPrograma', () => {
  it('libera as rotas do PrintServer sem chave configurada', () => {
    expect(autorizarPrograma(req('GET', '/printserver/jobs/pendentes', { query: { clinicaId: 'c1' } }))).toBe(true);
    expect(autorizarPrograma(req('POST', '/printserver/job/abc/impresso'))).toBe(true);
    expect(autorizarPrograma(req('POST', '/printserver/jobs/impresso'))).toBe(true);
  });

  it('libera as rotas do leitor biométrico usadas pelo programa', () => {
    expect(autorizarPrograma(req('GET', '/biometria/funcionarios'))).toBe(true);
    expect(autorizarPrograma(req('POST', '/biometria/identificar'))).toBe(true);
    expect(autorizarPrograma(req('POST', '/biometria/ponto'))).toBe(true);
    expect(autorizarPrograma(req('POST', '/biometria/funcionarios/u1/digital'))).toBe(true);
  });

  it('não abre outras rotas nem outros métodos', () => {
    expect(autorizarPrograma(req('POST', '/printserver/imprimir'))).toBeNull();
    expect(autorizarPrograma(req('GET', '/printserver/stats'))).toBeNull();
    expect(autorizarPrograma(req('DELETE', '/biometria/cadastro/u1'))).toBeNull();
    expect(autorizarPrograma(req('GET', '/biometria/ponto'))).toBeNull();
    expect(autorizarPrograma(req('GET', '/pacientes'))).toBeNull();
  });

  it('com chave configurada, exige a chave por Bearer, X-Api-Key ou ?token', () => {
    process.env.PRINTSERVER_API_KEY = 'segredo-123';
    const r = '/printserver/jobs/pendentes';
    expect(autorizarPrograma(req('GET', r))).toBe(false);
    expect(autorizarPrograma(req('GET', r, { headers: { authorization: 'Bearer errado' } }))).toBe(false);
    expect(autorizarPrograma(req('GET', r, { headers: { authorization: 'Bearer segredo-123' } }))).toBe(true);
    expect(autorizarPrograma(req('GET', r, { headers: { 'x-api-key': 'segredo-123' } }))).toBe(true);
    expect(autorizarPrograma(req('GET', r, { query: { token: 'segredo-123' } }))).toBe(true);
  });

  it('cada programa usa a própria chave', () => {
    process.env.BIOMETRIA_API_KEY = 'chave-bio';
    expect(autorizarPrograma(req('POST', '/biometria/ponto', { headers: { 'x-api-key': 'chave-bio' } }))).toBe(true);
    expect(autorizarPrograma(req('POST', '/biometria/ponto'))).toBe(false);
    // PrintServer continua sem chave
    expect(autorizarPrograma(req('GET', '/printserver/jobs'))).toBe(true);
  });
});
