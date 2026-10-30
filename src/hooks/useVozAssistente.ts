import { useCallback, useEffect, useRef, useState } from 'react';
import { assistenteApi } from '../utils/assistenteApi';

interface Contexto {
  clinicaId: string;
  usuarioId: string;
}

const NOMES_FEMININOS = ['francisca', 'luciana', 'maria', 'fernanda', 'vitória', 'vitoria', 'camila', 'thalita', 'raquel', 'helena', 'joana', 'female', 'feminina', 'google português do brasil'];
const NOMES_MASCULINOS = /daniel|ant[oô]nio|ricardo|felipe|duarte|cristiano|male\b|masculin/i;
const LIMITE_CACHE = 24;

/** Melhor voz feminina pt-BR instalada no navegador (reserva da voz da OpenAI). */
function vozFemininaDoNavegador(): SpeechSynthesisVoice | undefined {
  const sintese = window.speechSynthesis;
  if (!sintese) return undefined;
  const pt = sintese.getVoices().filter((v) => v.lang?.toLowerCase().replace('_', '-').startsWith('pt'));
  const br = pt.filter((v) => v.lang.toLowerCase().replace('_', '-') === 'pt-br');
  const lista = br.length ? br : pt;
  return (
    lista.find((v) => NOMES_FEMININOS.some((n) => v.name.toLowerCase().includes(n)) && !NOMES_MASCULINOS.test(v.name)) ||
    lista.find((v) => !NOMES_MASCULINOS.test(v.name)) ||
    lista[0]);

}

/**
 * Voz da assistente: feminina e natural, gerada pela OpenAI no servidor.
 * Se o servidor não conseguir, usa a melhor voz feminina do navegador.
 */
export function useVozAssistente(ctx: Contexto, ativa: boolean) {
  const [falando, setFalando] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());
  const servidorFalhou = useRef(false);
  const geracao = useRef(0);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  // As vozes do navegador carregam depois da página.
  useEffect(() => {
    const s = window.speechSynthesis;
    if (!s) return;
    s.getVoices();
    const carregar = () => s.getVoices();
    s.addEventListener?.('voiceschanged', carregar);
    return () => s.removeEventListener?.('voiceschanged', carregar);
  }, []);

  const parar = useCallback(() => {
    geracao.current++;
    audio.current?.pause();
    audio.current = null;
    window.speechSynthesis?.cancel();
    setFalando(false);
  }, []);

  const falarNoNavegador = (texto: string) => {
    const sintese = window.speechSynthesis;
    if (!sintese) return setFalando(false);
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = 'pt-BR';
    const voz = vozFemininaDoNavegador();
    if (voz) fala.voice = voz;
    fala.rate = 1;
    fala.pitch = 1.1;
    fala.onend = () => setFalando(false);
    fala.onerror = () => setFalando(false);
    sintese.speak(fala);
  };

  const falar = useCallback(
    async (texto: string, forcar = false) => {
      const limpo = texto.trim();
      if (!ativa && !forcar || !limpo) return;
      parar();
      const minha = ++geracao.current;
      setFalando(true);
      if (!servidorFalhou.current) {
        try {
          let src = cache.current.get(limpo);
          if (!src) {
            const r = await assistenteApi.falar(ctxRef.current, limpo);
            src = `data:${r.mime || 'audio/mpeg'};base64,${r.audioBase64}`;
            cache.current.set(limpo, src);
            if (cache.current.size > LIMITE_CACHE) cache.current.delete(cache.current.keys().next().value as string);
          }
          if (minha !== geracao.current) return;
          const el = new Audio(src);
          audio.current = el;
          el.onended = () => minha === geracao.current && setFalando(false);
          el.onerror = () => minha === geracao.current && setFalando(false);
          await el.play();
          return;
        } catch {
          // Servidor sem a voz (versão antiga, crédito, rede): usa o navegador nesta sessão.
          servidorFalhou.current = true;
        }
      }
      if (minha === geracao.current) falarNoNavegador(limpo);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ativa, parar]
  );

  useEffect(() => {
    if (!ativa) parar();
  }, [ativa, parar]);

  useEffect(() => parar, [parar]);

  return { falar, parar, falando };
}