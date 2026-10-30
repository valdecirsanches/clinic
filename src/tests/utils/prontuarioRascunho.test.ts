import { describe, it, expect } from 'vitest';
import { conteudoVazio } from '../../hooks/useRascunhoProntuario';
import { lerPrescricaoMemed } from '../../components/MemedPrescricaoModal';

describe('conteudoVazio (rascunho do prontuário)', () => {
  it('considera vazio o HTML do editor sem texto', () => {
    expect(conteudoVazio('')).toBe(true);
    expect(conteudoVazio('<p><br></p>')).toBe(true);
    expect(conteudoVazio('<p>&nbsp;</p>')).toBe(true);
  });
  it('reconhece texto digitado', () => {
    expect(conteudoVazio('<p>Cefaleia</p>')).toBe(false);
  });
  it('ignora campos de controle (data, controleEspecial) ao avaliar objetos', () => {
    expect(conteudoVazio({ data: '2026-10-30', controleEspecial: false, descricao: '', medicamentos: [] })).toBe(true);
    expect(conteudoVazio({ data: '2026-10-30', descricao: '', medicamentos: [{ nome: 'Dipirona' }] })).toBe(false);
  });
});

describe('lerPrescricaoMemed', () => {
  it('lê o formato aninhado em "prescricao"', () => {
    const info = lerPrescricaoMemed({
      prescricao: { id: 98765, medicamentos: [{ nome: 'Dipirona', posologia: '<p>6/6h</p>', quantidade: '1 caixa' }] }
    });
    expect(info).toEqual({ id: '98765', pdfUrl: '', medicamentos: [{ nome: 'Dipirona', posologia: '6/6h', quantidade: '1 caixa' }] });
  });
  it('lê o formato na raiz com pdfUrl', () => {
    const info = lerPrescricaoMemed({ id: 'abc', pdfUrl: 'https://x/receita.pdf' });
    expect(info?.id).toBe('abc');
    expect(info?.pdfUrl).toBe('https://x/receita.pdf');
  });
  it('devolve null quando não há nada aproveitável', () => {
    expect(lerPrescricaoMemed(null)).toBeNull();
    expect(lerPrescricaoMemed({ foo: 1 })).toBeNull();
  });
});
