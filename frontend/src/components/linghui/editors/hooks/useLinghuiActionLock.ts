import { useCallback, useEffect, useRef, useState } from 'react';

export function useLinghuiActionLock(blocked = false, cooldownMs = 900) {
  const lockedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const [locked, setLocked] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const release = useCallback(() => {
    clearTimer();
    lockedRef.current = false;
    setLocked(false);
  }, [clearTimer]);

  useEffect(() => {
    if (blocked) {
      release();
    }
  }, [blocked, release]);

  useEffect(() => () => {
    clearTimer();
  }, [clearTimer]);

  const runWithActionLock = useCallback((action: () => void | Promise<void>) => {
    if (blocked || lockedRef.current) {
      return false;
    }

    lockedRef.current = true;
    setLocked(true);

    try {
      const result = action();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        void (result as Promise<void>).catch(() => undefined);
      }
    } catch (error) {
      release();
      throw error;
    }

    clearTimer();
    timerRef.current = window.setTimeout(() => {
      lockedRef.current = false;
      setLocked(false);
      timerRef.current = null;
    }, cooldownMs);

    return true;
  }, [blocked, clearTimer, cooldownMs, release]);

  return { locked, runWithActionLock };
}
