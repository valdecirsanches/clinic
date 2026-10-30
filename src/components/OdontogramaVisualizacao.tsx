import React from 'react';
import { ArcadasSvg } from './odontograma/ArcadasSvg';
import { COR, Denticao, OdontogramaDados, listarAchados } from './odontograma/modelo';

// Visualização somente leitura (histórico do prontuário): mesmo desenho do
// odontograma do atendimento, com a lista de achados.
interface OdontogramaVisualizacaoProps {
  data: OdontogramaDados;
}
export function OdontogramaVisualizacao({ data }: OdontogramaVisualizacaoProps) {
  const dados = data || {};
  const nums = Object.keys(dados);
  const temDecido = nums.some((n) => Number(n[0]) >= 5);
  const temPermanente = nums.some((n) => Number(n[0]) <= 4);
  const denticao: Denticao = temDecido && temPermanente ? 'mista' : temDecido ? 'decidua' : 'permanente';
  const achados = listarAchados(dados);
  const cor = { tratar: COR.tratar, tratado: COR.tratado, preventivo: COR.selante, outro: '#94A3B8' };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white px-2 py-3 overflow-x-auto">
        <div className="min-w-[560px]">
          <ArcadasSvg dados={dados} denticao={denticao} />
        </div>
      </div>
      {achados.length > 0 ?
      <ul className="grid gap-1 sm:grid-cols-2 text-sm">
          {achados.map((a, i) =>
        <li key={`${a.dente}-${i}`} className="flex items-center gap-2">
              <span className="w-7 font-semibold text-gray-900 tabular-nums">{a.dente}</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: cor[a.grupo] }} />
              <span className="text-gray-700">{a.texto}</span>
            </li>
        )}
        </ul> :

      <p className="text-sm text-gray-500">Nenhuma marcação registrada.</p>
      }
    </div>);
}
