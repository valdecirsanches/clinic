import React from 'react';
import { CalendarPlusIcon, FileTextIcon, PhoneIcon, UserIcon } from 'lucide-react';
import type { PacienteComConsultas } from '../../types/assistente';

interface CartaoPacientesProps {
  pacientes: PacienteComConsultas[];
  onAbrirCadastro: (pacienteId: string) => void;
  onAbrirProntuario: (pacienteId: string) => void;
  onMarcarPara: (nome: string) => void;
  onAbrirAgenda: (data: string, profissionalId?: string) => void;
}

function formatarData(iso: string | null) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

function formatarTelefone(t: string) {
  const d = t.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

/** Paciente encontrado + o que a recepção costuma fazer em seguida. */
export function CartaoPacientes({ pacientes, onAbrirCadastro, onAbrirProntuario, onMarcarPara, onAbrirAgenda }: CartaoPacientesProps) {
  const acao = 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-teal-800 transition-colors duration-150 hover:bg-teal-50';
  return (
    <ul className="divide-y divide-gray-100">
      {pacientes.map((p) =>
      <li key={p.id} className="py-2.5 first:pt-0 last:pb-0">
          <p className="truncate text-sm font-medium text-gray-900">{p.nome}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
            {p.dataNascimento && <span className="tabular-nums">Nasc. {formatarData(p.dataNascimento)}</span>}
            {p.telefone &&
          <span className="flex items-center gap-1 tabular-nums">
                <PhoneIcon className="h-3 w-3" /> {formatarTelefone(p.telefone)}
              </span>
          }
          </p>

          {p.consultas.length > 0 ?
        <button
          type="button"
          onClick={() => onAbrirAgenda(p.consultas[0].data, p.consultas[0].profissionalId)}
          className="mt-1.5 text-left text-xs text-gray-700 hover:text-teal-700">
          
              Próxima: <span className="capitalize">{p.consultas[0].rotulo}</span> às{' '}
              <span className="tabular-nums">{p.consultas[0].horario}</span>
              {p.consultas[0].profissional && <span className="text-gray-500"> · {p.consultas[0].profissional}</span>}
              {p.consultas.length > 1 && <span className="text-gray-500"> (+{p.consultas.length - 1})</span>}
            </button> :

        <p className="mt-1.5 text-xs text-gray-500">Sem consulta futura.</p>
        }

          <div className="-ml-2 mt-1.5 flex flex-wrap">
            <button type="button" onClick={() => onAbrirCadastro(p.id)} className={acao}>
              <UserIcon className="h-3.5 w-3.5" /> Cadastro
            </button>
            <button type="button" onClick={() => onMarcarPara(p.nome)} className={acao}>
              <CalendarPlusIcon className="h-3.5 w-3.5" /> Marcar
            </button>
            <button type="button" onClick={() => onAbrirProntuario(p.id)} className={acao}>
              <FileTextIcon className="h-3.5 w-3.5" /> Prontuário
            </button>
          </div>
        </li>
      )}
    </ul>);

}