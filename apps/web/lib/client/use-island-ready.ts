'use client';

import { useEffect, useState } from 'react';

/** Keeps an SSR-rendered island inert until that island has hydrated itself. */
export function useIslandReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return ready;
}
