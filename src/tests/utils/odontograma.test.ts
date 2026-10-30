import { describe, it, expect } from 'vitest';
import { normalizarDente, montarDente, listarAchados, infoDente, denticaoSugerida } from '../../components/odontograma/modelo';

describe('odontograma — compatibilidade com registros antigos', () => {
  it('status + faces antigos viram condições por face', () => {
    const n = normalizarDente({ status: 'cariado', faces: { mesial: true, oclusal: true } });
    expect(n.condicoesFaces).toEqual({ mesial: 'cariado', oclusal: 'cariado' });
    expect(n.marcas).toEqual([]);
  });
  it('status de dente inteiro vira marca', () => {
    expect(normalizarDente({ status: 'implante' }).marcas).toEqual(['implante']);
    expect(normalizarDente({ status: 'cariado' }).marcas).toEqual(['cariado']);
  });
});

describe('odontograma — gravação', () => {
  it('deriva status e faces (formato antigo) do formato novo', () => {
    const r = montarDente({ distal: 'restaurado', oclusal: 'cariado' }, ['tratamento_canal'], '');
    expect(r?.status).toBe('tratamento_canal');
    expect(r?.faces).toEqual({ distal: true, oclusal: true });
  });
  it('dente sem nada marcado é removido', () => {
    expect(montarDente({}, [], '   ')).toBeNull();
  });
});

describe('odontograma — achados e nomes', () => {
  it('lista faces com siglas (palatina no superior)', () => {
    const a = listarAchados({ '16': { status: 'cariado', condicoesFaces: { mesial: 'cariado', lingual: 'cariado' } } });
    expect(a).toEqual([{ dente: '16', texto: 'Cárie (MP)', grupo: 'tratar' }]);
  });
  it('identifica o dente pelo número FDI', () => {
    expect(infoDente('36').nome).toBe('Primeiro molar inferior esquerdo');
    expect(infoDente('53').nome).toBe('Canino superior direito (decíduo)');
  });
  it('sugere a dentição pela idade', () => {
    const anos = (n: number) => new Date(Date.now() - n * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(denticaoSugerida(anos(4))).toBe('decidua');
    expect(denticaoSugerida(anos(9))).toBe('mista');
    expect(denticaoSugerida(anos(30))).toBe('permanente');
  });
});
