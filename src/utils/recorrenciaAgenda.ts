/**
 * Lógica compartilhada de recorrência de agenda (semanas alternadas A/B).
 * Usado tanto na geração de slots (App.tsx) quanto no preview do modal (HorariosModal.tsx).
 */

import { HorarioTrabalho } from '../types';

/**
 * Converte datas da agenda para a chave local canônica YYYY-MM-DD.
 * Aceita o valor puro de inputs, timestamps legados e o formato brasileiro
 * para que uma data fixa nunca deixe de coincidir apenas por serialização.
 */
export function normalizarChaveData(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const year = Number(isoMatch?.[1] || brMatch?.[3]);
  const month = Number(isoMatch?.[2] || brMatch?.[2]);
  const day = Number(isoMatch?.[3] || brMatch?.[1]);

  if (
  !Number.isInteger(year) ||
  !Number.isInteger(month) ||
  !Number.isInteger(day))
  {
    return null;
  }

  const candidate = new Date(year, month - 1, day, 12);
  if (
  candidate.getFullYear() !== year ||
  candidate.getMonth() !== month - 1 ||
  candidate.getDate() !== day)
  {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Determina se uma data cai na semana A ou B, de forma determinística e estável.
 * Usa contagem absoluta de semanas desde uma época fixa (1970-01-01 quinta-feira).
 * IMPORTANTE: Esta função DEVE ser usada em TODOS os lugares que precisam decidir A/B
 * para garantir consistência entre geração de slots e preview de UI.
 */
export function semanaABParaData(date: Date): 'A' | 'B' {
  // Usa meio-dia local para evitar problemas de fuso/DST
  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0
  );

  // Época: 1970-01-01 (quinta-feira) às 12:00 local
  const epoch = new Date(1970, 0, 1, 12, 0, 0);

  // Diferença em dias
  const diffMs = d.getTime() - epoch.getTime();
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Número absoluto de semanas desde a época
  const numeroSemana = Math.floor(diffDias / 7);

  // Semanas pares = A, ímpares = B
  return numeroSemana % 2 === 0 ? 'A' : 'B';
}

/**
 * Verifica se um horário de trabalho vale para uma data específica,
 * considerando TODAS as regras: datasEspecificas, recorrencia (A/B), e diaSemana.
 *
 * IMPORTANTE: Esta é a função CANÔNICA de validação. Use-a em TODOS os lugares
 * que geram slots ou verificam disponibilidade.
 */
export function slotValeNaData(
ht: HorarioTrabalho,
date: Date,
dateKey // formato YYYY-MM-DD
: string): boolean {
  // Regra 1: Se tem datasEspecificas definidas, APENAS essas datas valem
  // (ignora recorrencia e diaSemana — datasEspecificas é override absoluto).
  // A comparação é normalizada para aceitar dados antigos serializados como
  // timestamp, sem zero à esquerda ou em formato brasileiro.
  if (ht.datasEspecificas && ht.datasEspecificas.length > 0) {
    const normalizedDateKey = normalizarChaveData(dateKey);
    return (
      normalizedDateKey !== null &&
      ht.datasEspecificas.some(
        (data) => normalizarChaveData(data) === normalizedDateKey
      ));

  }

  // Regra 2: Sem data específica, o horário só vale no dia semanal configurado.
  if (Number(ht.diaSemana) !== date.getDay()) {
    return false;
  }

  // Regra 3: Verifica recorrência (semana A/B)
  const recorrencia = ht.recorrencia || 'toda_semana'; // default retrocompatível

  if (recorrencia === 'semana_A' || recorrencia === 'semana_B') {
    const semanaData = semanaABParaData(date);
    const semanaEsperada = recorrencia === 'semana_A' ? 'A' : 'B';

    if (semanaData !== semanaEsperada) {
      return false; // Data cai na semana errada
    }
  }
  // Se recorrencia === 'toda_semana', não filtra por semana.
  return true;
}

/**
 * Retorna um label legível para a recorrência (para exibir na UI).
 */
export function getLabelRecorrencia(recorrencia?: string): string {
  switch (recorrencia) {
    case 'semana_A':
      return 'Semana A';
    case 'semana_B':
      return 'Semana B';
    case 'toda_semana':
    default:
      return 'Toda semana';
  }
}

/**
 * Retorna a recorrência oposta (para o botão "Duplicar para semana oposta").
 */
export function getRecorrenciaOposta(
recorrencia?: string)
: 'semana_A' | 'semana_B' {
  if (recorrencia === 'semana_B') return 'semana_A';
  return 'semana_B'; // default para A se era toda_semana ou já era A
}