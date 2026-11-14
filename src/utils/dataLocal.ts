// ==================== DATAS SEM FUSO (dia de calendário) ====================
// `new Date("2026-11-13")` é lido como meia-noite em UTC; no Brasil (UTC-3)
// isso vira 12/11 às 21:00 — o atendimento aparecia com UM DIA A MENOS.
// As consultas guardam `data` como "AAAA-MM-DD" e `horario` como "HH:MM";
// estas funções montam a data no horário LOCAL.

// "2026-11-13", "2026-11-13 00:00:00", "2026-11-13T00:00:00.000Z" (dia guardado
// como meia-noite UTC) — tudo isso é "só o dia".
const SO_DIA = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?)?$/;
const DIA_BR = /^(\d{2})\/(\d{2})\/(\d{4})/;
const HORA = /^(\d{1,2}):(\d{2})/;

/** A data é só o dia (sem hora real)? */
export function ehSoDia(valor: unknown): boolean {
  const s = String(valor ?? '').trim();
  return SO_DIA.test(s) || DIA_BR.test(s) && !/\d{1,2}:\d{2}/.test(s.slice(10));
}

/**
 * Converte o valor guardado em Date no horário local.
 * Só o dia + `horario` ("09:30") → aquele dia e hora; só o dia sem horário → meio-dia
 * (nenhum fuso muda o dia). Data com hora de verdade (ISO com fuso) → como está.
 */
export function dataLocal(valor: unknown, horario?: string | null): Date | null {
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  const s = String(valor ?? '').trim();
  if (!s) return null;
  const hm = HORA.exec(String(horario ?? '').trim());
  const hora = hm ? Number(hm[1]) : 12;
  const minuto = hm ? Number(hm[2]) : 0;
  const iso = SO_DIA.exec(s);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), hora, minuto);
  const br = DIA_BR.exec(s);
  if (br && ehSoDia(s)) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), hora, minuto);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** "13 de novembro de 2026" (e " às 09:30" quando a hora é conhecida). */
export function formatarDataAtendimento(valor: unknown, horario?: string | null, mesExtenso = true): string {
  const d = dataLocal(valor, horario);
  if (!d) return String(valor ?? '') || 'Data não informada';
  const horaConhecida = !ehSoDia(valor) || HORA.test(String(horario ?? '').trim());
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: mesExtenso ? 'long' : '2-digit',
    year: 'numeric',
    ...(horaConhecida ? { hour: '2-digit', minute: '2-digit' } : {})
  });
}
