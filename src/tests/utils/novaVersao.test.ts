import { describe, it, expect } from 'vitest';
import { versaoMudou } from '../../components/AvisoNovaVersao';

describe('aviso de versão nova', () => {
  it('avisa só quando a versão publicada é diferente da carregada', () => {
    expect(versaoMudou({ id: 'abc' }, { id: 'abc' })).toBe(false);
    expect(versaoMudou({ id: 'abc' }, { id: 'def' })).toBe(true);
  });
  it('sem resposta do servidor ou sem versão de referência, não avisa', () => {
    expect(versaoMudou(null, { id: 'def' })).toBe(false);
    expect(versaoMudou({ id: 'abc' }, null)).toBe(false);
  });
});

import { novidadeDoCommit } from '../../vite-plugin-versao';

describe('novidade mostrada ao usuário', () => {
  it('usa só a linha "Novidade:" da mensagem do commit', () => {
    expect(novidadeDoCommit('Título técnico\n\nDetalhes\nNovidade: Ajuda por voz em todas as telas.\n')).toBe('Ajuda por voz em todas as telas.');
    expect(novidadeDoCommit('Só título técnico')).toBeNull();
    expect(novidadeDoCommit(null)).toBeNull();
  });
});

import { HISTORICO_VERSOES, VERSAO_ATUAL, APP_VERSION_SHORT } from '../../config/version';
import { versoesNovas, compararVersoes, formatarDataVersao } from '../../utils/historicoVersoes';

describe('histórico de versões', () => {
  it('a versão exibida é a do topo do histórico', () => {
    expect(VERSAO_ATUAL).toBe(HISTORICO_VERSOES[0].versao);
    expect(APP_VERSION_SHORT).toBe(`v${VERSAO_ATUAL}`);
  });

  it('versões únicas, da mais nova para a mais antiga, com data e o que mudou', () => {
    const numeros = HISTORICO_VERSOES.map((v) => v.versao);
    expect(new Set(numeros).size).toBe(numeros.length);
    for (let i = 1; i < HISTORICO_VERSOES.length; i++) {
      expect(compararVersoes(HISTORICO_VERSOES[i - 1].versao, HISTORICO_VERSOES[i].versao), numeros[i]).toBeGreaterThan(0);
      expect(HISTORICO_VERSOES[i - 1].data >= HISTORICO_VERSOES[i].data, numeros[i]).toBe(true);
    }
    for (const v of HISTORICO_VERSOES) {
      expect(v.versao).toMatch(/^\d+\.\d+\.\d+$/);
      expect(v.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.itens.length, v.versao).toBeGreaterThan(0);
    }
  });

  it('o aviso lista só as versões mais novas que a do usuário', () => {
    const h = [
    { versao: '2.1.10', data: '2026-11-14', itens: ['c'] },
    { versao: '2.1.9', data: '2026-11-13', itens: ['b'] },
    { versao: '2.1.0', data: '2026-11-12', itens: ['a'] }];
    expect(versoesNovas(h, '2.1.0').map((v) => v.versao)).toEqual(['2.1.10', '2.1.9']);
    expect(versoesNovas(h, '2.1.10')).toEqual([]);
    expect(compararVersoes('2.1.10', '2.1.9')).toBeGreaterThan(0);
  });

  it('data de calendário sem fuso', () => {
    expect(formatarDataVersao('2026-11-13')).toBe('13/11/2026');
  });
});
