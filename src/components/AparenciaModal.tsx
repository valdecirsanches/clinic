import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, MoonIcon, RotateCcwIcon, SunIcon, XIcon } from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { CORES, PreferenciaTema, TEMA_PADRAO, aplicarTema, ehTemaPadrao, normalizarTema } from '../utils/temas';

// ============================================================================
// Aparência: cada usuário escolhe a cor, o modo claro/escuro, o tamanho da
// letra e os cantos. A tela muda na hora (pré-visualização); "Salvar" grava
// no usuário e vale em qualquer computador. Fechar sem salvar volta ao que
// estava. "Voltar ao padrão" apaga a escolha do usuário na hora.
// ============================================================================

interface Props {
  usuarioId: string;
  atual: unknown;
  onSalvo: (tema: PreferenciaTema | null) => void;
  onAviso: (tipo: 'sucesso' | 'erro', titulo: string, texto?: string) => void;
  onFechar: () => void;
}

const rgb = (v: string, a = 1) => `rgb(${v} / ${a})`;

export function AparenciaModal({ usuarioId, atual, onSalvo, onAviso, onFechar }: Props) {
  const inicial = useRef(normalizarTema(atual));
  const [tema, setTema] = useState<PreferenciaTema>(inicial.current);
  const [salvando, setSalvando] = useState(false);
  const alterado = JSON.stringify(tema) !== JSON.stringify(inicial.current);
  const jaPadrao = ehTemaPadrao(inicial.current) && ehTemaPadrao(tema);

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);
  const fechar = () => {
    aplicarTema(inicial.current);
    onFechar();
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gravar = async (novo: PreferenciaTema | null) => {
    setSalvando(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/usuarios/${encodeURIComponent(usuarioId)}/aparencia`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema: novo })
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados?.error || 'Não foi possível salvar a aparência.');
      const salvo = dados?.tema ? normalizarTema(dados.tema) : null;
      inicial.current = salvo || TEMA_PADRAO;
      aplicarTema(inicial.current);
      onSalvo(salvo);
      onAviso(
        'sucesso',
        salvo ? 'Aparência salva' : 'Aparência padrão restaurada',
        'Vale para o seu usuário em qualquer computador.'
      );
      onFechar();
    } catch (e: any) {
      onAviso('erro', 'Aparência', e?.message || 'Não foi possível salvar a aparência.');
    } finally {
      setSalvando(false);
    }
  };

  const opcao = (ativo: boolean) =>
  `flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${ativo ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-aparencia" className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="titulo-aparencia" className="text-lg font-semibold text-gray-900">Aparência</h2>
            <p className="text-sm text-gray-500">Só para o seu usuário. A tela já mostra como vai ficar.</p>
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-gray-800">Cor</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CORES.map((c) => {
                const ativo = tema.cor === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setTema({ ...tema, cor: c.id })}
                    className={`overflow-hidden rounded-xl border-2 text-left transition-shadow ${ativo ? 'border-teal-600 shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                    {/* Miniatura: menu com item ativo + botão na cor do tema */}
                    <span className="flex h-14" aria-hidden="true">
                      <span className="w-1/3 border-r border-gray-200 bg-white">
                        <span className="mx-1.5 mt-2 block h-1.5 rounded" style={{ background: rgb(c.destaque['100']) }} />
                        <span className="mx-1.5 mt-1 block h-1.5 rounded bg-gray-200" />
                      </span>
                      <span className="flex flex-1 flex-col justify-center gap-1.5 bg-gray-50 px-2">
                        <span className="block h-1.5 w-3/4 rounded bg-gray-300" />
                        <span className="block h-3 w-1/2 rounded" style={{ background: rgb(c.destaque['600']) }} />
                      </span>
                    </span>
                    <span className="flex items-center justify-between bg-white px-2.5 py-1.5 text-sm font-medium text-gray-800">
                      {c.nome}
                      {ativo && <CheckIcon className="h-4 w-4 text-teal-600" />}
                    </span>
                  </button>);

              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-gray-800">Modo</legend>
            <div className="flex gap-2">
              <button type="button" aria-pressed={tema.modo === 'claro'} onClick={() => setTema({ ...tema, modo: 'claro' })} className={opcao(tema.modo === 'claro')}>
                <SunIcon className="h-4 w-4" />Claro
              </button>
              <button type="button" aria-pressed={tema.modo === 'escuro'} onClick={() => setTema({ ...tema, modo: 'escuro' })} className={opcao(tema.modo === 'escuro')}>
                <MoonIcon className="h-4 w-4" />Escuro
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">O escuro cansa menos a vista em ambientes com pouca luz.</p>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-gray-800">Tamanho da letra</legend>
            <div className="flex gap-2">
              <button type="button" aria-pressed={tema.letra === 'normal'} onClick={() => setTema({ ...tema, letra: 'normal' })} className={opcao(tema.letra === 'normal')}>
                <span className="text-sm">Aa</span>Normal
              </button>
              <button type="button" aria-pressed={tema.letra === 'grande'} onClick={() => setTema({ ...tema, letra: 'grande' })} className={opcao(tema.letra === 'grande')}>
                <span className="text-lg leading-none">Aa</span>Grande
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-gray-800">Cantos</legend>
            <div className="flex gap-2">
              <button type="button" aria-pressed={tema.cantos === 'arredondados'} onClick={() => setTema({ ...tema, cantos: 'arredondados' })} className={opcao(tema.cantos === 'arredondados')}>
                <span className="h-4 w-6 rounded-md border-2 border-current" aria-hidden="true" />Arredondados
              </button>
              <button type="button" aria-pressed={tema.cantos === 'retos'} onClick={() => setTema({ ...tema, cantos: 'retos' })} className={opcao(tema.cantos === 'retos')}>
                <span className="h-4 w-6 border-2 border-current" style={{ borderRadius: 0 }} aria-hidden="true" />Retos
              </button>
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => gravar(null)}
            disabled={salvando || jaPadrao}
            title="Apaga a sua escolha e volta à aparência padrão do EasyClin"
            className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50">
            <RotateCcwIcon className="h-4 w-4" />
            Voltar ao padrão
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={fechar} className="flex-1 rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 hover:bg-gray-200 sm:flex-none">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => gravar(ehTemaPadrao(tema) ? null : tema)}
              disabled={salvando || !alterado}
              className="flex-1 rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 sm:flex-none">
              {salvando ? 'Salvando…' : 'Salvar aparência'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
