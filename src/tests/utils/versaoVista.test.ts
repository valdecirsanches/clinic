import { describe, it, expect, beforeEach } from 'vitest';
import { VERSAO_ATUAL } from '../../config/version';

// localStorage/sessionStorage simulados (o teste roda em Node)
function armazenamento() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.has(k) ? m.get(k)! : null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear()
  };
}
(globalThis as any).localStorage = armazenamento();
(globalThis as any).sessionStorage = armazenamento();

const V = await import('../../utils/versaoVista');

beforeEach(() => {
  (globalThis as any).localStorage.clear();
  (globalThis as any).sessionStorage.clear();
});

describe('novidades já vistas', () => {
  it('primeira vez no navegador: grava a versão atual sem anunciar', () => {
    expect(V.iniciarVersaoVista()).toBeNull();
    expect(V.lerVersaoVista()).toBe(VERSAO_ATUAL);
    expect(V.temNovidadeNaoVista()).toBe(false);
  });

  it('vindo de uma versão antiga: há novidade até marcar como vista', () => {
    localStorage.setItem('easyclin-versao-vista', '2.0.6');
    expect(V.iniciarVersaoVista()).toBe('2.0.6');
    expect(V.temNovidadeNaoVista()).toBe(true);
    V.marcarVersaoVista();
    expect(V.temNovidadeNaoVista()).toBe(false);
  });

  it('nunca volta a versão vista para trás', () => {
    localStorage.setItem('easyclin-versao-vista', '99.0.0');
    V.marcarVersaoVista('2.0.0');
    expect(V.lerVersaoVista()).toBe('99.0.0');
  });

  it('"Atualizar agora" deixa marca só para a próxima abertura', () => {
    V.avisarQueEstaAtualizando();
    expect(V.consumirAtualizando()).toBe(true);
    expect(V.consumirAtualizando()).toBe(false);
  });
});
