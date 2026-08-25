import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  type EvidenceStore,
  type ImportPreview,
  MemoryEvidenceStore,
  MemoryImportStateStore,
  confirmImport,
  deleteImportEvidence,
  previewImport,
} from '../../src/imports';

const fixture = (name: string) =>
  readFile(
    fileURLToPath(new URL(`../../../../tests/fixtures/imports/${name}`, import.meta.url)),
  );

describe('import preview and confirmation', () => {
  it('previews five valid rows, stores encrypted evidence, and confirms atomically', async () => {
    const evidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 7));
    const stateStore = new MemoryImportStateStore();
    const bytes = await fixture('activity-valid.csv');
    const dependencies = {
      evidenceStore,
      stateStore,
      listExisting: async () => [],
      createId: () => 'preview-synthetic',
      now: () => new Date('2026-08-25T12:00:00.000Z'),
    };

    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-valid.csv',
        mediaType: 'text/csv',
        bytes,
      },
      dependencies,
    );

    expect(preview).toMatchObject({
      acceptedRows: 5,
      duplicateRows: 0,
      ambiguousRows: 0,
      rejectedRows: 0,
      state: 'preview_ready',
    });
    const stored = evidenceStore.objects.get(preview.evidenceKey);
    expect(stored?.ciphertext).not.toContain('Synthetic funding');

    const result = await confirmImport(
      {
        previewId: preview.id,
        userId: preview.userId,
        selectedCandidateIds: preview.rows.flatMap((row) =>
          row.candidate ? [row.candidate.id] : [],
        ),
      },
      { stateStore },
    );
    expect(result).toMatchObject({ importedRows: 5, state: 'confirmed' });
    expect((await confirmImport(
      {
        previewId: preview.id,
        userId: preview.userId,
        selectedCandidateIds: preview.rows.flatMap((row) =>
          row.candidate ? [row.candidate.id] : [],
        ),
      },
      { stateStore },
    )).state).toBe('already_confirmed');
  });

  it('returns the same preview for a duplicate file and supports evidence deletion', async () => {
    const evidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 9));
    const stateStore = new MemoryImportStateStore();
    const bytes = await fixture('activity-valid.csv');
    const input = {
      userId: 'user-synthetic',
      accountId: 'account-synthetic',
      filename: 'activity-valid.csv',
      mediaType: 'text/csv' as const,
      bytes,
    };
    const dependencies = {
      evidenceStore,
      stateStore,
      listExisting: async () => [],
      createId: () => 'preview-idempotent',
    };
    const first = await previewImport(input, dependencies);
    const second = await previewImport(input, dependencies);
    expect(second.id).toBe(first.id);
    expect(evidenceStore.objects).toHaveLength(1);

    await deleteImportEvidence(first.id, first.userId, { evidenceStore, stateStore });
    expect(evidenceStore.objects).toHaveLength(0);
    expect((await stateStore.loadPreview(first.id))?.state).toBe('non_reproducible');
    expect(evidenceStore.nonReproducible.has(first.id)).toBe(true);
  });

  it('preserves a partial preview when individual rows are malformed', async () => {
    const bytes = await fixture('activity-malformed.csv');
    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-malformed.csv',
        mediaType: 'text/csv',
        bytes,
      },
      {
        evidenceStore: new MemoryEvidenceStore(),
        stateStore: new MemoryImportStateStore(),
        listExisting: async () => [],
      },
    );
    expect(preview.rejectedRows).toBe(2);
    expect(preview.rows.every((row) => row.messages.length > 0)).toBe(true);
  });

  it('rejects reassigning identical file bytes to a different account', async () => {
    const evidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 3));
    const stateStore = new MemoryImportStateStore();
    const bytes = await fixture('activity-valid.csv');
    let nextId = 0;
    const dependencies = {
      evidenceStore,
      stateStore,
      listExisting: async () => [],
      createId: () => `preview-account-${nextId += 1}`,
    };

    const first = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-a',
        filename: 'activity-valid.csv',
        mediaType: 'text/csv',
        bytes,
      },
      dependencies,
    );
    await expect(
      previewImport(
        {
          userId: 'user-synthetic',
          accountId: 'account-b',
          filename: 'activity-valid.csv',
          mediaType: 'text/csv',
          bytes,
        },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: 'file_account_mismatch' });
    expect((await stateStore.loadPreview(first.id))?.accountId).toBe('account-a');
    expect(stateStore.previews).toHaveLength(1);
    expect(evidenceStore.objects).toHaveLength(1);
  });

  it('coalesces concurrent same-file previews without orphaning duplicate evidence', async () => {
    const evidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 4));
    const stateStore = new MemoryImportStateStore();
    const bytes = await fixture('activity-valid.csv');
    let nextId = 0;
    const input = {
      userId: 'user-synthetic',
      accountId: 'account-synthetic',
      filename: 'activity-valid.csv',
      mediaType: 'text/csv' as const,
      bytes,
    };
    const dependencies = {
      evidenceStore,
      stateStore,
      listExisting: async () => [],
      createId: () => `preview-concurrent-${nextId += 1}`,
    };

    const [first, second] = await Promise.all([
      previewImport(input, dependencies),
      previewImport(input, dependencies),
    ]);

    expect(second.id).toBe(first.id);
    expect(stateStore.previews).toHaveLength(1);
    expect(evidenceStore.objects).toHaveLength(1);
  });

  it('fails closed if the state store returns a preview from another owner', async () => {
    const stateStore = new (class extends MemoryImportStateStore {
      foreignPreview: ImportPreview | null = null;

      override async findByFileHash(
        userId: string,
        fileSha256: string,
      ): Promise<ImportPreview | null> {
        return this.foreignPreview ?? super.findByFileHash(userId, fileSha256);
      }
    })();
    const bytes = await fixture('activity-valid.csv');
    const foreign = await previewImport(
      {
        userId: 'user-other',
        accountId: 'account-synthetic',
        filename: 'activity-valid.csv',
        mediaType: 'text/csv',
        bytes,
      },
      {
        evidenceStore: new MemoryEvidenceStore(),
        stateStore,
        listExisting: async () => [],
      },
    );
    stateStore.foreignPreview = foreign;

    await expect(
      previewImport(
        {
          userId: 'user-synthetic',
          accountId: 'account-synthetic',
          filename: 'activity-valid.csv',
          mediaType: 'text/csv',
          bytes,
        },
        {
          evidenceStore: new MemoryEvidenceStore(),
          stateStore,
          listExisting: async () => [],
        },
      ),
    ).rejects.toThrow('preview_store_integrity_error');
  });

  it('deduplicates repeated source IDs inside one CSV batch', async () => {
    const bytes = new TextEncoder().encode(
      [
        'date,type,amount,description,transaction_id',
        '2026-08-01,deposit,10.00,Synthetic funding,syn-repeat-001',
        '2026-08-01,deposit,10.00,Synthetic funding,syn-repeat-001',
      ].join('\n'),
    );
    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-repeated.csv',
        mediaType: 'text/csv',
        bytes,
      },
      {
        evidenceStore: new MemoryEvidenceStore(),
        stateStore: new MemoryImportStateStore(),
        listExisting: async () => [],
      },
    );

    expect(preview).toMatchObject({ acceptedRows: 1, duplicateRows: 1 });
  });

  it('keeps identical no-ID rows in review because their source lineage differs', async () => {
    const bytes = new TextEncoder().encode(
      [
        'date,type,amount,description',
        '2026-08-01,deposit,10.00,Synthetic repeated fact',
        '2026-08-01,deposit,10.00,Synthetic repeated fact',
      ].join('\n'),
    );
    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-no-id-repeated.csv',
        mediaType: 'text/csv',
        bytes,
      },
      {
        evidenceStore: new MemoryEvidenceStore(),
        stateStore: new MemoryImportStateStore(),
        listExisting: async () => [],
      },
    );

    expect(preview).toMatchObject({ acceptedRows: 1, ambiguousRows: 1, duplicateRows: 0 });
    expect(preview.rows.map((row) => row.decision)).toEqual(['accepted', 'review_required']);
  });

  it('deduplicates a stable source ID already imported by an earlier batch', async () => {
    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-duplicate.csv',
        mediaType: 'text/csv',
        bytes: await fixture('activity-duplicate.csv'),
      },
      {
        evidenceStore: new MemoryEvidenceStore(),
        stateStore: new MemoryImportStateStore(),
        listExisting: async () => [
          {
            source: 'robinhood',
            accountId: 'account-synthetic',
            kind: 'deposit',
            amount: { amount: '999', currency: 'USD' },
            effectiveAt: '2026-07-01T12:00:00.000Z',
            description: 'Earlier normalized values',
            sourceTransactionId: 'syn-tx-001',
            sourceFingerprint: 'earlier-batch-fingerprint',
          },
        ],
      },
    );

    expect(preview).toMatchObject({ acceptedRows: 0, duplicateRows: 1 });
  });

  it('keeps an absent-ID near match in review instead of auto-merging it', async () => {
    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-ambiguous.csv',
        mediaType: 'text/csv',
        bytes: await fixture('activity-ambiguous.csv'),
      },
      {
        evidenceStore: new MemoryEvidenceStore(),
        stateStore: new MemoryImportStateStore(),
        listExisting: async () => [
          {
            source: 'robinhood',
            accountId: 'account-synthetic',
            kind: 'deposit',
            amount: { amount: '1000', currency: 'USD' },
            effectiveAt: '2026-08-02T11:59:59.000Z',
            description: ' synthetic   FUNDING ',
            sourceTransactionId: null,
            sourceFingerprint: 'earlier-no-id-fingerprint',
          },
        ],
      },
    );

    expect(preview).toMatchObject({ acceptedRows: 0, ambiguousRows: 1 });
    expect(preview.rows[0]?.decision).toBe('review_required');
  });

  it('does not retain evidence when CSV validation fails before a preview exists', async () => {
    const evidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 5));
    const stateStore = new MemoryImportStateStore();
    const bytes = await fixture('activity-formula-injection.csv');

    await expect(
      previewImport(
        {
          userId: 'user-synthetic',
          accountId: 'account-synthetic',
          filename: 'activity-formula-injection.csv',
          mediaType: 'text/csv',
          bytes,
        },
        { evidenceStore, stateStore, listExisting: async () => [] },
      ),
    ).rejects.toMatchObject({ code: 'unsafe_formula' });
    expect(evidenceStore.objects).toHaveLength(0);
    expect(stateStore.previews).toHaveLength(0);
  });

  it('deletes newly written evidence if saving the preview fails', async () => {
    const evidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 6));
    const stateStore = new (class extends MemoryImportStateStore {
      override async savePreview(_preview: ImportPreview): Promise<never> {
        throw new Error('synthetic state failure');
      }
    })();
    const bytes = await fixture('activity-valid.csv');

    await expect(
      previewImport(
        {
          userId: 'user-synthetic',
          accountId: 'account-synthetic',
          filename: 'activity-valid.csv',
          mediaType: 'text/csv',
          bytes,
        },
        { evidenceStore, stateStore, listExisting: async () => [] },
      ),
    ).rejects.toThrow('synthetic state failure');
    expect(evidenceStore.objects).toHaveLength(0);
  });

  it('deletes newly written evidence when a created preview result fails integrity checks', async () => {
    const evidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 11));
    const stateStore = new (class extends MemoryImportStateStore {
      override async savePreview(preview: ImportPreview) {
        return { preview: { ...preview, id: 'corrupted-preview-id' }, created: true };
      }
    })();

    await expect(
      previewImport(
        {
          userId: 'user-synthetic',
          accountId: 'account-synthetic',
          filename: 'activity-valid.csv',
          mediaType: 'text/csv',
          bytes: await fixture('activity-valid.csv'),
        },
        { evidenceStore, stateStore, listExisting: async () => [] },
      ),
    ).rejects.toThrow('preview_store_integrity_error');
    expect(evidenceStore.objects).toHaveLength(0);
  });

  it('atomically blocks confirming the same stable source ID from two previews', async () => {
    const stateStore = new MemoryImportStateStore();
    const first = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'first.csv',
        mediaType: 'text/csv',
        bytes: new TextEncoder().encode(
          'date,type,amount,description,transaction_id\n2026-08-01,deposit,10.00,First,same-id',
        ),
      },
      {
        evidenceStore: new MemoryEvidenceStore(),
        stateStore,
        listExisting: async () => [],
      },
    );
    const second = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'second.csv',
        mediaType: 'text/csv',
        bytes: new TextEncoder().encode(
          'date,type,amount,description,transaction_id\n2026-08-02,deposit,20.00,Second,same-id',
        ),
      },
      {
        evidenceStore: new MemoryEvidenceStore(),
        stateStore,
        listExisting: async () => [],
      },
    );
    const selection = (preview: ImportPreview) =>
      preview.rows.flatMap((row) => (row.candidate ? [row.candidate.id] : []));

    await expect(
      Promise.all([
        confirmImport(
          {
            previewId: first.id,
            userId: first.userId,
            selectedCandidateIds: selection(first),
          },
          { stateStore },
        ),
        confirmImport(
          {
            previewId: second.id,
            userId: second.userId,
            selectedCandidateIds: selection(second),
          },
          { stateStore },
        ),
      ]),
    ).rejects.toThrow('confirmation_conflict');
    expect(stateStore.confirmedCandidates).toHaveLength(1);
  });

  it('rejects a conflicting confirmation replay but accepts an order-only replay', async () => {
    const stateStore = new MemoryImportStateStore();
    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-valid.csv',
        mediaType: 'text/csv',
        bytes: await fixture('activity-valid.csv'),
      },
      {
        evidenceStore: new MemoryEvidenceStore(),
        stateStore,
        listExisting: async () => [],
        createId: () => 'preview-confirmation-replay',
      },
    );
    const candidateIds = preview.rows.flatMap((row) => (row.candidate ? [row.candidate.id] : []));
    const selected = candidateIds.slice(0, 2);

    await confirmImport(
      { previewId: preview.id, userId: preview.userId, selectedCandidateIds: selected },
      { stateStore },
    );
    await expect(
      confirmImport(
        {
          previewId: preview.id,
          userId: preview.userId,
          selectedCandidateIds: [...selected].reverse(),
        },
        { stateStore },
      ),
    ).resolves.toMatchObject({ state: 'already_confirmed' });
    await expect(
      confirmImport(
        {
          previewId: preview.id,
          userId: preview.userId,
          selectedCandidateIds: candidateIds.slice(0, 3),
        },
        { stateStore },
      ),
    ).rejects.toThrow('confirmation_conflict');
  });

  it('rechecks preview ownership atomically when confirmation state changes', async () => {
    const stateStore = new (class extends MemoryImportStateStore {
      override async loadPreview(previewId: string): Promise<ImportPreview | null> {
        const preview = await super.loadPreview(previewId);
        if (preview) {
          this.previews.set(previewId, { ...preview, userId: 'user-other' });
        }
        return preview;
      }
    })();
    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-valid.csv',
        mediaType: 'text/csv',
        bytes: await fixture('activity-valid.csv'),
      },
      {
        evidenceStore: new MemoryEvidenceStore(),
        stateStore,
        listExisting: async () => [],
      },
    );

    await expect(
      confirmImport(
        {
          previewId: preview.id,
          userId: preview.userId,
          selectedCandidateIds: preview.rows.flatMap((row) =>
            row.candidate ? [row.candidate.id] : [],
          ),
        },
        { stateStore },
      ),
    ).rejects.toThrow('import_preview_not_found');
    expect(stateStore.confirmedCandidates).toHaveLength(0);
  });

  it('leaves a batch deletion-pending when physical evidence deletion fails', async () => {
    const innerEvidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 8));
    const evidenceStore: EvidenceStore = {
      putEncrypted: (input) => innerEvidenceStore.putEncrypted(input),
      delete: async () => {
        throw new Error('synthetic deletion failure');
      },
      markNonReproducible: (previewId) => innerEvidenceStore.markNonReproducible(previewId),
    };
    const stateStore = new MemoryImportStateStore();
    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-valid.csv',
        mediaType: 'text/csv',
        bytes: await fixture('activity-valid.csv'),
      },
      { evidenceStore, stateStore, listExisting: async () => [] },
    );

    await expect(
      deleteImportEvidence(preview.id, preview.userId, { evidenceStore, stateStore }),
    ).rejects.toThrow('synthetic deletion failure');
    expect((await stateStore.loadPreview(preview.id))?.state).toBe('deletion_pending');
  });

  it('retries pending evidence deletion before marking the batch non-reproducible', async () => {
    const innerEvidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 12));
    let attempts = 0;
    const evidenceStore: EvidenceStore = {
      putEncrypted: (input) => innerEvidenceStore.putEncrypted(input),
      delete: async (key) => {
        attempts += 1;
        if (attempts === 1) throw new Error('synthetic transient deletion failure');
        await innerEvidenceStore.delete(key);
      },
      markNonReproducible: (previewId) => innerEvidenceStore.markNonReproducible(previewId),
    };
    const stateStore = new MemoryImportStateStore();
    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-valid.csv',
        mediaType: 'text/csv',
        bytes: await fixture('activity-valid.csv'),
      },
      { evidenceStore, stateStore, listExisting: async () => [] },
    );

    await expect(
      deleteImportEvidence(preview.id, preview.userId, { evidenceStore, stateStore }),
    ).rejects.toThrow('synthetic transient deletion failure');
    expect((await stateStore.loadPreview(preview.id))?.state).toBe('deletion_pending');
    await deleteImportEvidence(preview.id, preview.userId, { evidenceStore, stateStore });
    expect((await stateStore.loadPreview(preview.id))?.state).toBe('non_reproducible');
    expect(innerEvidenceStore.objects).toHaveLength(0);
  });

  it('preserves non-reproducible status when evidence is deleted before confirmation', async () => {
    const evidenceStore = new MemoryEvidenceStore(Buffer.alloc(32, 10));
    const stateStore = new MemoryImportStateStore();
    const preview = await previewImport(
      {
        userId: 'user-synthetic',
        accountId: 'account-synthetic',
        filename: 'activity-valid.csv',
        mediaType: 'text/csv',
        bytes: await fixture('activity-valid.csv'),
      },
      { evidenceStore, stateStore, listExisting: async () => [] },
    );
    await deleteImportEvidence(preview.id, preview.userId, { evidenceStore, stateStore });

    await confirmImport(
      {
        previewId: preview.id,
        userId: preview.userId,
        selectedCandidateIds: preview.rows.flatMap((row) =>
          row.candidate ? [row.candidate.id] : [],
        ),
      },
      { stateStore },
    );

    expect((await stateStore.loadPreview(preview.id))?.state).toBe('non_reproducible');
  });
});
