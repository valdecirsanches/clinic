import { useEffect, useRef } from 'react';

/**
 * Smart polling hook — Phase 3 performance optimization.
 *
 * Acts like setInterval but automatically pauses while the browser tab is
 * hidden (document.visibilityState === 'hidden'). When the tab becomes
 * visible again it fires the callback immediately and resumes the interval.
 *
 * This avoids the situation where 5+ pollings (heartbeat, agenda refresh,
 * WhatsApp status checks, etc.) keep firing in background tabs, wasting
 * CPU and bandwidth while the user is doing something else.
 *
 * IMPORTANT: data freshness is preserved. When the user returns to the tab,
 * the callback runs immediately (`runOnVisible`) so they never see stale data.
 *
 * Usage:
 *   useSmartPolling(() => {
 *     refreshAgenda();
 *   }, 120000); // every 2 minutes while tab is visible
 *
 *   // Optionally disable conditionally:
 *   useSmartPolling(fetchStatus, 60000, { enabled: !!clinicaId });
 *
 * The callback can be a stable function or change between renders — the hook
 * always uses the latest reference (no stale closure).
 */
export function useSmartPolling(callback: () => void | Promise<void>, intervalMs: number, options?: {
  /** Disable the polling entirely while false. Defaults to true. */
  enabled?: boolean;
  /** Run the callback once immediately when the tab becomes visible again. Defaults to true. */
  runOnVisible?: boolean;
  /** Run the callback once immediately on mount. Defaults to false (matches setInterval semantics). */
  immediate?: boolean;
}) {
  const callbackRef = useRef(callback);
  const enabled = options?.enabled !== false;
  const runOnVisible = options?.runOnVisible !== false;
  const immediate = options?.immediate === true;

  // Keep ref pointed at the latest callback so we never call a stale closure.
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  useEffect(() => {
    if (!enabled || intervalMs <= 0) {
      return;
    }
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const fire = () => {
      try {
        callbackRef.current();
      } catch {


        // Swallow — polling errors must not crash the hook.
      }};
    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(fire, intervalMs);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        // Tab became visible — refresh immediately so user sees fresh data,
        // then restart the regular interval.
        if (runOnVisible) fire();
        start();
      }
    };

    // Initial state: only start if the tab is currently visible.
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      if (immediate) fire();
      start();
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    return () => {
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [intervalMs, enabled, runOnVisible, immediate]);
}
export default useSmartPolling;