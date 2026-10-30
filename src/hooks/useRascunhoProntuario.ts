import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * RASCUNHO AUTOMÁTICO DO PRONTUÁRIO
 *
 * Antes, o que o profissional digitava só existia na memória da tela: bastava
 * ir para a Agenda (ou o navegador fechar) para perder a anamnese inteira,
 * sem nenhum aviso. Este hook:
 *   • guarda neste computador, a cada alteração, o conteúdo NÃO SALVO de cada
 *     etapa do atendimento (localStorage, por clínica + paciente + consulta);
 *   • apaga o rascunho da etapa assim que o servidor confirma o salvamento;
 *   • expõe o estado de cada etapa (alterado / salvando / salvo / erro) para o
 *     indicador da tela;
 *   • pede confirmação ao fechar a aba com algo não salvo.
 *
 * Rascunhos com mais de 14 dias são descartados automaticamente.
 */

export type EstadoEtapa = 'alterado' | 'salvando' | 'salvo' | 'erro';
export interface RascunhoEtapa {
  dados: unknown;
  em: number;
}
export type MapaRascunhos = Record<string, RascunhoEtapa>;

const PREFIXO = 'easyclin_rascunho:v1:';
const VALIDADE_MS = 14 * 24 * 60 * 60 * 1000;

function ler(chave: string): MapaRascunhos {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    if (!bruto) return {};
    const obj = JSON.parse(bruto) as MapaRascunhos;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function gravar(chave: string, mapa: MapaRascunhos) {
  try {
    if (Object.keys(mapa).length === 0) localStorage.removeItem(PREFIXO + chave);else
    localStorage.setItem(PREFIXO + chave, JSON.stringify(mapa));
  } catch {
    /* storage cheio ou bloqueado: segue sem rascunho local */
  }
}

/** Remove rascunhos antigos de qualquer atendimento (roda uma vez por carga). */
let limpezaFeita = false;
function limparAntigos() {
  if (limpezaFeita) return;
  limpezaFeita = true;
  try {
    const agora = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIXO)) continue;
      const mapa = ler(k.slice(PREFIXO.length));
      const recentes = Object.fromEntries(
        Object.entries(mapa).filter(([, r]) => r && agora - r.em < VALIDADE_MS)
      );
      gravar(k.slice(PREFIXO.length), recentes);
    }
  } catch {
    /* ignora */
  }
}

