import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, ExternalLinkIcon, MicIcon, SquareIcon, Volume2Icon } from 'lucide-react';
import { tutorialProntuario, type SecaoTutorial } from '../../data/tutorialProntuario';

interface TutorialProntuarioProps {
  noProntuario: boolean;
  falando: boolean;
  onOuvir: (texto: string) => void;
  onPararVoz: () => void;
  onExperimentar: (comando: string) => void;
  onAbrirEtapa: (etapa: string) => void;
  onFechar: () => void;
}

const CHAVE_VISTAS = 'assistente_tutorial_vistas';
const EASE = [0.23, 1, 0.32, 1] as const;

function lerVistas(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_VISTAS) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function TutorialProntuario({ noProntuario, falando, onOuvir, onPararVoz, onExperimentar, onAbrirEtapa, onFechar }: TutorialProntuarioProps) {
  const [aberta, setAberta] = useState<SecaoTutorial | null>(null);
  const [vistas, setVistas] = useState<string[]>(lerVistas);
  const reduzir = useReducedMotion();

  useEffect(() => {
    if (!aberta || vistas.includes(aberta.id)) return;
    const novas = [...vistas, aberta.id];
    setVistas(novas);
    localStorage.setItem(CHAVE_VISTAS, JSON.stringify(novas));
  }, [aberta, vistas]);

  const deslize = reduzir ? { opacity: 0 } : { opacity: 0, x: 12 };

  return (
    <div className="flex h-full flex-col">
      <AnimatePresence mode="wait" initial={false}>
        {!aberta ?
        <motion.div
          key="lista"
          initial={reduzir ? { opacity: 0 } : { opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduzir ? { opacity: 0 } : { opacity: 0, x: -12 }}
          transition={{ duration: 0.18, ease: EASE }}>
          
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900">Tutorial do prontuário</h3>
              <span className="shrink-0 text-xs tabular-nums text-gray-500">
                {vistas.filter((id) => tutorialProntuario.some((s) => s.id === id)).length} de {tutorialProntuario.length} vistos
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-600">Escolha um assunto. Posso ler cada um em voz alta, e os exemplos podem ser testados com um toque.</p>

            <ul className="mt-4 divide-y divide-gray-100 border-y border-gray-100">
              {tutorialProntuario.map((s) => {
              const vista = vistas.includes(s.id);
              return (
                <li key={s.id}>
                    <button
                    type="button"
                    onClick={() => setAberta(s)}
                    className="flex w-full items-center gap-3 py-3 text-left transition-colors duration-150 hover:bg-gray-50">
                    
                      <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      vista ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-300 text-transparent'}`
                      }
                      aria-hidden>
                      
                        <CheckIcon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-900">{s.titulo}</span>
                        <span className="block truncate text-xs text-gray-500">{s.resumo}</span>
                      </span>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-400" />
                    </button>
                  </li>);

            })}
            </ul>

            <button
            type="button"
            onClick={onFechar}
            className="mt-4 w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-teal-700">
            
              Começar a ditar
            </button>
          </motion.div> :

        <motion.article
          key={aberta.id}
          initial={deslize}
          animate={{ opacity: 1, x: 0 }}
          exit={deslize}
          transition={{ duration: 0.18, ease: EASE }}>
          
            <button
            type="button"
            onClick={() => {
              onPararVoz();
              setAberta(null);
            }}
            className="-ml-1 flex items-center gap-1 rounded-lg px-1 py-1 text-xs font-medium text-gray-500 transition-colors duration-150 hover:text-gray-900">
            
              <ArrowLeftIcon className="h-3.5 w-3.5" /> Todos os assuntos
            </button>

            <h3 className="mt-2 text-lg font-semibold text-gray-900">{aberta.titulo}</h3>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
              type="button"
              onClick={() => falando ? onPararVoz() : onOuvir(aberta.narracao)}
              className="flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-800 transition-colors duration-150 hover:bg-teal-100">
              
                {falando ? <SquareIcon className="h-3.5 w-3.5 fill-current" /> : <Volume2Icon className="h-4 w-4" />}
                {falando ? 'Parar' : 'Ouvir explicação'}
              </button>
              {aberta.etapa && noProntuario &&
            <button
              type="button"
              onClick={() => onAbrirEtapa(aberta.etapa as string)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50">
              
                  <ExternalLinkIcon className="h-3.5 w-3.5" /> Abrir aba
                </button>
            }
            </div>

            <ol className="mt-4 space-y-2.5">
              {aberta.passos.map((p, i) =>
            <li key={p} className="flex gap-3 text-sm text-gray-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium tabular-nums text-gray-600">
                    {i + 1}
                  </span>
                  <span>{p}</span>
                </li>
            )}
            </ol>

            <h4 className="mt-5 text-xs font-medium text-gray-500">Experimente dizer</h4>
            <ul className="mt-2 space-y-1.5">
              {aberta.comandos.map((c) =>
            <li key={c}>
                  <button
                type="button"
                onClick={() => onExperimentar(c)}
                disabled={!noProntuario && !/\?$/.test(c)}
                title={!noProntuario && !/\?$/.test(c) ? 'Abra um atendimento para testar o ditado' : undefined}
                className="flex w-full items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 transition-colors duration-150 hover:border-teal-300 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:bg-white">
                
                    <MicIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />
                    <span>“{c}”</span>
                  </button>
                </li>
            )}
            </ul>
            {!noProntuario &&
          <p className="mt-3 text-xs text-gray-500">Para testar o ditado, abra o atendimento de um paciente.</p>
          }
          </motion.article>
        }
      </AnimatePresence>
    </div>);

}