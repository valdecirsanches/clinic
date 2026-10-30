import React from 'react';
import {
  CheckCircle2Icon,
  Loader2Icon,
  AlertCircleIcon,
  CircleDotIcon,
  PenToolIcon,
  ShieldCheckIcon,
  HistoryIcon,
  XIcon } from
'lucide-react';
import { SolicitarAssinaturaButton } from '../SolicitarAssinaturaButton';
import type { EstadoEtapa, MapaRascunhos } from '../../hooks/useRascunhoProntuario';

export const NOMES_ETAPAS: Record<string, string> = {
  anamnese: 'Anamnese',
  exame_fisico: 'Exame Físico',
  diagnostico: 'Diagnóstico',
  evolucao: 'Evolução',
  exames: 'Exames',
  prescricoes: 'Prescrições',
  relatorios: 'Relatórios',
  atestado: 'Atestado',
  odontograma: 'Odontograma',
  procedimento: 'Procedimento',
  avaliacao: 'Avaliação'
};
export const nomeEtapa = (id: string) => NOMES_ETAPAS[id] || id;

function horaCurta(ms: number) {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "Tudo salvo" · "Salvando…" · "2 etapas não salvas" · "Erro ao salvar" */
export function EstadoSalvamento({
  estados,
  onIrPara



}: {estados: Record<string, {estado: EstadoEtapa;em: number;}>;onIrPara?: (etapa: string) => void;}) {
  const lista = Object.entries(estados);
  const erros = lista.filter(([, v]) => v.estado === 'erro').map(([k]) => k);
  const salvando = lista.some(([, v]) => v.estado === 'salvando');
  const alteradas = lista.filter(([, v]) => v.estado === 'alterado').map(([k]) => k);
  const ultimoSalvo = lista.
  filter(([, v]) => v.estado === 'salvo').
  reduce((max, [, v]) => Math.max(max, v.em), 0);

  if (erros.length) {
    return (
      <button
        type="button"
        onClick={() => onIrPara?.(erros[0])}
        className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1 hover:bg-red-100"
        title="O texto continua guardado neste computador. Clique para ir até a etapa e tentar de novo.">
        <AlertCircleIcon className="w-3.5 h-3.5" />
        Erro ao salvar {nomeEtapa(erros[0])}
      </button>);
  }
  if (salvando) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-gray-500 px-2" role="status">
        <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> Salvando…
      </span>);
  }
  if (alteradas.length) {
    const texto = alteradas.length === 1 ? `${nomeEtapa(alteradas[0])} não salva` : `${alteradas.length} etapas não salvas`;
    return (
      <button
        type="button"
        onClick={() => onIrPara?.(alteradas[0])}
        className="flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100"
        title={`Guardado como rascunho neste computador: ${alteradas.map(nomeEtapa).join(', ')}. Ctrl+S salva a etapa aberta.`}>
        <CircleDotIcon className="w-3.5 h-3.5" />
        {texto}
      </button>);
  }
  if (ultimoSalvo) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-teal-700 px-2" role="status">
        <CheckCircle2Icon className="w-3.5 h-3.5" /> Salvo às {horaCurta(ultimoSalvo)}
      </span>);
  }
  return null;
}

/** Situação da assinatura do paciente, compacta, na barra de abas. */
export function AssinaturaChip({
  assinada,
  dataAssinatura,
  pacienteId,
  pacienteNome,
  pacienteTelefone,
  clinicaId,
  atendimentoId









}: {assinada: boolean;dataAssinatura?: string | null;pacienteId: string;pacienteNome: string;pacienteTelefone: string;clinicaId: string;atendimentoId: string;}) {
  if (assinada) {
    const quando = dataAssinatura ?
    new Date(dataAssinatura).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) :
    '';
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1" title={quando ? `Assinado em ${quando}` : 'Assinado'}>
        <ShieldCheckIcon className="w-3.5 h-3.5" /> Assinado
      </span>);
  }
  const podeSolicitar = Boolean(pacienteId && pacienteNome && pacienteTelefone && clinicaId && atendimentoId);
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full pl-2.5 pr-1 py-0.5">
      <PenToolIcon className="w-3.5 h-3.5" />
      <span className="whitespace-nowrap">Assinatura pendente</span>
      {podeSolicitar &&
      <SolicitarAssinaturaButton
        pacienteId={pacienteId}
        pacienteNome={pacienteNome}
        pacienteTelefone={pacienteTelefone}
        clinicaId={clinicaId}
        atendimentoId={atendimentoId}
        variant="ghost"
        size="sm"
        label="Solicitar"
        className="!px-2 !py-0.5 !text-xs text-amber-900 hover:bg-amber-100" />
      }
    </span>);
}

/** Ao reabrir um atendimento com texto que não chegou a ser salvo. */
export function AvisoRascunho({
  rascunhos,
  onRestaurar,
  onDescartar




}: {rascunhos: MapaRascunhos;onRestaurar: () => void;onDescartar: () => void;}) {
  const etapas = Object.keys(rascunhos);
  if (!etapas.length) return null;
  const maisRecente = Math.max(...etapas.map((e) => rascunhos[e].em || 0));
  const quando = new Date(maisRecente).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 bg-sky-50 border-b border-sky-200 text-sm text-sky-900" role="alert">
      <HistoryIcon className="w-4 h-4 text-sky-600 flex-shrink-0" />
      <span className="flex-1 min-w-[16rem]">
        Há texto que não foi salvo em <strong>{etapas.map(nomeEtapa).join(', ')}</strong> ({quando}). Deseja recuperar?
      </span>
      <button
        type="button"
        onClick={onRestaurar}
        className="px-3 py-1 rounded-md bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700">
        Recuperar
      </button>
      <button
        type="button"
        onClick={onDescartar}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-sky-800 hover:bg-sky-100">
        <XIcon className="w-3.5 h-3.5" /> Descartar
      </button>
    </div>);
}