/** Texto "vazio" (inclusive HTML do editor sem conteúdo). */
export function conteudoVazio(dados: unknown): boolean {
  if (dados === null || dados === undefined) return true;
  if (typeof dados === 'string') {
    return !dados.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
  if (Array.isArray(dados)) return dados.every(conteudoVazio);
  if (typeof dados === 'object') {
    return Object.entries(dados as Record<string, unknown>).
    filter(([k]) => !/^(data|controleEspecial|id|tipo)$/.test(k)).
    every(([, v]) => typeof v === 'boolean' || typeof v === 'number' || conteudoVazio(v));
  }
  return false;
}

export function useRascunhoProntuario(chave: string | null) {
  const chaveRef = useRef(chave);
  chaveRef.current = chave;
  const [estados, setEstados] = useState<Record<string, {estado: EstadoEtapa;em: number;}>>({});
  const [pendentesAoAbrir, setPendentesAoAbrir] = useState<MapaRascunhos>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const ultimoDado = useRef<Record<string, unknown>>({});

  // Ao abrir (ou trocar de atendimento): o que ficou sem salvar da última vez?
  useEffect(() => {
    limparAntigos();
    setEstados({});
    ultimoDado.current = {};
    setPendentesAoAbrir(chave ? ler(chave) : {});
  }, [chave]);

  const gravarAgora = useCallback((etapa: string) => {
    const c = chaveRef.current;
    if (!c) return;
    const mapa = ler(c);
    const dados = ultimoDado.current[etapa];
    if (conteudoVazio(dados)) delete mapa[etapa];else
    mapa[etapa] = { dados, em: Date.now() };
    gravar(c, mapa);
  }, []);

  /** Chame a cada alteração feita pelo usuário numa etapa. */
  const alterar = useCallback((etapa: string, dados: unknown) => {
    if (!chaveRef.current) return;
    ultimoDado.current[etapa] = dados;
    const vazio = conteudoVazio(dados);
    setEstados((prev) => {
      const atual = prev[etapa];
      // Texto vazio numa etapa que não tinha alteração não é "alteração"
      if (vazio && (!atual || atual.estado === 'salvo')) return prev;
      if (atual && atual.estado === 'alterado') return prev;
      return { ...prev, [etapa]: { estado: 'alterado', em: Date.now() } };
    });
    clearTimeout(timers.current[etapa]);
    timers.current[etapa] = setTimeout(() => gravarAgora(etapa), 600);
  }, [gravarAgora]);

  /** Etapa salva no servidor: apaga o rascunho local dela. */
  const marcarSalvo = useCallback((etapa: string) => {
    clearTimeout(timers.current[etapa]);
    delete ultimoDado.current[etapa];
    const c = chaveRef.current;
    if (c) {
      const mapa = ler(c);
      delete mapa[etapa];
      gravar(c, mapa);
    }
    setEstados((prev) => ({ ...prev, [etapa]: { estado: 'salvo', em: Date.now() } }));
  }, []);

  /**
   * Envolve o onSave de uma etapa: mostra "Salvando…", apaga o rascunho se
   * der certo e mantém o rascunho (estado "erro") se falhar.
   */
  const comSalvamento = useCallback(
    <A extends unknown[], R>(etapa: string, salvar: ((...args: A) => Promise<R> | R) | undefined) => {
      if (!salvar) return undefined;
      return async (...args: A): Promise<R> => {
        setEstados((prev) => ({ ...prev, [etapa]: { estado: 'salvando', em: Date.now() } }));
        try {
          const r = await salvar(...args);
          marcarSalvo(etapa);
          return r;
        } catch (err) {
          gravarAgora(etapa);
          setEstados((prev) => ({ ...prev, [etapa]: { estado: 'erro', em: Date.now() } }));
          throw err;
        }
      };
    },
    [marcarSalvo, gravarAgora]
  );

  /** Descarta os rascunhos encontrados ao abrir (ou só algumas etapas). */
  const descartar = useCallback((etapas?: string[]) => {
    const c = chaveRef.current;
    if (!c) return;
    const mapa = ler(c);
    (etapas || Object.keys(mapa)).forEach((e) => {
      delete mapa[e];
      delete ultimoDado.current[e];
    });
    gravar(c, mapa);
    setPendentesAoAbrir({});
    setEstados((prev) => {
      const novo = { ...prev };
      (etapas || Object.keys(novo)).forEach((e) => {if (novo[e]?.estado !== 'salvo') delete novo[e];});
      return novo;
    });
  }, []);

  /** Os rascunhos encontrados ao abrir já foram aplicados na tela. */
  const restaurados = useCallback((mapa: MapaRascunhos) => {
    Object.entries(mapa).forEach(([etapa, r]) => {ultimoDado.current[etapa] = r.dados;});
    setEstados((prev) => {
      const novo = { ...prev };
      Object.keys(mapa).forEach((e) => {novo[e] = { estado: 'alterado', em: Date.now() };});
      return novo;
    });
    setPendentesAoAbrir({});
  }, []);

  const naoSalvas = useMemo(
    () => Object.entries(estados).filter(([, v]) => v.estado === 'alterado' || v.estado === 'erro' || v.estado === 'salvando').map(([k]) => k),
    [estados]
  );

  // Fechar/recarregar a aba com algo não salvo: o navegador pergunta antes.
  useEffect(() => {
    if (naoSalvas.length === 0) return;
    const aviso = (e: BeforeUnloadEvent) => {
      Object.keys(ultimoDado.current).forEach(gravarAgora);
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [naoSalvas.length, gravarAgora]);

  // Ao sair da tela, grava imediatamente o que ainda estava no debounce
  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
    Object.keys(ultimoDado.current).forEach(gravarAgora);
  }, [gravarAgora]);

  return { estados, naoSalvas, pendentesAoAbrir, alterar, marcarSalvo, comSalvamento, descartar, restaurados };
}
