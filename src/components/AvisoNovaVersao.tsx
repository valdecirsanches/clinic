import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCwIcon, XIcon } from 'lucide-react';
import { DEMO_VIDEO } from '../utils/modoDemo';

// ==================== AVISO DE VERSÃO NOVA ====================
// Ao abrir, guarda a versão publicada (/versao.json, gerado pelo
// vite-plugin-versao). Confere de novo a cada 5 minutos e quando a aba volta
// a ficar visível; se mudou, avisa e oferece recarregar.

export interface VersaoPublicada {
  id: string;
  commit?: string | null;
  data?: string;
  novidade?: string | null;
}

const INTERVALO = 5 * 60 * 1000;
const INTERVALO_MINIMO = 60 * 1000;
const ADIAR = 30 * 60 * 1000;

const URL_VERSAO = `${(import.meta as any).env?.BASE_URL || '/'}versao.json`;

export async function buscarVersao(): Promise<VersaoPublicada | null> {
  try {
    const r = await fetch(`${URL_VERSAO}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const tipo = r.headers.get('content-type') || '';
    if (!tipo.includes('json')) return null; // servidor devolveu o index.html: sem arquivo de versão
    const dados = await r.json();
    return dados && typeof dados.id === 'string' && dados.id ? dados : null;
  } catch {
    return null;
  }
}

/** Há versão nova? (sem versão de referência ou sem resposta, não avisa) */
export function versaoMudou(carregada: VersaoPublicada | null, publicada: VersaoPublicada | null): boolean {
  return Boolean(carregada && publicada && carregada.id !== publicada.id);
}

function formatarData(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function AvisoNovaVersao() {
  const carregadaRef = useRef<VersaoPublicada | null>(null);
  const ultimaConsultaRef = useRef(0);
  const adiadoAteRef = useRef(0);
  const [nova, setNova] = useState<VersaoPublicada | null>(null);

  const conferir = useCallback(async (forcar = false) => {
    const agora = Date.now();
    if (!forcar && agora - ultimaConsultaRef.current < INTERVALO_MINIMO) return;
    ultimaConsultaRef.current = agora;
    const publicada = await buscarVersao();
    if (!carregadaRef.current) {
      carregadaRef.current = publicada; // versão que esta página carregou
      return;
    }
    if (versaoMudou(carregadaRef.current, publicada) && Date.now() >= adiadoAteRef.current) {
      setNova(publicada);
    }
  }, []);

  useEffect(() => {
    if (DEMO_VIDEO) return; // gravação do vídeo: nada aparece por cima
    conferir(true);
    const timer = window.setInterval(() => conferir(true), INTERVALO);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') conferir();
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [conferir]);

  if (!nova) return null;

  const quando = formatarData(nova.data);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-3 z-[80] w-[min(560px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-teal-200 bg-white p-4 shadow-2xl">

      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
          <RefreshCwIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Nova versão do EasyClin disponível</p>
          {nova.novidade && <p className="mt-0.5 text-sm text-gray-700">{nova.novidade}</p>}
          <p className="mt-0.5 text-xs text-gray-500">
            {quando ? `Publicada em ${quando}. ` : ''}Atualize para usar as novidades. O que você já salvou não se perde.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-300">

              <RefreshCwIcon className="h-4 w-4" /> Atualizar agora
            </button>
            <button
              type="button"
              onClick={() => {
                adiadoAteRef.current = Date.now() + ADIAR;
                setNova(null);
              }}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">

              Depois
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            adiadoAteRef.current = Date.now() + ADIAR;
            setNova(null);
          }}
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
          aria-label="Fechar aviso">

          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>);

}
