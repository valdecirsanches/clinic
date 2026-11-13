import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCwIcon, XIcon } from 'lucide-react';
import { DEMO_VIDEO } from '../utils/modoDemo';
import { VERSAO_ATUAL, type VersaoHistorico } from '../config/version';
import { versoesNovas } from '../utils/historicoVersoes';
import { HistoricoVersoesModal } from './versao/HistoricoVersoesModal';

// ==================== AVISO DE VERSÃO NOVA ====================
// Ao abrir, guarda a versão publicada (/versao.json, gerado pelo
// vite-plugin-versao). Confere de novo a cada 5 minutos e quando a aba volta
// a ficar visível; se mudou, avisa e oferece recarregar.

export interface VersaoPublicada {
  id: string;
  commit?: string | null;
  data?: string;
  novidade?: string | null;
  versao?: string | null;
  historico?: VersaoHistorico[];
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
  const [verHistorico, setVerHistorico] = useState(false);

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
  const novas = versoesNovas(nova.historico || [], VERSAO_ATUAL);
  const itens = novas.flatMap((v) => v.itens);
  const MOSTRAR = 5;
  const adiar = () => {
    adiadoAteRef.current = Date.now() + ADIAR;
    setNova(null);
  };

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="fixed left-1/2 top-3 z-[80] w-[min(560px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-teal-200 bg-white p-4 shadow-2xl">
        
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
            <RefreshCwIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">
              {nova.versao && nova.versao !== VERSAO_ATUAL ?
              `Nova versão ${nova.versao} do EasyClin disponível` :
              'Nova versão do EasyClin disponível'}
            </p>
            {itens.length > 0 ?
            <>
                <p className="mt-1 text-xs font-medium text-gray-500">O que mudou desde a sua versão ({VERSAO_ATUAL}):</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
                  {itens.slice(0, MOSTRAR).map((item, i) => <li key={i}>{item}</li>)}
                </ul>
                {itens.length > MOSTRAR &&
              <p className="mt-0.5 text-xs text-gray-500">e mais {itens.length - MOSTRAR} novidade(s).</p>
              }
              </> :

            <p className="mt-0.5 text-sm text-gray-700">{nova.novidade || 'Correções e melhorias.'}</p>
            }
            <p className="mt-1 text-xs text-gray-500">
              {quando ? `Publicada em ${quando}. ` : ''}Atualize para usar as novidades. O que você já salvou não se perde.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                
                <RefreshCwIcon className="h-4 w-4" /> Atualizar agora
              </button>
              <button
                type="button"
                onClick={adiar}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                
                Depois
              </button>
              {(nova.historico || []).length > 0 &&
              <button type="button" onClick={() => setVerHistorico(true)} className="text-sm font-medium text-teal-700 hover:underline">
                  Ver histórico de versões
                </button>
              }
            </div>
          </div>
          <button type="button" onClick={adiar} className="rounded-full p-1 text-gray-400 hover:bg-gray-100" aria-label="Fechar aviso">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      {verHistorico &&
      <HistoricoVersoesModal historico={nova.historico} versaoEmUso={VERSAO_ATUAL} onFechar={() => setVerHistorico(false)} />
      }
    </>);

}
