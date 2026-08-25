'use client';

import type { ElementType, ReactNode } from 'react';
import { useScreenPrivacy } from '../../lib/privacy/privacy-context';

export function FinancialValue({
  value,
  as: Component = 'span',
  className,
  unavailable = false,
}: {
  value: string;
  as?: ElementType;
  className?: string;
  unavailable?: boolean;
}) {
  const { mask } = useScreenPrivacy();
  const rendered: ReactNode = unavailable ? value : mask(value);
  return <Component className={className}>{rendered}</Component>;
}
