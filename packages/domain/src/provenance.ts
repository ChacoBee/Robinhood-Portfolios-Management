import type { QualityState } from './quality';

export type ProvenanceSource =
  | 'robinhood_mcp'
  | 'csv_import'
  | 'pdf_statement'
  | 'synthetic_demo'
  | 'calculated';

export interface Provenance {
  source: ProvenanceSource;
  sourceAccountRef?: string;
  observedAt: string;
  sourceAsOf: string;
  syncRunId?: string;
  importBatchId?: string;
  parserVersion?: string;
  mappingVersion?: string;
  calculationVersion?: string;
  quality: QualityState;
  rawSourceReference?: string;
  receiveTimeFallback?: boolean;
}
