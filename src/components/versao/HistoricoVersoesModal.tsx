import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { XIcon, SparklesIcon } from 'lucide-react';
import { HISTORICO_VERSOES, VERSAO_ATUAL, type VersaoHistorico } from '../../config/version';
import { compararVersoes, formatarDataVersao } from '../../utils/historicoVersoes';

interface Props {
  onFechar: () => void;
  /** Histórico a mostrar (padrão: o desta versão). O aviso de atualização passa o publicado. */
  historico?: VersaoHistorico[];
  /** Versão em uso neste navegador (marcada como "sua versão"). */
  versaoEmUso?: string;
}

/** Janela "O que mudou": todas as versões, da mais nova para a mais antiga. */
export function HistoricoVersoesModal({ onFechar, historico = HISTORICO_VERSOES, versaoEmUso = VERSAO_ATUAL }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  const versoes = [...historico].sort((a, b) => compararVersoes(b.versao, a.versao));

  // Portal no body: o menu lateral usa transform, que prenderia o "fixed" dentro dele.
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Histórico de versões"
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-teal-700">
            <SparklesIcon className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">O que mudou no EasyClin</h2>
            <p className="text-xs text-gray-500">Histórico de versões · você está na versão {versaoEmUso}</p>
          </div>
          <button type="button" onClick={onFechar} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Fechar">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <ol className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {versoes.map((v) => {
            const emUso = v.versao === versaoEmUso;
            const nova = compararVersoes(v.versao, versaoEmUso) > 0;
            return (
              <li key={v.versao}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Versão {v.versao}</h3>
                  <span className="text-xs text-gray-500">{formatarDataVersao(v.data)}</span>
                  {emUso && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-800">sua versão</span>}
                  {nova && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">nova</span>}
                </div>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-700">
                  {v.itens.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </li>);
          })}
        </ol>
      </div>
    </div>,
    document.body
  );
}
