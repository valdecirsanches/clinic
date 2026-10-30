/**
 * ⭐ Versão do App — FONTE ÚNICA
 *
 * A versão MAJOR.MINOR.PATCH é manual.
 * O BUILD_DATE é atualizado automaticamente a cada compilação/deploy.
 *
 * Formato exibido: v2.0.6-b250525.1830
 *   - 2.0.6 = versão semântica (manual)
 *   - b250525 = data do build (AAMMDD)
 *   - 1830 = hora do build (HHmm)
 */

// Versão semântica (atualizar manualmente em releases)
const MAJOR = 2;
const MINOR = 0;
const PATCH = 6;

// ⭐ Data do build — atualizada automaticamente pelo Vite via define
// Fallback: usa a data de carregamento do módulo (funciona em qualquer ambiente)
function getBuildTimestamp(): string {
  try {
    // Vite injeta __BUILD_TIMESTAMP__ via define em vite.config.ts
    // @ts-ignore — pode não existir em todos os ambientes
    if (typeof __BUILD_TIMESTAMP__ !== 'undefined') {
      // @ts-ignore
      return __BUILD_TIMESTAMP__;
    }
  } catch {


    // ignorar
  } // Fallback: data de quando o módulo foi carregado (= início da sessão)
  return new Date().toISOString();}
const BUILD_TIMESTAMP = getBuildTimestamp();
function gerarSufixoBuild(): string {
  try {
    const dt = new Date(BUILD_TIMESTAMP);
    if (isNaN(dt.getTime())) throw new Error('Invalid date');
    const aa = String(dt.getFullYear()).slice(2);
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const min = String(dt.getMinutes()).padStart(2, '0');
    return `b${dd}${mm}${aa}.${hh}${min}`;
  } catch {
    return 'dev';
  }
}

/** Versão curta: "v2.0.6" */
export const APP_VERSION_SHORT = `v${MAJOR}.${MINOR}.${PATCH}`;

/** Versão completa com build: "v2.0.6-b250525.1830" */
export const APP_VERSION = `v${MAJOR}.${MINOR}.${PATCH}-${gerarSufixoBuild()}`;

/** Data/hora do build como Date */
export function getBuildDate(): Date {
  try {
    const dt = new Date(BUILD_TIMESTAMP);
    if (isNaN(dt.getTime())) return new Date();
    return dt;
  } catch {
    return new Date();
  }
}