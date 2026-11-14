import { useEffect, useState } from 'react';
import { CheckCircle2Icon, SparklesIcon, XIcon } from 'lucide-react';
import { DEMO_VIDEO } from '../../utils/modoDemo';
import { HISTORICO_VERSOES, VERSAO_ATUAL } from '../../config/version';
import { versoesNovas } from '../../utils/historicoVersoes';
import { consumirAtualizando, iniciarVersaoVista, marcarVersaoVista } from '../../utils/versaoVista';
import { HistoricoVersoesModal } from './HistoricoVersoesModal';

// ==================== "O EASYCLIN FOI ATUALIZADO" ====================
// Ao abrir o sistema numa versão mais nova que a última vista neste navegador:
//  - veio do botão "Atualizar agora" → só confirma ("Atualizado para X ✓"),
//    porque a lista já apareceu no aviso;
//  - abriu o sistema já atualizado → mostra o que mudou desde a última vez.

type Modo = null | {tipo: 'confirmacao';} | {tipo: 'novidades';desde: string;};

const MOSTRAR = 5;

export function NovidadesDaVersao() {
  const [modo, setModo] = useState<Modo>(null);
  const [verHistorico, setVerHistorico] = useState(false);

  useEffect(() => {
    if (DEMO_VIDEO) return;
    const atualizando = consumirAtualizando();
    const vista = iniciarVersaoVista();
    const novas = vista ? versoesNovas(HISTORICO_VERSOES, vista) : [];
    if (atualizando) {
      setModo({ tipo: 'confirmacao' });
      marcarVersaoVista();
    } else if (vista && novas.length) {
      setModo({ tipo: 'novidades', desde: vista });
    }
  }, []);

  // A confirmação some sozinha.
  useEffect(() => {
    if (modo?.tipo !== 'confirmacao') return;
    const t = window.setTimeout(() => setModo(null), 8000);
    return () => window.clearTimeout(t);
  }, [modo]);

  const fechar = () => {
    marcarVersaoVista();
    setModo(null);
  };

  if (verHistorico) {
    return <HistoricoVersoesModal onFechar={() => setVerHistorico(false)} />;
  }
  if (!modo) return null;

  if (modo.tipo === 'confirmacao') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed left-1/2 top-3 z-[80] flex w-[min(460px,calc(100vw-1.5rem))] -translate-x-1/2 items-center gap-3 rounded-xl border border-teal-200 bg-white px-4 py-3 shadow-2xl">

        <CheckCircle2Icon className="h-5 w-5 flex-shrink-0 text-teal-600" />
        <p className="flex-1 text-sm text-gray-800">
          Atualizado para a versão <strong>{VERSAO_ATUAL}</strong>.
        </p>
        <button type="button" onClick={() => {setModo(null);setVerHistorico(true);}} className="text-sm font-medium text-teal-700 hover:underline">
          O que mudou
        </button>
        <button type="button" onClick={() => setModo(null)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100" aria-label="Fechar">
          <XIcon className="h-4 w-4" />
        </button>
      </div>);
  }

  const itens = versoesNovas(HISTORICO_VERSOES, modo.desde).flatMap((v) => v.itens);
  return (
    <div
      role="dialog"
      aria-label="O EasyClin foi atualizado"
      className="fixed left-1/2 top-3 z-[80] w-[min(560px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-teal-200 bg-white p-4 shadow-2xl">

      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
          <SparklesIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">O EasyClin foi atualizado para a versão {VERSAO_ATUAL}</p>
          <p className="mt-1 text-xs font-medium text-gray-500">O que mudou desde a última vez que você usou ({modo.desde}):</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
            {itens.slice(0, MOSTRAR).map((item, i) => <li key={i}>{item}</li>)}
          </ul>
          {itens.length > MOSTRAR && <p className="mt-0.5 text-xs text-gray-500">e mais {itens.length - MOSTRAR} novidade(s).</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={fechar}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-300">

              Entendi
            </button>
            <button
              type="button"
              onClick={() => {
                marcarVersaoVista();
                setModo(null);
                setVerHistorico(true);
              }}
              className="text-sm font-medium text-teal-700 hover:underline">

              Ver histórico de versões
            </button>
          </div>
        </div>
        <button type="button" onClick={fechar} className="rounded-full p-1 text-gray-400 hover:bg-gray-100" aria-label="Fechar">
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>);
}
