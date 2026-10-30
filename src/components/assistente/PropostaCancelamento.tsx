import React, { useState } from 'react';
import { CheckIcon, LoaderIcon } from 'lucide-react';
import type { ConsultaAssistente } from '../../types/assistente';

interface PropostaCancelamentoProps {
  consultas: ConsultaAssistente[];
  motivoInicial: string;
  concluida: boolean;
  ocupado: boolean;
  onConfirmar: (consultaId: string, motivo: string) => void;
}

export function PropostaCancelamento({ consultas, motivoInicial, concluida, ocupado, onConfirmar }: PropostaCancelamentoProps) {
  const [consultaId, setConsultaId] = useState(consultas.length === 1 ? consultas[0].id : '');
  const [motivo, setMotivo] = useState(motivoInicial);

  if (concluida) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-gray-600">
        <CheckIcon className="w-4 h-4" /> Cancelada
      </p>);

  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {consultas.map((c) =>
        <label
          key={c.id}
          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm cursor-pointer transition-colors duration-150 ${
          consultaId === c.id ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`
          }>
          
            <input type="radio" name="cancelar" checked={consultaId === c.id} onChange={() => setConsultaId(c.id)} className="accent-red-600" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-gray-900">{c.paciente}</span>
              <span className="block truncate text-xs text-gray-500">
                <span className="capitalize">{c.rotulo}</span> às {c.horario}
                {c.profissional && ` · ${c.profissional}`}
              </span>
            </span>
          </label>
        )}
      </div>
      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">Motivo</span>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Solicitado pelo paciente"
          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-red-400" />
        
      </label>
      <div className="flex justify-end border-t border-gray-100 pt-3">
        <button
          type="button"
          disabled={!consultaId || ocupado}
          onClick={() => onConfirmar(consultaId, motivo)}
          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400">
          
          {ocupado && <LoaderIcon className="w-4 h-4 animate-spin" />}
          Cancelar consulta
        </button>
      </div>
    </div>);

}