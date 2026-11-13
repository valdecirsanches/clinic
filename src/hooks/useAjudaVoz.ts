import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config/api';

// ==================== AJUDA POR VOZ ====================
// O servidor narra o tópico com a voz da ElevenLabs escolhida pelo super
// admin (Configurações Globais). Aqui só pedimos o áudio e tocamos.

export type EstadoVoz = 'parado' | 'carregando' | 'tocando' | 'pausado';

export interface ConfigAjudaVoz {
  ativo: boolean;
  vozNome: string | null;
}

const BASE = `${API_BASE_URL}/api/ajuda-voz`;

// A configuração muda raramente: uma consulta por carregamento da página.
let configEmCache: Promise<ConfigAjudaVoz> | null = null;

export function carregarConfigAjudaVoz(forcar = false): Promise<ConfigAjudaVoz> {
  if (!configEmCache || forcar) {
    configEmCache = fetch(`${BASE}/config`).
    then((r) => r.ok ? r.json() : null).
    then((d) => ({ ativo: Boolean(d && d.ativo), vozNome: d && d.vozNome || null })).
    catch(() => ({ ativo: false, vozNome: null }));
  }
  return configEmCache;
}

/** Chamado pela tela de configuração depois de salvar. */
export function esquecerConfigAjudaVoz() {
  configEmCache = null;
  for (const url of audiosPorTopico.values()) URL.revokeObjectURL(url);
  audiosPorTopico.clear();
}

// Áudios já baixados nesta página (o servidor também guarda em cache).
const audiosPorTopico = new Map<string, string>();

async function erroDe(resposta: Response): Promise<Error> {
  const dados = await resposta.json().catch(() => null);
  return new Error(dados?.error || `Falha ao gerar a voz (HTTP ${resposta.status}).`);
}

async function urlDoTopico(topico: string, passo?: number): Promise<string> {
  const chave = passo === undefined ? topico : `${topico}#${passo}`;
  const pronta = audiosPorTopico.get(chave);
  if (pronta) return pronta;
  const r = await fetch(`${BASE}/falar`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(passo === undefined ? { topico } : { topico, passo })
  });
  if (!r.ok) throw await erroDe(r);
  const url = URL.createObjectURL(await r.blob());
  audiosPorTopico.set(chave, url);
  return url;
}

export function useAjudaVoz() {
  const [config, setConfig] = useState<ConfigAjudaVoz>({ ativo: false, vozNome: null });
  const [estado, setEstado] = useState<EstadoVoz>('parado');
  const [topicoTocando, setTopicoTocando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pedidoRef = useRef(0);

  useEffect(() => {
    let vivo = true;
    carregarConfigAjudaVoz().then((c) => vivo && setConfig(c));
    return () => {
      vivo = false;
    };
  }, []);

  const parar = useCallback(() => {
    pedidoRef.current++;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setEstado('parado');
    setTopicoTocando(null);
  }, []);

  // Ao desmontar (painel fechado), a voz para.
  useEffect(() => () => {
    pedidoRef.current++;
    audioRef.current?.pause();
  }, []);

  /** Narra o tópico inteiro, ou só um passo do tour (passo = índice). */
  const ouvir = useCallback(async (topico: string, passo?: number) => {
    const pedido = ++pedidoRef.current;
    audioRef.current?.pause();
    setErro(null);
    setTopicoTocando(passo === undefined ? topico : `${topico}#${passo}`);
    setEstado('carregando');
    try {
      const url = await urlDoTopico(topico, passo);
      if (pedido !== pedidoRef.current) return; // outro pedido passou na frente
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.addEventListener('ended', () => {
          setEstado('parado');
          setTopicoTocando(null);
        });
      }
      const audio = audioRef.current;
      audio.src = url;
      await audio.play();
      if (pedido === pedidoRef.current) setEstado('tocando');
    } catch (e: any) {
      if (pedido !== pedidoRef.current) return;
      setEstado('parado');
      setTopicoTocando(null);
      setErro(e?.name === 'NotAllowedError' ?
      'O navegador bloqueou o som. Clique em Ouvir de novo.' :
      e?.message || 'Não foi possível tocar a ajuda.');
    }
  }, []);

  const pausarOuContinuar = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (estado === 'tocando') {
      audio.pause();
      setEstado('pausado');
    } else if (estado === 'pausado') {
      audio.play().then(() => setEstado('tocando')).catch(() => setEstado('parado'));
    }
  }, [estado]);

  return { config, estado, topicoTocando, erro, ouvir, parar, pausarOuContinuar };
}
