import React, { useEffect, useRef, useState } from 'react';
import { CircleIcon, SquareIcon, XIcon } from 'lucide-react';
import type { CenaDemo } from '../../data/demoRoteiro';
import { diagnosticarGravacao, iniciarGravacao, iniciarGravacaoCompativel, type Gravador, type ModoGravacao } from '../../utils/gravadorDemo';
import { ReprodutorDemo } from '../../utils/reprodutorDemo';
import { CursorDemo } from '../../utils/cursorDemo';
import { navegarPalco, PalcoDemo, TAMANHOS_DEMO, type FormatoDemo } from './PalcoDemo';

export type { FormatoDemo } from './PalcoDemo';

interface PalcoGravacaoProps {
  cenas: CenaDemo[];
  audios: Record<string, string>;
  formato: FormatoDemo;
  musica: {url: string;volume: number;} | null;
  volumeNarracao: number;
  abaixarNaFala: boolean;
  suavizar: boolean;
  mostrarLegendas: boolean;
  onFim: (video: {blob: Blob;extensao: 'mp4' | 'webm';} | null, erro?: string) => void;
  onFechar: () => void;
}

type Estado = 'carregando' | 'pronto' | 'gravando' | 'finalizando';

/**
 * Gravação em tela cheia. Só grava — a conferência é feita antes, na
 * pré-visualização da página, que usa o mesmo palco e o mesmo roteiro.
 * Sem captura de tela disponível (ou negada), grava em modo compatível.
 */
export function PalcoGravacao({
  cenas,
  audios,
  formato,
  musica,
  volumeNarracao,
  abaixarNaFala,
  suavizar,
  mostrarLegendas,
  onFim,
  onFechar
}: PalcoGravacaoProps) {
  const palcoRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const reprodutorRef = useRef<ReprodutorDemo | null>(null);
  const gravadorRef = useRef<Gravador | null>(null);
  const indiceRef = useRef(-1);
  const diagnostico = useRef(diagnosticarGravacao()).current;
  const [estado, setEstado] = useState<Estado>('carregando');
  const [indice, setIndice] = useState(-1);
  const [aviso, setAviso] = useState<string | null>(null);
  const [janela, setJanela] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const aoRedimensionar = () => setJanela({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  useEffect(
    () => () => {
      reprodutorRef.current?.fechar();
      gravadorRef.current?.cancelar();
    },
    []
  );

  const { w, h } = TAMANHOS_DEMO[formato];
  const escala = Math.min((janela.w - 32) / w, (janela.h - 110) / h, 1);

  const gravar = async (modo: ModoGravacao) => {
    if (!palcoRef.current || !iframeRef.current) return;
    setAviso(null);
    const contexto = new AudioContext();
    let gravador: Gravador;
    try {
      gravador =
      modo === 'aba' ?
      await iniciarGravacao(palcoRef.current, contexto) :
      await iniciarGravacaoCompativel({
        iframe: iframeRef.current,
        largura: w,
        altura: h,
        celular: formato === 'celular',
        contexto,
        cenaAtual: () => indiceRef.current >= 0 ? cenas[indiceRef.current] : null,
        mostrarLegendas
      });
    } catch (err) {
      contexto.close().catch(() => undefined);
      const e = err as {name?: string;message?: string;};
      if (modo === 'aba') {
        // Captura negada (pelo usuário ou por política do servidor): oferece o modo compatível
        setAviso(
          e?.name === 'NotAllowedError' ?
          'A captura da aba não foi permitida. Tente de novo escolhendo "Esta aba", ou grave em modo compatível.' :
          `A captura da aba falhou (${e?.message || e?.name || 'erro desconhecido'}). Grave em modo compatível.`
        );
        return;
      }
      onFim(null, `Não foi possível gravar: ${e?.message || 'erro desconhecido'}`);
      return;
    }
    gravadorRef.current = gravador;
    const reprodutor = new ReprodutorDemo({
      cenas,
      audios,
      musica,
      volumeNarracao,
      abaixarNaFala,
      suavizar,
      contexto,
      destino: gravador.destinoAudio,
      navegar: (p) => navegarPalco(iframeRef.current, p),
      cursor: new CursorDemo(() => iframeRef.current, { w, h }, formato === 'celular'),
      onCena: (i) => {
        indiceRef.current = i;
        setIndice(i);
      }
    });
    reprodutorRef.current = reprodutor;
    setEstado('gravando');
    const completo = await reprodutor.executar(0);
    setEstado('finalizando');
    if (completo) {
      const blob = await gravador.parar();
      onFim({ blob, extensao: gravador.extensao });
    } else {
      gravador.cancelar();
      onFim(null);
    }
    gravadorRef.current = null;
    contexto.close().catch(() => undefined);
  };

  const cena = indice >= 0 ? cenas[indice] : null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-gray-950 flex flex-col items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Gravação do vídeo de demonstração">
      
      {/* Barra de controle — fica FORA do recorte gravado */}
      <div className="w-full flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="text-sm min-w-0">
          {estado === 'carregando' && 'Carregando o sistema...'}
          {estado === 'pronto' && (
          aviso || (
          diagnostico.modo === 'aba' ?
          'Clique em Iniciar gravação e escolha "Esta aba" na janela do navegador.' :
          'Clique em Iniciar gravação. O vídeo é montado pelo próprio sistema.'))}
          {estado === 'gravando' && cena &&
          <span className="flex items-center gap-2">
              <CircleIcon className="w-3 h-3 fill-red-500 text-red-500 animate-pulse" aria-hidden="true" />
              Gravando · cena {indice + 1} de {cenas.length} — {cena.titulo}
            </span>
          }
          {estado === 'finalizando' && 'Finalizando o vídeo...'}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {estado === 'pronto' &&
          <>
              {aviso &&
            <button
              type="button"
              onClick={() => gravar('compativel')}
              className="px-3 py-1.5 rounded-lg text-sm bg-white/10 hover:bg-white/20 transition-colors whitespace-nowrap">
              
                  Gravar em modo compatível
                </button>
            }
              <button
              type="button"
              onClick={() => gravar(diagnostico.modo)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 transition-colors whitespace-nowrap">
              
                <CircleIcon className="w-4 h-4 fill-white" aria-hidden="true" /> {aviso ? 'Tentar de novo' : 'Iniciar gravação'}
              </button>
            </>
          }
          {estado === 'gravando' &&
          <button
            type="button"
            onClick={() => reprodutorRef.current?.parar()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white/10 hover:bg-white/20 transition-colors">
            
              <SquareIcon className="w-4 h-4" aria-hidden="true" /> Cancelar
            </button>
          }
          {(estado === 'carregando' || estado === 'pronto') &&
          <button type="button" onClick={onFechar} className="p-2 rounded-lg hover:bg-white/10" aria-label="Fechar">
              <XIcon className="w-5 h-5" />
            </button>
          }
        </div>
      </div>

      <PalcoDemo
        ref={palcoRef}
        formato={formato}
        escala={escala}
        cena={estado === 'gravando' ? cena : null}
        mostrarLegendas={mostrarLegendas}
        iframeRef={iframeRef}
        onCarregado={() => {
          setEstado((e) => e === 'carregando' ? 'pronto' : e);
          if (cenas[0]) navegarPalco(iframeRef.current, cenas[0].pagina);
        }} />
      
    </div>);

}