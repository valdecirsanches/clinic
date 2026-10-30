import React, { forwardRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { CenaDemo } from '../../data/demoRoteiro';
import { CursorPalco } from './CursorPalco';

export type FormatoDemo = 'desktop' | 'celular';

export const TAMANHOS_DEMO: Record<FormatoDemo, {w: number;h: number;}> = {
  desktop: { w: 1280, h: 720 },
  celular: { w: 390, h: 844 }
};

interface PalcoDemoProps {
  formato: FormatoDemo;
  escala: number;
  cena: CenaDemo | null;
  mostrarLegendas: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onCarregado: () => void;
}

/** Pede ao sistema dentro do palco para abrir uma tela */
export function navegarPalco(iframe: HTMLIFrameElement | null, pagina: string) {
  iframe?.contentWindow?.postMessage({ tipo: 'easyclin-demo-navegar', pagina }, window.location.origin);
}

/**
 * O "palco": o sistema real numa moldura do tamanho exato do vídeo, com a
 * legenda por cima. A pré-visualização e a gravação usam este mesmo palco.
 */
export const PalcoDemo = forwardRef<HTMLDivElement, PalcoDemoProps>(function PalcoDemo(
{ formato, escala, cena, mostrarLegendas, iframeRef, onCarregado },
ref)
{
  const { w, h } = TAMANHOS_DEMO[formato];
  const src = useMemo(() => `${window.location.origin}/?demo=1`, []);
  return (
    <div
      ref={ref}
      className="relative bg-white overflow-hidden shadow-xl"
      style={{ width: w * escala, height: h * escala, borderRadius: formato === 'celular' ? 24 * escala + 8 : 0 }}>
      
      <iframe
        ref={iframeRef}
        src={src}
        title="Sistema em demonstração"
        tabIndex={-1}
        onLoad={() => window.setTimeout(onCarregado, 2500)}
        style={{ width: w, height: h, transform: `scale(${escala})`, transformOrigin: 'top left', border: 0, pointerEvents: 'none' }} />
      
      <CursorPalco largura={w} altura={h} escala={escala} toque={formato === 'celular'} />
      <AnimatePresence>
        {cena?.capa &&
        <motion.div
          key={`capa-${cena.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="absolute inset-0 bg-teal-700 flex flex-col items-center justify-center text-center pointer-events-none"
          style={{ padding: 40 * escala }}>
          
            <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
            className="text-white font-semibold tracking-tight"
            style={{ fontSize: (formato === 'celular' ? 64 : 88) * escala }}>
            
              {cena.capa.titulo}
            </motion.p>
            <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="text-teal-50"
            style={{ fontSize: (formato === 'celular' ? 30 : 32) * escala, marginTop: 16 * escala, maxWidth: '85%' }}>
            
              {cena.capa.subtitulo}
            </motion.p>
          </motion.div>
        }
      </AnimatePresence>
      <AnimatePresence>
        {mostrarLegendas && cena?.legenda && !cena.capa &&
        <motion.div
          key={cena.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className="absolute left-0 right-0 bottom-0 flex justify-center pointer-events-none"
          style={{ padding: 16 * escala * (formato === 'celular' ? 2 : 1) }}>
          
            <p
            className="bg-gray-900/85 text-white font-medium rounded-xl text-center"
            style={{
              fontSize: Math.max(10, (formato === 'celular' ? 30 : 26) * escala),
              padding: `${10 * escala + 3}px ${18 * escala + 5}px`,
              maxWidth: '92%'
            }}>
            
              {cena.legenda}
            </p>
          </motion.div>
        }
      </AnimatePresence>
    </div>);

});