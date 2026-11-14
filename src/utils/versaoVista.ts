import { useEffect, useState } from 'react';
import { VERSAO_ATUAL } from '../config/version';
import { compararVersoes } from './historicoVersoes';

// ==================== NOVIDADES JÁ VISTAS ====================
// Guarda, neste navegador, a versão cujas novidades a pessoa já viu. Serve
// para mostrar "O EasyClin foi atualizado" a quem abre o sistema já numa
// versão nova (sem ter visto o aviso) e o selo "Novo" no menu.

const CHAVE = 'easyclin-versao-vista';
const CHAVE_ATUALIZANDO = 'easyclin-atualizando'; // sessionStorage: clicou "Atualizar agora"
const EVENTO = 'easyclin-versao-vista';

export function lerVersaoVista(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function marcarVersaoVista(versao: string = VERSAO_ATUAL) {
  try {
    const atual = localStorage.getItem(CHAVE);
    if (atual && compararVersoes(atual, versao) >= 0) return;
    localStorage.setItem(CHAVE, versao);
  } catch {/* navegador sem armazenamento */}
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

/**
 * Primeira vez neste navegador: grava a versão atual sem anunciar nada
 * (quem nunca usou não precisa da lista do que mudou).
 * @returns a versão vista ANTES desta abertura (ou null se é a primeira vez).
 */
export function iniciarVersaoVista(): string | null {
  const vista = lerVersaoVista();
  if (!vista) marcarVersaoVista(VERSAO_ATUAL);
  return vista;
}

/** Há novidades desta versão que a pessoa ainda não viu? */
export function temNovidadeNaoVista(vista: string | null = lerVersaoVista()): boolean {
  return Boolean(vista) && compararVersoes(VERSAO_ATUAL, vista as string) > 0;
}

/** Antes de recarregar pelo aviso: depois da recarga mostra só "Atualizado ✓". */
export function avisarQueEstaAtualizando() {
  try {
    sessionStorage.setItem(CHAVE_ATUALIZANDO, '1');
  } catch {/* ignora */}
}

export function consumirAtualizando(): boolean {
  try {
    const sim = sessionStorage.getItem(CHAVE_ATUALIZANDO) === '1';
    sessionStorage.removeItem(CHAVE_ATUALIZANDO);
    return sim;
  } catch {
    return false;
  }
}

/** Reage quando outra parte da tela marca as novidades como vistas. */
export function useNovidadeNaoVista(): boolean {
  const [nao, setNao] = useState(() => temNovidadeNaoVista());
  useEffect(() => {
    const atualizar = () => setNao(temNovidadeNaoVista());
    window.addEventListener(EVENTO, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener(EVENTO, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);
  return nao;
}
