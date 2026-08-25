'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

type ScreenPrivacyValue = { hidden: boolean; toggle: () => void; mask: (value: string) => string };
const ScreenPrivacyContext = createContext<ScreenPrivacyValue | null>(null);
const STORAGE_KEY = 'aurum.screenPrivacy';
const CHANGE_EVENT = 'aurum:screen-privacy-change';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

function getSnapshot() {
  return window.sessionStorage.getItem(STORAGE_KEY) === 'hidden';
}

function getServerSnapshot() {
  return false;
}

export function ScreenPrivacyProvider({ children }: { children: ReactNode }) {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => {
    window.sessionStorage.setItem(STORAGE_KEY, hidden ? 'visible' : 'hidden');
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [hidden]);
  const mask = useCallback((value: string) => (hidden ? '••••••' : value), [hidden]);
  const contextValue = useMemo(() => ({ hidden, toggle, mask }), [hidden, mask, toggle]);

  return <ScreenPrivacyContext.Provider value={contextValue}>{children}</ScreenPrivacyContext.Provider>;
}

export function useScreenPrivacy() {
  const context = useContext(ScreenPrivacyContext);
  if (!context) throw new Error('useScreenPrivacy must be used within ScreenPrivacyProvider');
  return context;
}
