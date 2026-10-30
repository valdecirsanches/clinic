import React, { useState } from 'react';
import { CheckIcon, LoaderIcon } from 'lucide-react';
import type { OpcaoData, PacienteAssistente } from '../../types/assistente';

interface PropostaMarcacaoProps {
  pacientes: PacienteAssistente[];
  profissional: {id: string;nome: string;};
  opcoes: OpcaoData[];
  selecionado: {data: string;horario: string;} | null;
  aviso: string;
  concluida: boolean;
  ocupado: boolean;
  onConfirmar: (dados: {pacienteId: string;profissionalId: string;data: string;horario: string;}) => void;
  rotuloConcluida?: string;
}

export function PropostaMarcacao({ pacientes, profissional, opcoes, selecionado, aviso, concluida, ocupado, onConfirmar, rotuloConcluida = 'Marcada' }: PropostaMarcacaoProps) {
  const [pacienteId, setPacienteId] = useState(pacientes.length === 1 ? pacientes[0].id : '');
  const [escolha, setEscolha] = useState(selecionado);
  const paciente = pacientes.find((p) => p.id === pacienteId);
  const pronto = Boolean(paciente && escolha);

  if (concluida) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-green-700">
        <CheckIcon className="w-4 h-4" /> {rotuloConcluida}
      </p>);

  }

  return (
    <div className="space-y-3">
      {aviso && !selecionado && <p className="text-xs text-amber-800">{aviso}</p>}

      {pacientes.length > 1 &&
      <fieldset>
          <legend className="text-xs font-medium text-gray-500 mb-1">Paciente</legend>
          <div className="space-y-1">
            {pacientes.map((p) =>
          <label
            key={p.id}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm cursor-pointer transition-colors duration-150 ${
            pacienteId === p.id ? 'border-teal-600 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}`
            }>
            
                <input type="radio" name={`pac-${profissional.id}`} checked={pacienteId === p.id} onChange={() => setPacienteId(p.id)} className="accent-teal-600" />
                <span className="min-w-0 flex-1 truncate text-gray-900">{p.nome}</span>
                {p.dataNascimento && <span className="text-xs text-gray-500 tabular-nums">{formatarData(p.dataNascimento)}</span>}
              </label>
          )}
          </div>
        </fieldset>
      }

      <div className="space-y-2">
        {opcoes.map((o) =>
        <div key={o.data}>
            <p className="text-xs font-medium text-gray-500 mb-1 capitalize">{o.rotulo}</p>
            <div className="flex flex-wrap gap-1">
              {o.slots.slice(0, 16).map((s) => {
              const ativo = escolha?.data === o.data && escolha.horario === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setEscolha({ data: o.data, horario: s })}
                  className={`rounded-md px-2 py-1 text-xs font-medium tabular-nums transition-colors duration-150 ${
                  ativo ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`
                  }>
                  
                    {s}
                  </button>);

            })}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <p className="min-w-0 text-xs text-gray-600 truncate">
          {pronto ? `${paciente!.nome.split(' ')[0]} · ${profissional.nome} · ${formatarData(escolha!.data)} ${escolha!.horario}` : 'Escolha paciente e horário'}
        </p>
        <button
          type="button"
          disabled={!pronto || ocupado}
          onClick={() => onConfirmar({ pacienteId, profissionalId: profissional.id, data: escolha!.data, horario: escolha!.horario })}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-teal-700 disabled:bg-gray-200 disabled:text-gray-400">
          
          {ocupado ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
          Confirmar
        </button>
      </div>
    </div>);

}

function formatarData(iso: string) {
  const [a, m, d] = iso.split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}