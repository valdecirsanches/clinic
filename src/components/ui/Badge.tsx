import React from 'react';
import { StatusConsulta } from '../../types';
interface BadgeProps {
  status: StatusConsulta;
}
export function Badge({
  status
}: BadgeProps) {
  const styles: Record<string, string> = {
    agendada: 'bg-white text-gray-600 border border-gray-300',
    aguardando_confirmacao: 'bg-purple-100 text-purple-800 animate-pulse',
    confirmada: 'bg-blue-100 text-blue-800',
    realizada: 'bg-indigo-100 text-indigo-800',
    cancelada: 'bg-red-200 text-red-900',
    aguardando_remarcacao: 'bg-orange-100 text-orange-800',
    compareceu: 'bg-green-100 text-green-800',
    faltou: 'bg-red-100 text-red-800'
  };
  const labels: Record<string, string> = {
    agendada: 'Agendada',
    aguardando_confirmacao: '⏳ Aguardando',
    confirmada: 'Confirmada',
    realizada: 'Realizada',
    cancelada: 'Cancelada',
    aguardando_remarcacao: 'Aguardando Remarcação',
    compareceu: 'Compareceu',
    faltou: 'Faltou'
  };
  const statusNormalizado = (status || '').toLowerCase().trim();
  return <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[statusNormalizado] || 'bg-gray-100 text-gray-800'}`}>
      
      {labels[statusNormalizado] || status}
    </span>;
}