'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ScreenPrivacyValue = {
  hidden: boolean;
  toggle: () => void;
  mask: (value: string) => string;
};

const ScreenPrivacyContext = createContext<ScreenPrivacyValue | null>(null);

export function ScreenPrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const toggle = useCallback(() => setHidden((current) => !current), []);
  const mask = useCallback(
    (value: string) => (hidden ? '••••••' : value),
    [hidden],
  );
  const contextValue = useMemo(
    () => ({ hidden, toggle, mask }),
    [hidden, mask, toggle],
  );

  return (
    <ScreenPrivacyContext.Provider value={contextValue}>
      {children}
    </ScreenPrivacyContext.Provider>
  );
}

export function useScreenPrivacy() {
  const context = useContext(ScreenPrivacyContext);

  if (!context) {
    throw new Error('useScreenPrivacy must be used within ScreenPrivacyProvider');
  }

  return context;
}
