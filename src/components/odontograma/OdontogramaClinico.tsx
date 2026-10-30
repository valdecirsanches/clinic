import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Undo2Icon, Redo2Icon, MousePointer2Icon, EraserIcon, XIcon } from 'lucide-react';
import { ArcadasSvg } from './ArcadasSvg';
import {
  COR,
  CondicaoFace,
  Denticao,
  Face,
  FERRAMENTAS,
  Ferramenta,
  MarcaDente,
  NOME_CONDICAO,
  OdontogramaDados,
  corDaCondicao,
  denticaoSugerida,
  infoDente,
  listarAchados,
  montarDente,
  nomeFace,
  normalizarDente } from
'./modelo';

interface Props {
  value: OdontogramaDados;
  onChange: (dados: OdontogramaDados) => void;
  readOnly?: boolean;
  /** Para sugerir a dentição (decídua / mista / permanente) pela idade */
  pacienteDataNascimento?: string;
}

const FACES_ORDEM: Face[] = ['vestibular', 'lingual', 'mesial', 'distal', 'oclusal'];
const MARCAS_DENTE: MarcaDente[] = ['tratamento_canal', 'protese', 'implante', 'fratura', 'extracao_indicada', 'extraido'];

function Amostra({ ferramenta }: {ferramenta: Ferramenta;}) {
  if (ferramenta === 'selecionar') return <MousePointer2Icon className="w-3.5 h-3.5" />;
  if (ferramenta === 'borracha') return <EraserIcon className="w-3.5 h-3.5" />;
  const cor = corDaCondicao(ferramenta);
  const def = FERRAMENTAS.find((f) => f.id === ferramenta);
  return def?.tipo === 'face' ?
  <span className="w-3 h-3 rounded-[3px]" style={{ background: cor.forte }} /> :
  <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: cor.forte, background: cor.clara }} />;
}

