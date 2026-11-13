import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HelpCircleIcon,
  XIcon,
  SearchIcon,
  Volume2Icon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
  Loader2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LightbulbIcon } from
'lucide-react';
import {
  TopicoAjuda,
  agruparAjuda,
  buscarTopicoAjuda,
  pesquisarAjuda,
  topicoDaTela } from
'../../data/ajuda';
import { useAjudaVoz } from '../../hooks/useAjudaVoz';

interface AjudaPainelProps {
  telaAtual: string;
  prontuarioStep?: string | null;
  tipoUsuario: string;
  onFechar: () => void;
}

/**
 * Painel lateral de ajuda: explica a tela atual (no prontuário, a aba aberta)
 * e permite procurar a ajuda de qualquer função. Com a ajuda por voz ativada
 * pelo super admin, o botão "Ouvir" narra o texto com a voz da ElevenLabs.
 */
export function AjudaPainel({ telaAtual, prontuarioStep, tipoUsuario, onFechar }: AjudaPainelProps) {
  const daTela = useMemo(() => topicoDaTela(telaAtual, prontuarioStep), [telaAtual, prontuarioStep]);
  const [topicoId, setTopicoId] = useState(daTela.id);
  const [busca, setBusca] = useState('');
  const voz = useAjudaVoz();
  const corpoRef = useRef<HTMLDivElement>(null);

  // Trocou de tela/aba com o painel aberto: mostra a ajuda da nova.
  useEffect(() => {
    setTopicoId(daTela.id);
  }, [daTela.id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  const topico = buscarTopicoAjuda(topicoId) || daTela;
  const resultados = useMemo(() => pesquisarAjuda(busca, tipoUsuario), [busca, tipoUsuario]);
  const grupos = useMemo(() => agruparAjuda(resultados.filter((t) => t.id !== topico.id)), [resultados, topico.id]);

  const abrir = (t: TopicoAjuda) => {
    voz.parar();
    setTopicoId(t.id);
    setBusca('');
    corpoRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const tocandoEste = voz.topicoTocando === topico.id;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20 lg:bg-transparent" onClick={onFechar} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label="Ajuda"
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-[440px] flex-col border-l border-gray-200 bg-white shadow-2xl">

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-teal-700">
            <HelpCircleIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">Ajuda</h2>
            <p className="text-xs text-gray-500">
              {voz.config.ativo ? 'Leia ou ouça a explicação de cada função' : 'Como usar cada função do sistema'}
            </p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-300"
            aria-label="Fechar ajuda"
            title="Fechar (Esc)">

            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Busca */}
        <div className="border-b border-gray-100 px-5 py-3">
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar ajuda: marcar consulta, receita, boleto…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30" />

          </label>
        </div>

        <div ref={corpoRef} className="flex-1 overflow-y-auto">
          {busca.trim() ?
          <div className="px-5 py-4">
              <p className="mb-2 text-xs font-medium text-gray-500">
                {resultados.length ? `${resultados.length} resultado(s)` : 'Nada encontrado. Tente outra palavra.'}
              </p>
              <ListaTopicos topicos={resultados} onAbrir={abrir} />
            </div> :

          <>
              {/* Tópico aberto */}
              <section className="px-5 py-5">
                {topico.id !== daTela.id &&
              <button
                type="button"
                onClick={() => abrir(daTela)}
                className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">

                    <ChevronLeftIcon className="h-3.5 w-3.5" />
                    Ajuda desta tela
                  </button>
              }
                <p className="text-xs font-medium uppercase tracking-wide text-teal-700">{topico.grupo}</p>
                <h3 className="mt-0.5 text-lg font-semibold text-gray-900">{topico.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-700">{topico.resumo}</p>

                {voz.config.ativo &&
              <div className="mt-4 flex flex-wrap items-center gap-2">
                    {tocandoEste && voz.estado !== 'parado' ?
                <>
                        {voz.estado === 'carregando' ?
                  <span className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800">
                            <Loader2Icon className="h-4 w-4 animate-spin" />
                            Preparando a voz…
                          </span> :

                  <button
                    type="button"
                    onClick={voz.pausarOuContinuar}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-300">

                            {voz.estado === 'tocando' ?
                    <><PauseIcon className="h-4 w-4" /> Pausar</> :
                    <><PlayIcon className="h-4 w-4" /> Continuar</>}
                          </button>
                  }
                        <button
                    type="button"
                    onClick={voz.parar}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">

                          <SquareIcon className="h-3.5 w-3.5" /> Parar
                        </button>
                      </> :

                <button
                  type="button"
                  onClick={() => voz.ouvir(topico.id)}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-300">

                        <Volume2Icon className="h-4 w-4" />
                        Ouvir explicação
                      </button>
                }
                    {voz.config.vozNome &&
                <span className="text-xs text-gray-400">Voz: {voz.config.vozNome}</span>
                }
                  </div>
              }
                {voz.erro && <p className="mt-2 text-xs text-red-600">{voz.erro}</p>}

                {topico.passos.length > 0 &&
              <>
                    <h4 className="mt-5 text-sm font-semibold text-gray-900">Como usar</h4>
                    <ol className="mt-2 space-y-2">
                      {topico.passos.map((passo, i) =>
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-gray-700">
                          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                            {i + 1}
                          </span>
                          <span>{passo}</span>
                        </li>
                  )}
                    </ol>
                  </>
              }

                {topico.dicas.length > 0 &&
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    {topico.dicas.map((dica, i) =>
                <p key={i} className="flex gap-2 text-sm text-amber-900">
                        <LightbulbIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                        <span>{dica}</span>
                      </p>
                )}
                  </div>
              }
              </section>

              {/* Todas as funções */}
              <section className="border-t border-gray-100 px-5 py-4">
                <h4 className="mb-2 text-sm font-semibold text-gray-900">Ajuda de outras funções</h4>
                {grupos.map((g) =>
              <div key={g.grupo} className="mb-3">
                    <p className="mb-1 text-xs font-medium text-gray-500">{g.grupo}</p>
                    <ListaTopicos topicos={g.topicos} onAbrir={abrir} />
                  </div>
              )}
              </section>
            </>
          }
        </div>

        <div className="border-t border-gray-100 px-5 py-2 text-center text-[11px] text-gray-400">
          Abra a ajuda a qualquer momento com a tecla F1
        </div>
      </aside>
    </>);

}

function ListaTopicos({ topicos, onAbrir }: {topicos: TopicoAjuda[];onAbrir: (t: TopicoAjuda) => void;}) {
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
      {topicos.map((t) =>
      <li key={t.id}>
          <button
          type="button"
          onClick={() => onAbrir(t)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-teal-50 focus:bg-teal-50 focus:outline-none">

            <span className="flex-1">{t.titulo}</span>
            <ChevronRightIcon className="h-4 w-4 text-gray-300" />
          </button>
        </li>
      )}
    </ul>);

}
