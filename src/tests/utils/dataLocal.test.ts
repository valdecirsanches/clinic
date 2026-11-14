/**
 * Atendimento do dia 13/11 aparecia como 12/11 às 21:00 (UTC-3): a data da
 * consulta ("AAAA-MM-DD") era lida como meia-noite UTC.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dataLocal, ehSoDia, formatarDataAtendimento } from '../../utils/dataLocal';

const tzOriginal = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/Sao_Paulo';
});
afterAll(() => {
  process.env.TZ = tzOriginal;
});

describe('dataLocal', () => {
  it('dia da consulta não volta um dia no Brasil', () => {
    const d = dataLocal('2026-11-13')!;
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 11, 13]);
    const meiaNoiteUtc = dataLocal('2026-11-13T00:00:00.000Z')!;
    expect(meiaNoiteUtc.getDate()).toBe(13);
    expect(dataLocal('2026-11-13 00:00:00')!.getDate()).toBe(13);
    expect(dataLocal('13/11/2026')!.getDate()).toBe(13);
  });

  it('usa o horário da consulta', () => {
    const d = dataLocal('2026-11-13', '09:30')!;
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([13, 9, 30]);
  });

  it('data com hora de verdade continua como está', () => {
    const d = dataLocal('2026-11-13T15:20:00.000Z')!;
    expect([d.getDate(), d.getHours()]).toEqual([13, 12]); // 15:20 UTC = 12:20 em Brasília
    expect(ehSoDia('2026-11-13T15:20:00.000Z')).toBe(false);
  });

  it('formata sem inventar hora quando só há o dia', () => {
    expect(formatarDataAtendimento('2026-11-13')).toBe('13 de novembro de 2026');
    expect(formatarDataAtendimento('2026-11-13', '09:30')).toMatch(/^13 de novembro de 2026.*09:30$/);
    expect(formatarDataAtendimento('')).toBe('Data não informada');
  });
});
