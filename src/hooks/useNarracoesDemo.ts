import { useCallback, useMemo, useRef, useState } from 'react';
import type { CenaDemo } from '../data/demoRoteiro';
import type { AjustesVoz } from './useVideoDemo';

export interface AudioCena {
  url: string;
  /** Texto + voz + ajustes usados: se mudar, o áudio fica desatualizado */
  assinatura: string;
  duracao: number;
}

type GerarNarracao = (voiceId: string, texto: string, ajustes: AjustesVoz) => Promise<Blob>;

function duracaoDoAudio(url: string): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio(url);
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => resolve(0);
  });
}

/** Narrações das cenas (ElevenLabs), mantidas em memória nesta sessão */
export function useNarracoesDemo(gerarNarracao: GerarNarracao, voiceId: string, ajustes: AjustesVoz, cenas: CenaDemo[]) {
  const [audios, setAudios] = useState<Record<string, AudioCena>>({});
  const [gerando, setGerando] = useState<string | null>(null);
  const [lote, setLote] = useState<{feitas: number;total: number;} | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const audiosRef = useRef(audios);
  audiosRef.current = audios;

  const assinaturaDe = useCallback(
    (c: CenaDemo) => `${voiceId}|${JSON.stringify(ajustes)}|${c.narracao.trim()}`,
    [voiceId, ajustes]
  );

  const atualizado = useCallback(
    (c: CenaDemo) => audios[c.id]?.assinatura === assinaturaDe(c),
    [audios, assinaturaDe]
  );

  const pendentes = useMemo(() => cenas.filter((c) => c.narracao.trim() && !atualizado(c)), [cenas, atualizado]);

  /** Só os áudios que correspondem ao texto/voz atuais: id → url */
  const urlsAtuais = useMemo(
    () => Object.fromEntries(cenas.filter((c) => atualizado(c)).map((c) => [c.id, audios[c.id].url])),
    [cenas, audios, atualizado]
  );

  const gerar = useCallback(
    async (cena: CenaDemo) => {
      if (!voiceId) throw new Error('Escolha uma voz.');
      if (!cena.narracao.trim()) return;
      setGerando(cena.id);
      setErro(null);
      try {
        const blob = await gerarNarracao(voiceId, cena.narracao, ajustes);
        const url = URL.createObjectURL(blob);
        const duracao = await duracaoDoAudio(url);
        setAudios((a) => {
          if (a[cena.id]) URL.revokeObjectURL(a[cena.id].url);
          return { ...a, [cena.id]: { url, assinatura: assinaturaDe(cena), duracao } };
        });
      } catch (e) {
        const msg = `Narração da cena "${cena.titulo}": ${e instanceof Error ? e.message : 'falhou'}`;
        setErro(msg);
        throw new Error(msg);
      } finally {
        setGerando(null);
      }
    },
    [voiceId, ajustes, gerarNarracao, assinaturaDe]
  );

  /** Gera todas as que faltam. true = todas prontas */
  const gerarPendentes = useCallback(async (): Promise<boolean> => {
    const lista = pendentes;
    if (!lista.length) return true;
    setLote({ feitas: 0, total: lista.length });
    try {
      for (let i = 0; i < lista.length; i += 1) {
        await gerar(lista[i]);
        setLote({ feitas: i + 1, total: lista.length });
      }
      return true;
    } catch {
      return false;
    } finally {
      setLote(null);
    }
  }, [pendentes, gerar]);

  return { audios, urlsAtuais, gerando, lote, erro, setErro, pendentes, atualizado, gerar, gerarPendentes };
}