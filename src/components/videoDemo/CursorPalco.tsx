import React, { useEffect, useRef } from 'react';
import { DURACAO_CLIQUE_MS, posicaoCursor } from '../../utils/cursorDemo';

interface CursorPalcoProps {
  largura: number;
  altura: number;
  escala: number;
  /** Celular: toque (círculo) em vez da seta */
  toque: boolean;
}

/**
 * Camada do mouse simulado sobre o palco. Lê `posicaoCursor` a cada quadro
 * e move o elemento direto no DOM (sem re-render do React).
 */
export function CursorPalco({ largura, altura, escala, toque }: CursorPalcoProps) {
  const setaRef = useRef<HTMLDivElement>(null);
  const ondaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let quadro = 0;
    const desenhar = () => {
      const seta = setaRef.current;
      const onda = ondaRef.current;
      if (seta && onda) {
        const p = posicaoCursor;
        seta.style.opacity = p.visivel ? '1' : '0';
        seta.style.transform = `translate(${p.x}px, ${p.y}px)`;
        const t = (performance.now() - p.cliqueEm) / DURACAO_CLIQUE_MS;
        if (p.visivel && t >= 0 && t < 1) {
          onda.style.opacity = String(0.55 * (1 - t));
          onda.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${0.4 + t})`;
        } else {
          onda.style.opacity = '0';
        }
      }
      quadro = requestAnimationFrame(desenhar);
    };
    quadro = requestAnimationFrame(desenhar);
    return () => cancelAnimationFrame(quadro);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: largura, height: altura, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
      
      <div
        ref={ondaRef}
        className="absolute top-0 left-0 rounded-full bg-teal-500"
        style={{ width: 44, height: 44, opacity: 0 }} />
      
      <div ref={setaRef} className="absolute top-0 left-0" style={{ opacity: 0, transition: 'opacity 150ms ease-out' }}>
        {toque ?
        <div className="rounded-full bg-gray-900/30 border-2 border-white" style={{ width: 28, height: 28, transform: 'translate(-50%, -50%)' }} /> :

        <svg width="22" height="30" viewBox="0 0 22 30" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}>
            <path d="M1 1 L1 23 L6.5 18 L10.5 27.5 L14 26 L10 16.8 L17.5 16.8 Z" fill="#111827" stroke="#ffffff" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        }
      </div>
    </div>);

}