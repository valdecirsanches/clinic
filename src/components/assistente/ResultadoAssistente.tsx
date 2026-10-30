import React from 'react';
import { CalendarIcon } from 'lucide-react';
import { PropostaMarcacao } from './PropostaMarcacao';
import { PropostaCancelamento } from './PropostaCancelamento';
import { CartaoPacientes } from './CartaoPacientes';
import { ResumoDia } from './ResumoDia';
import type { ResultadoAssistente as Resultado } from '../../types/assistente';

type DadosMarcacao = {pacienteId: string;profissionalId: string;data: string;horario: string;};

interface ResultadoAssistenteProps {
  resultado: Resultado;
  concluida: boolean;
  ocupado: boolean;
  onConfirmarMarcacao: (dados: DadosMarcacao) => void;
  onConfirmarRemarcacao: (consultaId: string, dados: DadosMarcacao) => void;
  onConfirmarCancelamento: (consultaId: string, motivo: string) => void;
  onAbrirAgenda: (data: string, profissionalId?: string) => void;
  onAbrirCadastro: (pacienteId: string) => void;
  onAbrirProntuario: (pacienteId: string) => void;
  onMarcarPara: (nome: string) => void;
}

const STATUS: Record<string, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  realizada: 'Realizada',
  em_atendimento: 'Em atendimento'
};

export function ResultadoAssistente({
  resultado,
  concluida,
  ocupado,
  onConfirmarMarcacao,
  onConfirmarRemarcacao,
  onConfirmarCancelamento,
  onAbrirAgenda,
  onAbrirCadastro,
  onAbrirProntuario,
  onMarcarPara
}: ResultadoAssistenteProps) {
  switch (resultado.tipo) {
    case 'proposta_marcacao':
      return <PropostaMarcacao {...resultado.dados} concluida={concluida} ocupado={ocupado} onConfirmar={onConfirmarMarcacao} />;

    case 'proposta_remarcacao':{
        const c = resultado.dados.consulta;
        return (
          <div>
          <p className="mb-3 text-xs text-gray-600">
            De: <span className="capitalize">{c.rotulo}</span> às <span className="tabular-nums">{c.horario}</span>
            {c.profissional && ` · ${c.profissional}`}
          </p>
          <PropostaMarcacao
              {...resultado.dados}
              concluida={concluida}
              ocupado={ocupado}
              rotuloConcluida="Remarcada"
              onConfirmar={(dados) => onConfirmarRemarcacao(c.id, dados)} />
            
        </div>);

      }

    case 'pacientes':
      return (
        <CartaoPacientes
          pacientes={resultado.dados.pacientes}
          onAbrirCadastro={onAbrirCadastro}
          onAbrirProntuario={onAbrirProntuario}
          onMarcarPara={onMarcarPara}
          onAbrirAgenda={onAbrirAgenda} />);



    case 'resumo_dia':
      return <ResumoDia {...resultado.dados} onAbrirAgenda={onAbrirAgenda} />;

    case 'proposta_cancelamento':
      return (
        <PropostaCancelamento
          consultas={resultado.dados.consultas}
          motivoInicial={resultado.dados.motivo}
          concluida={concluida}
          ocupado={ocupado}
          onConfirmar={onConfirmarCancelamento} />);



    case 'horarios':
      return (
        <div className="space-y-3">
          {resultado.dados.grupos.map((g) =>
          <div key={`${g.profissionalId}-${g.data}`}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="min-w-0 truncate text-xs font-medium text-gray-700">
                  {g.profissional} · <span className="capitalize">{g.rotulo}</span>
                </p>
                <button type="button" onClick={() => onAbrirAgenda(g.data, g.profissionalId)} className="shrink-0 text-xs text-teal-700 hover:underline">
                  Abrir agenda
                </button>
              </div>
              <p className="text-xs text-gray-600 tabular-nums leading-relaxed">{g.slots.slice(0, 20).join('  ·  ')}{g.slots.length > 20 ? '  …' : ''}</p>
            </div>
          )}
        </div>);


    case 'agenda':
      return resultado.dados.itens.length ?
      <div>
          <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
            {resultado.dados.itens.map((c) =>
          <li key={c.id} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-11 shrink-0 font-medium tabular-nums text-gray-900">{c.horario}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-gray-900">{c.paciente}</span>
                  {!resultado.dados.profissional && c.profissional && <span className="block truncate text-xs text-gray-500">{c.profissional}</span>}
                </span>
                <span className="shrink-0 text-xs text-gray-500">{STATUS[c.status] || c.status}</span>
              </li>
          )}
          </ul>
          <button type="button" onClick={() => onAbrirAgenda(resultado.dados.data)} className="mt-2 flex items-center gap-1 text-xs text-teal-700 hover:underline">
            <CalendarIcon className="w-3.5 h-3.5" /> Abrir na agenda
          </button>
        </div> :
      null;

    case 'consultas_paciente':
      return (
        <CartaoPacientes
          pacientes={resultado.dados.pacientes}
          onAbrirCadastro={onAbrirCadastro}
          onAbrirProntuario={onAbrirProntuario}
          onMarcarPara={onMarcarPara}
          onAbrirAgenda={onAbrirAgenda} />);



    default:
      return null;
  }
}