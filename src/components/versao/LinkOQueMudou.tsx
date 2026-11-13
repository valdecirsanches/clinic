import { useState } from 'react';
import { HistoricoVersoesModal } from './HistoricoVersoesModal';

/** Link "O que mudou" ao lado do número da versão; abre o histórico. */
export function LinkOQueMudou({ className = '' }: {className?: string;}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAberto(true);
        }}
        className={`font-sans text-teal-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-300 rounded ${className}`}>
        
        O que mudou
      </button>
      {aberto && <HistoricoVersoesModal onFechar={() => setAberto(false)} />}
    </>);
}
