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
