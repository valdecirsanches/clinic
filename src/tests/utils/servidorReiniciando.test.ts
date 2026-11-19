import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.hoisted(() => {
  if (typeof (globalThis as any).window === 'undefined') {
    (globalThis as any).window = { location: { hostname: 'localhost', href: 'http://localhost:5173/', origin: 'http://localhost:5173', protocol: 'http:' } };
  }
});
import { buscarEsperandoServidor } from '../../utils/autenticacaoApi';

// Publicação de versão: a API reinicia e as chamadas feitas nesse intervalo
// devem esperar e ser repetidas, sem erro para o usuário e sem gravar 2 vezes.

const API = 'http://localhost:5171';
const json = (status: number, corpo: unknown) =>
new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const reiniciando = () => json(503, { codigo: 'SERVIDOR_REINICIANDO' });
const recusada = () => Promise.reject(new TypeError('Failed to fetch'));

/** fetch falso: `/api/health` responde conforme `saude()`, o resto pela fila. */
function fetchFalso(fila: Array<() => Promise<Response> | Response>, saude: () => boolean) {
  const chamadas: string[] = [];
  const f = vi.fn(async (input: any) => {
    const url = String(input);
    if (url.includes('/api/health')) {
      if (!saude()) throw new TypeError('Failed to fetch');
      return json(200, { status: 'ok' });
    }
    chamadas.push(url);
    const proxima = fila.shift();
    if (!proxima) throw new Error('chamada inesperada: ' + url);
    return proxima();
  });
  return { f: f as unknown as typeof fetch, chamadas };
}

describe('chamadas enquanto o servidor reinicia', () => {
  const eventos: string[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    eventos.length = 0;
    (window as any).dispatchEvent = (e: Event) => {
      eventos.push(e.type);
      return true;
    };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('GET espera o 503 "reiniciando" passar e devolve a resposta boa', async () => {
    let noAr = false;
    const { f, chamadas } = fetchFalso([reiniciando, () => json(200, [{ id: 1 }])], () => noAr);
    const p = buscarEsperandoServidor(f, `${API}/api/pacientes`, undefined, 'GET', `${API}/api/pacientes`);
    await vi.advanceTimersByTimeAsync(2100); // 1ª sondagem: ainda fora
    noAr = true;
    await vi.advanceTimersByTimeAsync(2100); // 2ª sondagem: voltou
    const r = await p;
    expect(r.status).toBe(200);
    expect(chamadas).toHaveLength(2);
    expect(eventos).toEqual(['servidor-reiniciando', 'servidor-voltou']);
  });

  it('GET com conexão recusada também espera e repete', async () => {
    let noAr = false;
    const { f, chamadas } = fetchFalso([recusada, () => json(200, { ok: true })], () => noAr);
    const p = buscarEsperandoServidor(f, `${API}/api/consultas`, undefined, 'GET', `${API}/api/consultas`);
    noAr = true;
    await vi.advanceTimersByTimeAsync(2100);
    expect((await p).status).toBe(200);
    expect(chamadas).toHaveLength(2);
  });

  it('POST com 502 do proxy (não chegou à API) é repetido', async () => {
    const { f, chamadas } = fetchFalso([() => new Response('bad gateway', { status: 502 }), () => json(200, { id: 'x' })], () => true);
    const init = { method: 'POST', body: JSON.stringify({ nome: 'A' }) };
    const p = buscarEsperandoServidor(f, `${API}/api/pacientes`, init, 'POST', `${API}/api/pacientes`);
    await vi.advanceTimersByTimeAsync(2100);
    expect((await p).status).toBe(200);
    expect(chamadas).toHaveLength(2);
  });

  it('POST com falha de rede e servidor NO AR não é repetido (evita gravar 2 vezes)', async () => {
    const { f, chamadas } = fetchFalso([recusada], () => true);
    const init = { method: 'POST', body: '{}' };
    await expect(buscarEsperandoServidor(f, `${API}/api/consultas`, init, 'POST', `${API}/api/consultas`)).rejects.toThrow('Failed to fetch');
    expect(chamadas).toHaveLength(1);
  });

  it('POST com falha de rede e servidor FORA espera e repete', async () => {
    let noAr = false;
    const { f, chamadas } = fetchFalso([recusada, () => json(200, { ok: true })], () => noAr);
    const init = { method: 'PUT', body: '{}' };
    const p = buscarEsperandoServidor(f, `${API}/api/clinicas/c1`, init, 'PUT', `${API}/api/clinicas/c1`);
    await vi.advanceTimersByTimeAsync(10); // confere a saúde: fora
    noAr = true;
    await vi.advanceTimersByTimeAsync(2100);
    expect((await p).status).toBe(200);
    expect(chamadas).toHaveLength(2);
  });

  it('erros normais (500, 400) não são repetidos', async () => {
    const { f, chamadas } = fetchFalso([() => json(500, { error: 'x' })], () => true);
    const r = await buscarEsperandoServidor(f, `${API}/api/x`, undefined, 'GET', `${API}/api/x`);
    expect(r.status).toBe(500);
    expect(chamadas).toHaveLength(1);
    expect(eventos).toEqual([]);
  });

  it('várias chamadas ao mesmo tempo compartilham uma única espera', async () => {
    let noAr = false;
    const { f } = fetchFalso([reiniciando, reiniciando, reiniciando, () => json(200, 1), () => json(200, 2), () => json(200, 3)], () => noAr);
    const ps = [1, 2, 3].map((i) => buscarEsperandoServidor(f, `${API}/api/a${i}`, undefined, 'GET', `${API}/api/a${i}`));
    noAr = true;
    await vi.advanceTimersByTimeAsync(2100);
    const rs = await Promise.all(ps);
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(eventos.filter((e) => e === 'servidor-reiniciando')).toHaveLength(1);
  });
});
