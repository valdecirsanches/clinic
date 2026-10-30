import { describe, expect, it } from 'vitest';
import {
  normalizarChaveData,
  slotValeNaData } from
'../../utils/recorrenciaAgenda';
import { HorarioTrabalho } from '../../types';

const horarioFixo: HorarioTrabalho = {
  diaSemana: 4,
  horaInicio: '08:00',
  horaFim: '12:00',
  duracaoConsultaPadrao: 30,
  datasEspecificas: ['2026-08-13T00:00:00.000Z', '20/08/2026']
};

describe('recorrência de agenda por datas fixas', () => {
  it('normaliza formatos persistidos para a chave local da agenda', () => {
    expect(normalizarChaveData('2026-8-13')).toBe('2026-08-13');
    expect(normalizarChaveData('2026-08-13T00:00:00.000Z')).toBe('2026-08-13');
    expect(normalizarChaveData('20/08/2026')).toBe('2026-08-20');
  });

  it('reconhece todas as datas fixas independentemente do formato salvo', () => {
    expect(
      slotValeNaData(horarioFixo, new Date(2026, 7, 13, 12), '2026-08-13')
    ).toBe(true);
    expect(
      slotValeNaData(horarioFixo, new Date(2026, 7, 20, 12), '2026-08-20')
    ).toBe(true);
  });

  it('não libera uma data fora da configuração fixa', () => {
    expect(
      slotValeNaData(horarioFixo, new Date(2026, 7, 27, 12), '2026-08-27')
    ).toBe(false);
  });
});