export function OdontogramaClinico({ value, onChange, readOnly = false, pacienteDataNascimento }: Props) {
  const dados = value || {};
  const [ferramenta, setFerramenta] = useState<Ferramenta>('selecionar');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [denticao, setDenticao] = useState<Denticao>(() => {
    // Abre na dentição que tem registros; senão, sugere pela idade
    const nums = Object.keys(value || {});
    const temDecido = nums.some((n) => Number(n[0]) >= 5);
    const temPermanente = nums.some((n) => Number(n[0]) <= 4);
    if (temDecido && temPermanente) return 'mista';
    if (temDecido) return 'decidua';
    if (temPermanente) return 'permanente';
    return denticaoSugerida(pacienteDataNascimento);
  });
  const historico = useRef<{passado: OdontogramaDados[];futuro: OdontogramaDados[];}>({ passado: [], futuro: [] });
  const [, forcar] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);

  const aplicar = useCallback((novo: OdontogramaDados) => {
    historico.current.passado.push(dados);
    if (historico.current.passado.length > 60) historico.current.passado.shift();
    historico.current.futuro = [];
    onChange(novo);
    forcar((n) => n + 1);
  }, [dados, onChange]);

  const desfazer = useCallback(() => {
    const anterior = historico.current.passado.pop();
    if (!anterior) return;
    historico.current.futuro.push(dados);
    onChange(anterior);
    forcar((n) => n + 1);
  }, [dados, onChange]);
  const refazer = useCallback(() => {
    const proximo = historico.current.futuro.pop();
    if (!proximo) return;
    historico.current.passado.push(dados);
    onChange(proximo);
    forcar((n) => n + 1);
  }, [dados, onChange]);

  /** Altera um dente a partir do formato normalizado. */
  const alterarDente = useCallback((numero: string, mudar: (d: ReturnType<typeof normalizarDente>) => void) => {
    const atual = normalizarDente(dados[numero]);
    const copia = { condicoesFaces: { ...atual.condicoesFaces }, marcas: [...atual.marcas], observacao: atual.observacao };
    mudar(copia);
    const reg = montarDente(copia.condicoesFaces, copia.marcas, copia.observacao);
    const novo = { ...dados };
    if (reg) novo[numero] = reg;else
    delete novo[numero];
    aplicar(novo);
  }, [dados, aplicar]);

  const def = FERRAMENTAS.find((f) => f.id === ferramenta)!;

  const aoClicarDente = useCallback((numero: string) => {
    if (readOnly || ferramenta === 'selecionar' || def.tipo === 'face') {
      setSelecionado((s) => s === numero && ferramenta === 'selecionar' ? null : numero);
      return;
    }
    if (ferramenta === 'borracha') {
      alterarDente(numero, (d) => {
        d.condicoesFaces = {};
        d.marcas = [];
      });
      return;
    }
    const marca = ferramenta as MarcaDente;
    alterarDente(numero, (d) => {
      if (d.marcas.includes(marca)) d.marcas = d.marcas.filter((m) => m !== marca);else
      {
        d.marcas.push(marca);
        // Ausente não convive com as demais marcações do dente
        if (marca === 'extraido') {
          d.marcas = ['extraido'];
          d.condicoesFaces = {};
        } else d.marcas = d.marcas.filter((m) => m !== 'extraido');
        if (marca === 'implante') d.marcas = d.marcas.filter((m) => m !== 'tratamento_canal');
      }
    });
    setSelecionado(numero);
  }, [readOnly, ferramenta, def, alterarDente]);

  const aoClicarFace = useCallback((numero: string, face: Face) => {
    if (readOnly) return;
    if (def.tipo === 'face') {
      alterarDente(numero, (d) => {
        // Clicar de novo na mesma condição desmarca
        if (d.condicoesFaces[face] === ferramenta) delete d.condicoesFaces[face];else
        d.condicoesFaces[face] = ferramenta as CondicaoFace;
      });
      setSelecionado(numero);
      return;
    }
    if (ferramenta === 'borracha') {
      alterarDente(numero, (d) => {delete d.condicoesFaces[face];});
      return;
    }
    aoClicarDente(numero);
  }, [readOnly, def, ferramenta, alterarDente, aoClicarDente]);

  // Atalhos: 1–9 e 0 escolhem a ferramenta, Esc volta a "Selecionar",
  // Ctrl+Z / Ctrl+Y desfazem e refazem — só com o foco dentro do odontograma.
  useEffect(() => {
    const el = raiz.current;
    if (!el || readOnly) return;
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo && (alvo.tagName === 'TEXTAREA' || alvo.tagName === 'INPUT' || alvo.tagName === 'SELECT')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) refazer();else desfazer();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        refazer();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        setFerramenta('selecionar');
        return;
      }
      const f = FERRAMENTAS.find((x) => x.atalho === e.key);
      if (f) {
        e.preventDefault();
        setFerramenta(f.id);
      }
    };
    el.addEventListener('keydown', aoTeclar);
    return () => el.removeEventListener('keydown', aoTeclar);
  }, [readOnly, desfazer, refazer]);

  const achados = useMemo(() => listarAchados(dados), [dados]);
  const contagem = useMemo(() => ({
    tratar: new Set(achados.filter((a) => a.grupo === 'tratar').map((a) => a.dente)).size,
    tratado: new Set(achados.filter((a) => a.grupo === 'tratado').map((a) => a.dente)).size,
    ausentes: Object.values(dados).filter((d) => normalizarDente(d).marcas.includes('extraido')).length
  }), [achados, dados]);

  const selecionadoInfo = selecionado ? infoDente(selecionado) : null;
  const selecionadoDados = selecionado ? normalizarDente(dados[selecionado]) : null;

  return (
    <div ref={raiz} className="space-y-3" tabIndex={-1}>
      {/* Barra: dentição + ferramentas + desfazer */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="radiogroup" aria-label="Dentição">
          {([['permanente', 'Permanente'], ['decidua', 'Decídua'], ['mista', 'Mista']] as [Denticao, string][]).map(([id, nome]) =>
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={denticao === id}
            onClick={() => setDenticao(id)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${denticao === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {nome}
            </button>
          )}
        </div>

        {!readOnly &&
        <>
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Ferramenta de marcação">
              {FERRAMENTAS.map((f) =>
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={ferramenta === f.id}
              onClick={() => setFerramenta(f.id)}
              title={`${f.descricao}${f.atalho ? ` (tecla ${f.atalho})` : ''}`}
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium border transition-colors ${
              ferramenta === f.id ?
              'bg-teal-600 text-white border-teal-600' :
              'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`
              }>
                  <Amostra ferramenta={f.id} />
                  {f.nome}
                </button>
            )}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <button type="button" onClick={desfazer} disabled={!historico.current.passado.length} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                <Undo2Icon className="w-4 h-4" />
              </button>
              <button type="button" onClick={refazer} disabled={!historico.current.futuro.length} title="Refazer (Ctrl+Y)" aria-label="Refazer" className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30">
                <Redo2Icon className="w-4 h-4" />
              </button>
            </div>
          </>
        }
      </div>
      {!readOnly &&
      <p className="text-xs text-gray-500" aria-live="polite">{def.descricao}.</p>
      }

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        {/* Arcadas */}
        <div className="rounded-xl border border-gray-200 bg-white px-2 py-4 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="flex justify-between px-4 text-[11px] text-gray-400 mb-1">
              <span>Direito do paciente</span>
              <span>Esquerdo do paciente</span>
            </div>
            <ArcadasSvg
              dados={dados}
              denticao={denticao}
              selecionado={selecionado}
              destaque={destaque}
              interativo
              onDente={aoClicarDente}
              onFace={readOnly ? undefined : aoClicarFace} />

          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 mt-3 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COR.tratar }} />A tratar</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COR.tratado }} />Já tratado</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COR.selante }} />Preventivo</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-dashed border-slate-400" />Ausente</span>
          </div>
        </div>

        {/* Painel lateral: dente selecionado ou achados */}
        <aside className="rounded-xl border border-gray-200 bg-white p-4 space-y-4 self-start">
          {selecionado && selecionadoInfo && selecionadoDados ?
          <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xl font-semibold text-gray-900 tabular-nums leading-none">{selecionado}</p>
                  <p className="text-sm text-gray-500 mt-1">{selecionadoInfo.nome}</p>
                </div>
                <button type="button" onClick={() => setSelecionado(null)} aria-label="Fechar detalhes do dente" className="p-1 rounded-md text-gray-400 hover:bg-gray-100">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500">Faces</p>
                {FACES_ORDEM.map((face) =>
              <label key={face} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-700">{nomeFace(face, selecionado)}</span>
                    <select
                  value={selecionadoDados.condicoesFaces[face] || ''}
                  disabled={readOnly || selecionadoDados.marcas.includes('extraido')}
                  onChange={(e) => {
                    const v = e.target.value as CondicaoFace | '';
                    alterarDente(selecionado, (d) => {
                      if (v) d.condicoesFaces[face] = v;else
                      delete d.condicoesFaces[face];
                    });
                  }}
                  className="h-8 w-36 rounded-md border border-gray-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50">
                      <option value="">Hígida</option>
                      <option value="cariado">Cárie</option>
                      <option value="restaurado">Restauração</option>
                      <option value="selante">Selante</option>
                    </select>
                  </label>
              )}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500">Dente</p>
                <div className="flex flex-wrap gap-1.5">
                  {MARCAS_DENTE.map((m) => {
                  const ativo = selecionadoDados.marcas.includes(m);
                  const cor = corDaCondicao(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={readOnly}
                      aria-pressed={ativo}
                      onClick={() => alterarDente(selecionado, (d) => {
                        if (d.marcas.includes(m)) d.marcas = d.marcas.filter((x) => x !== m);else
                        if (m === 'extraido') {
                          d.marcas = ['extraido'];
                          d.condicoesFaces = {};
                        } else d.marcas = [...d.marcas.filter((x) => x !== 'extraido'), m];
                      })}
                      className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:cursor-default"
                      style={ativo ? { background: cor.clara, borderColor: cor.forte, color: cor.forte } : { borderColor: '#E5E7EB', color: '#4B5563' }}>
                        {NOME_CONDICAO[m]}
                      </button>);

                })}
                </div>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-gray-500">Observação</span>
                <textarea
                value={selecionadoDados.observacao}
                disabled={readOnly}
                onChange={(e) => {
                  const texto = e.target.value;
                  const atual = normalizarDente(dados[selecionado]);
                  const reg = montarDente(atual.condicoesFaces, atual.marcas, texto);
                  const novo = { ...dados };
                  if (reg) novo[selecionado] = reg;else
                  delete novo[selecionado];
                  onChange(novo); // texto: sem entrar no desfazer a cada letra
                }}
                rows={3}
                placeholder="Ex.: sensibilidade ao frio, mobilidade grau I"
                className="w-full rounded-md border border-gray-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50" />

              </label>

              {!readOnly &&
            <button
              type="button"
              onClick={() => alterarDente(selecionado, (d) => {
                d.condicoesFaces = {};
                d.marcas = [];
                d.observacao = '';
              })}
              className="text-xs font-medium text-gray-500 hover:text-red-600">
                  Limpar este dente
                </button>
            }
            </> :

          <>
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-gray-900">Achados</p>
                <p className="text-xs text-gray-500 tabular-nums">
                  <span style={{ color: COR.tratar }}>{contagem.tratar} a tratar</span>
                  {', '}
                  <span style={{ color: COR.tratado }}>{contagem.tratado} tratados</span>
                  {contagem.ausentes > 0 && <>{', '}{contagem.ausentes} ausentes</>}
                </p>
              </div>
              {achados.length === 0 ?
            <p className="text-sm text-gray-500">
                  {readOnly ?
              'Nenhuma marcação neste atendimento.' :
              'Escolha uma ferramenta acima e clique nas faces ou nos dentes para marcar.'}
                </p> :

            <ul className="space-y-0.5 max-h-96 overflow-y-auto -mx-1">
                  {Array.from(new Set(achados.map((a) => a.dente))).map((dente) =>
              <li key={dente}>
                      <button
                  type="button"
                  onClick={() => {
                    setFerramenta('selecionar');
                    setSelecionado(dente);
                  }}
                  onMouseEnter={() => setDestaque(dente)}
                  onMouseLeave={() => setDestaque(null)}
                  className="w-full flex items-start gap-2.5 rounded-md px-1 py-1 text-left text-sm hover:bg-gray-50">
                        <span className="w-7 font-semibold text-gray-900 tabular-nums">{dente}</span>
                        <span className="flex-1 space-y-0.5">
                          {achados.filter((a) => a.dente === dente).map((a, i) =>
                    <span key={i} className="flex items-center gap-2">
                              <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: a.grupo === 'tratar' ? COR.tratar : a.grupo === 'tratado' ? COR.tratado : a.grupo === 'preventivo' ? COR.selante : '#94A3B8' }} />
                              <span className="text-gray-700">{a.texto}</span>
                            </span>
                    )}
                        </span>
                      </button>
                    </li>
              )}
                </ul>
            }
            </>
          }
        </aside>
      </div>
    </div>);

}
