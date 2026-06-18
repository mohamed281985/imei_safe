import { useCallback, useRef } from 'react';

/**
 * Dev-only guard to suppress duplicate effect-triggered API executions
 * that happen within a short window (e.g. React StrictMode double-invoke).
 * In production it never blocks.
 */
export const useDevRequestDeduper = () => {
  const lastRunRef = useRef<Map<string, number>>(new Map());

  return useCallback((key: string, windowMs: number = 1200) => {
    if (!import.meta.env.DEV) return true;

    const now = Date.now();
    const lastRun = lastRunRef.current.get(key) || 0;
    if (now - lastRun < windowMs) {
      return false;
    }

    lastRunRef.current.set(key, now);
    return true;
  }, []);
};

export default useDevRequestDeduper;
