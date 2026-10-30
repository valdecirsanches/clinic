import React, { useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import { Button } from '../ui/Button';
import { PAGINAS_DEMO, ROTEIRO_PADRAO, type CenaDemo } from '../../data/demoRoteiro';

interface EtapaRoteiroProps {
  cenas: CenaDemo[];
  setCenas: React.Dispatch<React.SetStateAction<CenaDemo[]>>;
  onContinuar: () => void;
}

const nomePagina = (id: string) => PAGINAS_DEMO.find((p) => p.id === id)?.nome || id;

/** Lista de cenas à esquerda; a cena escolhida é editada à direita */
export function EtapaRoteiro({ cenas, setCenas, onContinuar }: EtapaRoteiroProps) {
  const [selecionadaId, setSelecionadaId] = useState(cenas[0]?.id || '');
  const indice = Math.max(0, cenas.findIndex((c) => c.id === selecionadaId));
  const cena = cenas[indice];

  const alterar = (campo: keyof CenaDemo, valor: string | number) =>
  setCenas((lista) => lista.map((c) => c.id === cena.id ? { ...c, [campo]: valor } : c));

  const mover = (d: -1 | 1) =>
  setCenas((lista) => {
    const j = indice + d;
    if (j < 0 || j >= lista.length) return lista;
    const nova = [...lista];
    [nova[indice], nova[j]] = [nova[j], nova[indice]];
    return nova;
  });

  const adicionar = () => {
    const nova: CenaDemo = { id: `cena${Date.now()}`, titulo: 'Nova cena', pagina: 'dashboard', legenda: '', narracao: '', duracaoMin: 6 };
    setCenas((l) => [...l.slice(0, indice + 1), nova, ...l.slice(indice + 1)]);
    setSelecionadaId(nova.id);
  };

  const remover = () => {
    if (cenas.length <= 1) return;
    const proxima = cenas[indice + 1] || cenas[indice - 1];
    setCenas((l) => l.filter((c) => c.id !== cena.id));
    setSelecionadaId(proxima.id);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg grid md:grid-cols-[280px_1fr] min-h-[520px]">
      {/* Cenas */}
      <nav aria-label="Cenas do roteiro" className="border-b md:border-b-0 md:border-r border-gray-200 flex flex-col">
        <ol className="flex-1 overflow-y-auto py-2">
          {cenas.map((c, i) =>
          <li key={c.id}>
              <button
              type="button"
              onClick={() => setSelecionadaId(c.id)}
              aria-current={c.id === cena?.id}
              className={`w-full text-left flex gap-3 px-4 py-2.5 transition-colors ${
              c.id === cena?.id ? 'bg-teal-50' : 'hover:bg-gray-50'}`
              }>
              
                <span className={`text-sm tabular-nums w-5 shrink-0 ${c.id === cena?.id ? 'text-teal-700 font-semibold' : 'text-gray-400'}`}>
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 truncate">{c.titulo || 'Sem título'}</span>
                  <span className="block text-xs text-gray-500 truncate">{nomePagina(c.pagina)}</span>
                </span>
              </button>
            </li>
          )}
        </ol>
        <div className="flex gap-2 p-3 border-t border-gray-100">
          <Button variant="secondary" size="sm" onClick={adicionar} className="flex-1">
            <PlusIcon className="w-4 h-4 mr-1 inline" aria-hidden="true" /> Nova cena
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm('Voltar ao roteiro padrão? Suas edições serão perdidas.')) {
                setCenas(ROTEIRO_PADRAO);
                setSelecionadaId(ROTEIRO_PADRAO[0].id);
              }
            }}
            aria-label="Voltar ao roteiro padrão"
            title="Voltar ao roteiro padrão">
            
            <RotateCcwIcon className="w-4 h-4" aria-hidden="true" />
          </Button>
        </div>
      </nav>

      {/* Editor da cena */}
      {cena &&
      <div className="p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              Cena {indice + 1} de {cenas.length}
            </p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => mover(-1)} disabled={indice === 0} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="Mover cena para cima">
                <ArrowUpIcon className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => mover(1)} disabled={indice === cenas.length - 1} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="Mover cena para baixo">
                <ArrowDownIcon className="w-4 h-4" />
              </button>
              <button type="button" onClick={remover} disabled={cenas.length <= 1} className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="Remover cena">
                <Trash2Icon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid sm:grid-cols-[1fr_220px] gap-4">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Título</span>
              <input value={cena.titulo} onChange={(e) => alterar('titulo', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Tela mostrada</span>
              <select value={cena.pagina} onChange={(e) => alterar('pagina', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {PAGINAS_DEMO.map((p) =>
              <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
              )}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">O que a voz fala</span>
            <textarea
            value={cena.narracao}
            onChange={(e) => alterar('narracao', e.target.value)}
            rows={5}
            maxLength={2500}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed" />
          
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Legenda na tela</span>
            <input value={cena.legenda} onChange={(e) => alterar('legenda', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <span className="block text-xs text-gray-500 mt-1">Frase curta exibida na parte de baixo do vídeo.</span>
          </label>

          <label className="block w-48">
            <span className="block text-sm font-medium text-gray-700 mb-1">Tempo mínimo na tela</span>
            <span className="flex items-center gap-2">
              <input
              type="number"
              min={2}
              max={60}
              value={cena.duracaoMin}
              onChange={(e) => alterar('duracaoMin', Math.max(2, Number(e.target.value) || 2))}
              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums" />
            
              <span className="text-sm text-gray-500">segundos</span>
            </span>
          </label>

          <div className="mt-auto pt-4 border-t border-gray-100 flex justify-end">
            <Button onClick={onContinuar}>Continuar para a voz</Button>
          </div>
        </div>
      }
    </div>);

}