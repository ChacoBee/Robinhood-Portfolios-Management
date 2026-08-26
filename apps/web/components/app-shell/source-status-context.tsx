'use client';

import type { DataQualityReadModel, DataSourceMode } from '@aurum/domain';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type ObservedSourceStatus = Readonly<{
  mode: DataSourceMode;
  asOf: string | null;
  quality: DataQualityReadModel | undefined;
}>;

type SourceObservation = Readonly<{
  token: symbol;
  status: ObservedSourceStatus;
}>;

type SourceStatusContextValue = Readonly<{
  status: ObservedSourceStatus | null;
  observe: (status: ObservedSourceStatus) => () => void;
}>;

const SourceStatusContext = createContext<SourceStatusContextValue>({
  status: null,
  observe: () => () => undefined,
});

export function SourceStatusProvider({ children }: { children: ReactNode }) {
  const [observation, setObservation] = useState<SourceObservation | null>(null);
  const observe = useCallback((status: ObservedSourceStatus) => {
    const token = Symbol('source-observation');
    setObservation({ status, token });
    return () => {
      setObservation((current) => current?.token === token ? null : current);
    };
  }, []);
  const value = useMemo<SourceStatusContextValue>(() => ({
    observe,
    status: observation?.status ?? null,
  }), [observation, observe]);

  return <SourceStatusContext.Provider value={value}>{children}</SourceStatusContext.Provider>;
}

export function useObservedSourceStatus() {
  return useContext(SourceStatusContext).status;
}

export function useSourceStatusObserver() {
  return useContext(SourceStatusContext).observe;
}
