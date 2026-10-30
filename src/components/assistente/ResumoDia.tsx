import React from 'react';
import { CalendarIcon } from 'lucide-react';

interface ResumoDiaProps {
  data: string;
  total: number;
  porStatus: {status: string;quantidade: number;}[];
  porProfissional: {profissionalId: string;profissional: string;total: number;proxima: {horario: string;paciente: string;} | null;}[];
  onAbrirAgenda: (data: string, profissionalId?: string) => void;
}

const STATUS: Record<string, string> = {
  agendada: 'Agendadas',
  confirmada: 'Confirmadas',
  aguardando_confirmacao: 'Aguardando',
  realizada: 'Realizadas',
  em_atendimento: 'Em atendimento',
  faltou: 'Faltas',
  chegou: 'Na recepção'
};

/** O total ganha destaque; profissionais em lista, cada um abre a própria agenda. */
export function ResumoDia({ data, total, porStatus, porProfissional, onAbrirAgenda }: ResumoDiaProps) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-gray-900">{total}</span>
        <span className="text-sm text-gray-600">consulta{total > 1 ? 's' : ''}</span>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600">
        {porStatus.map((s) =>
        <span key={s.status}>
            <span className="font-medium tabular-nums text-gray-900">{s.quantidade}</span> {STATUS[s.status] || s.status}
          </span>
        )}
      </p>

      <ul className="mt-3 max-h-56 divide-y divide-gray-100 overflow-y-auto border-t border-gray-100">
        {porProfissional.map((p) =>
        <li key={p.profissionalId}>
            <button
            type="button"
            onClick={() => onAbrirAgenda(data, p.profissionalId)}
            className="flex w-full items-center gap-3 py-2 text-left transition-colors duration-150 hover:bg-gray-50">
            
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-900">{p.profissional}</span>
                <span className="block truncate text-xs text-gray-500">
                  {p.proxima ? `Próximo: ${p.proxima.horario} · ${p.proxima.paciente}` : 'Sem próximos pacientes'}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-gray-700">{p.total}</span>
            </button>
          </li>
        )}
      </ul>
      <button type="button" onClick={() => onAbrirAgenda(data)} className="mt-2 flex items-center gap-1 text-xs text-teal-700 hover:underline">
        <CalendarIcon className="h-3.5 w-3.5" /> Abrir a agenda do dia
      </button>
    </div>);

}