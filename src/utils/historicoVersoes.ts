import type { VersaoHistorico } from '../config/version';

/** Compara "2.1.10" com "2.1.9" numericamente: >0 se a > b. */
export function compararVersoes(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Versões do histórico mais novas que a que o usuário está usando (mais nova primeiro). */
export function versoesNovas(historico: VersaoHistorico[], versaoCarregada: string): VersaoHistorico[] {
  return (historico || []).
  filter((v) => v && v.versao && compararVersoes(v.versao, versaoCarregada) > 0).
  sort((a, b) => compararVersoes(b.versao, a.versao));
}

/** "2026-11-13" → "13/11/2026" (sem fuso: a data é de calendário). */
export function formatarDataVersao(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(data || '');
}
