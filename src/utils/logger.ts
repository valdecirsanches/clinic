/**
 * Conditional logger for the frontend.
 *
 * In production builds (import.meta.env.PROD === true) all methods become no-ops,
 * eliminating the cost of thousands of console.log calls that were impacting
 * responsiveness across the app.
 *
 * In development (import.meta.env.DEV === true) it behaves exactly like console.
 *
 * IMPORTANT: This logger is intended for the FRONTEND only. Server-side logs
 * under server/ should continue using console.* directly — they are valuable
 * for backend debugging and do not affect UI performance.
 *
 * Usage:
 *   import { logger } from '../utils/logger';
 *   logger.log('debug info', data);
 *   logger.warn('something looks off');
 *   logger.error('operation failed', err);
 */

const isDev = typeof import.meta !== 'undefined' &&
// Vite exposes these flags on import.meta.env
// PROD is true in production builds, DEV is true in development
(import.meta as any)?.env?.DEV === true;
type LogFn = (...args: any[]) => void;
const noop: LogFn = () => {};

// In development, bind directly to console to preserve correct file:line info
// in the browser devtools. In production, use noops.
export const logger = {
  log: isDev ? console.log.bind(console) : noop,
  info: isDev ? console.info.bind(console) : noop,
  warn: isDev ? console.warn.bind(console) : noop,
  // Keep error visible even in production so real failures are still surfaced.
  // If you want fully silent errors in prod, swap this to `noop`.
  error: console.error.bind(console),
  debug: isDev ? console.debug?.bind(console) ?? console.log.bind(console) : noop,
  // Useful for grouping and timing — only active in dev.
  group: isDev ? console.group.bind(console) : noop,
  groupEnd: isDev ? console.groupEnd.bind(console) : noop,
  time: isDev ? console.time.bind(console) : noop,
  timeEnd: isDev ? console.timeEnd.bind(console) : noop,
  table: isDev ? console.table.bind(console) : noop
};
export default logger;