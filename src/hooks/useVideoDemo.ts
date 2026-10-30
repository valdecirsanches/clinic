import { useMemo } from 'react';
import { API_BASE_URL } from '../config/api';

export interface VozElevenLabs {
  id: string;
  nome: string;
  categoria: string | null;
  sotaque: string | null;
  genero: string | null;
  previewUrl: string | null;
}

export interface AjustesVoz {
  estabilidade: number;
  similaridade: number;
  estilo: number;
  velocidade: number;
}

export interface StatusVideoDemo {
  elevenLabs: {configurado: boolean;modelo: string;};
  demoClinicaId: string | null;
}

function usuarioDaSessao(): string {
  try {
    const bruto = localStorage.getItem('sessao');
    return bruto ? String(JSON.parse(bruto)?.usuario?.id || '') : '';
  } catch {
    return '';
  }
}

async function erroDe(resposta: Response): Promise<Error> {
  const dados = await resposta.json().catch(() => null);
  return new Error(dados?.error || `Falha (HTTP ${resposta.status}).`);
}

/** API da narração — a chave da ElevenLabs fica só no servidor */
const CHAVE_VOZES = 'videoDemo:vozes';

export function useVideoDemo() {
  const usuarioId = useMemo(usuarioDaSessao, []);
  return useMemo(() => {
    const base = `${API_BASE_URL}/api/video-demo`;
    const qs = `usuarioId=${encodeURIComponent(usuarioId)}`;
    return {
      async status(): Promise<StatusVideoDemo> {
        const r = await fetch(`${base}/status?${qs}`);
        if (!r.ok) throw await erroDe(r);
        return r.json();
      },
      // Carregadas uma única vez por sessão do navegador
      async vozes(): Promise<VozElevenLabs[]> {
        const guardadas = sessionStorage.getItem(CHAVE_VOZES);
        if (guardadas) {
          try {
            const lista = JSON.parse(guardadas) as VozElevenLabs[];
            if (lista.length) return lista;
          } catch {
            sessionStorage.removeItem(CHAVE_VOZES);
          }
        }
        const r = await fetch(`${base}/vozes?${qs}`);
        if (!r.ok) throw await erroDe(r);
        const lista = (await r.json()) as VozElevenLabs[];
        if (lista.length) sessionStorage.setItem(CHAVE_VOZES, JSON.stringify(lista));
        return lista;
      },
      async narracao(voiceId: string, texto: string, ajustes: AjustesVoz): Promise<Blob> {
        const r = await fetch(`${base}/narracao?${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ usuarioId, voiceId, texto, ajustes })
        });
        if (!r.ok) throw await erroDe(r);
        return r.blob();
      }
    };
  }, [usuarioId]);
}