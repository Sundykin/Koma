import { useEffect, useState } from 'react';

const LINGHUI_COARSE_POINTER_QUERY = '(pointer: coarse)';

export function resolveLinghuiCanvasTouchMode(matchMedia?: Window['matchMedia']): boolean {
  if (!matchMedia) {
    return false;
  }

  try {
    return Boolean(matchMedia(LINGHUI_COARSE_POINTER_QUERY).matches);
  } catch {
    return false;
  }
}

export function useLinghuiCanvasTouchMode(): boolean {
  const [isTouchMode, setIsTouchMode] = useState(() => (
    typeof window === 'undefined' ? false : resolveLinghuiCanvasTouchMode(window.matchMedia?.bind(window))
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia(LINGHUI_COARSE_POINTER_QUERY);
    const syncTouchMode = () => setIsTouchMode(Boolean(mediaQuery.matches));
    syncTouchMode();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', syncTouchMode);
      return () => mediaQuery.removeEventListener('change', syncTouchMode);
    }

    mediaQuery.addListener?.(syncTouchMode);
    return () => mediaQuery.removeListener?.(syncTouchMode);
  }, []);

  return isTouchMode;
}
