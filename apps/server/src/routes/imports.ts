import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ImportValidationError,
  MemoryEvidenceStore,
  MemoryImportStateStore,
  confirmImport,
  previewImport,
  type ImportPreview,
  type ImportResult,
} from '../imports';
import { ReadModelSourceError } from '../read-models/errors';

const DemoPreviewBody = z.object({ fixture: z.literal('synthetic-activity-v1') }).strict();
const ConnectedPreviewBody = z
  .object({
    accountId: z.string().uuid(),
    filename: z.string().min(1).max(180),
    mediaType: z.enum(['text/csv', 'application/pdf']),
    contentBase64: z.string().min(1).max(14_000_000),
  })
  .strict();
const ConfirmBody = z
  .object({
    previewId: z.string().min(1).max(128),
    selectedCandidateIds: z.array(z.string().min(1).max(128)).max(5_000),
  })
  .strict();

const syntheticCsv = new TextEncoder().encode(
  [
    'date,type,amount,description,transaction_id',
    '2026-08-01,deposit,500.00,Synthetic fixture deposit,demo-import-001',
    '2026-08-08,dividend,7.25,Synthetic fixture distribution,demo-import-002',
  ].join('\n'),
);

export interface ImportRouteController {
  preview(input: {
    accountId: string;
    filename: string;
    mediaType: 'text/csv' | 'application/pdf';
    bytes: Uint8Array;
  }): Promise<ImportPreview>;
  confirm(input: {
    previewId: string;
    selectedCandidateIds: readonly string[];
  }): Promise<ImportResult>;
}

export interface PublicImportPreview {
  id: string;
  filename: string;
  mediaType: 'text/csv' | 'application/pdf';
  acceptedRows: number;
  duplicateRows: number;
  ambiguousRows: number;
  rejectedRows: number;
  evidenceExpiresAt: string;
  state: ImportPreview['state'];
  rows: Array<{
    candidate: null | {
      id: string;
      kind: string;
      amount: { amount: string; currency: 'USD' };
      effectiveAt: string;
      description: string;
      sourceLocation: string;
    };
    decision: ImportPreview['rows'][number]['decision'];
    messages: string[];
    sourceLocation: string;
  }>;
}

export function toPublicImportPreview(preview: ImportPreview): PublicImportPreview {
  return {
    id: preview.id,
    filename: preview.filename,
    mediaType: preview.mediaType,
    acceptedRows: preview.acceptedRows,
    duplicateRows: preview.duplicateRows,
    ambiguousRows: preview.ambiguousRows,
    rejectedRows: preview.rejectedRows,
    evidenceExpiresAt: preview.evidenceExpiresAt,
    state: preview.state,
    rows: preview.rows.map((row) => ({
      candidate: row.candidate
        ? {
            id: row.candidate.id,
            kind: row.candidate.kind,
            amount: row.candidate.amount,
            effectiveAt: row.candidate.effectiveAt,
            description: row.candidate.description,
            sourceLocation: row.candidate.sourceLocation,
          }
        : null,
      decision: row.decision,
      messages: row.messages,
      sourceLocation: row.sourceLocation,
    })),
  };
}

export function createDemoImportController(): ImportRouteController {
  const stateStore = new MemoryImportStateStore();
  const evidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 41));
  return {
    preview: (input) =>
      previewImport(
        {
          userId: 'synthetic-demo-user',
          accountId: input.accountId,
          filename: input.filename,
          mediaType: input.mediaType,
          bytes: input.bytes,
        },
        {
          stateStore,
          evidenceStore,
          listExisting: async () => [],
        },
      ),
    confirm: (input) =>
      confirmImport(
        {
          previewId: input.previewId,
          userId: 'synthetic-demo-user',
          selectedCandidateIds: input.selectedCandidateIds,
        },
        { stateStore },
      ),
  };
}

function invalidRequest(): never {
  throw new ReadModelSourceError('invalid_request', 400);
}

function parseBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return invalidRequest();
  }
  return Buffer.from(value, 'base64');
}

function mapImportError(error: unknown): never {
  if (error instanceof ImportValidationError) return invalidRequest();
  throw error;
}

export function registerImportRoutes(
  app: FastifyInstance,
  options: {
    mode: 'demo' | 'connected';
    controller?: ImportRouteController;
    assertMutationAuthorized?: (request: FastifyRequest) => Promise<void>;
  },
): void {
  const controller =
    options.controller ??
    (options.mode === 'demo' ? createDemoImportController() : undefined);
  const authorize = async (request: FastifyRequest) => {
    if (options.mode === 'connected' && !options.assertMutationAuthorized) {
      throw new ReadModelSourceError('source_unavailable', 503);
    }
    await options.assertMutationAuthorized?.(request);
  };
  const envelope = <T>(request: FastifyRequest, data: T) => ({
    data,
    requestId: String(request.id),
    generatedAt: new Date().toISOString(),
  });

  app.post('/v1/imports/preview', async (request) => {
    await authorize(request);
    if (!controller) throw new ReadModelSourceError('source_unavailable', 503);
    try {
      if (options.mode === 'demo') {
        if (!DemoPreviewBody.safeParse(request.body).success) return invalidRequest();
        const preview = await controller.preview({
          accountId: 'acct-synth-individual',
          filename: 'synthetic-activity-v1.csv',
          mediaType: 'text/csv',
          bytes: syntheticCsv,
        });
        return envelope(request, toPublicImportPreview(preview));
      }
      const parsed = ConnectedPreviewBody.safeParse(request.body);
      if (!parsed.success) return invalidRequest();
      const preview = await controller.preview({
        accountId: parsed.data.accountId,
        filename: parsed.data.filename,
        mediaType: parsed.data.mediaType,
        bytes: parseBase64(parsed.data.contentBase64),
      });
      return envelope(request, toPublicImportPreview(preview));
    } catch (error) {
      return mapImportError(error);
    }
  });

  app.post('/v1/imports/confirm', async (request) => {
    await authorize(request);
    if (!controller) throw new ReadModelSourceError('source_unavailable', 503);
    const parsed = ConfirmBody.safeParse(request.body);
    if (!parsed.success) return invalidRequest();
    return envelope(request, await controller.confirm(parsed.data));
  });
}
