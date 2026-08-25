import type { ImportCandidate, ImportPreview, ImportStateStore } from './contracts';

function confirmationIdentity(userId: string, candidate: ImportCandidate): string {
  return JSON.stringify(
    candidate.sourceTransactionId === null
      ? [userId, candidate.source, candidate.accountId, 'fingerprint', candidate.sourceFingerprint]
      : [userId, candidate.source, candidate.accountId, 'stable_id', candidate.sourceTransactionId],
  );
}

export class MemoryImportStateStore implements ImportStateStore {
  readonly previews = new Map<string, ImportPreview>();
  readonly confirmedCandidates = new Map<string, readonly ImportCandidate[]>();
  readonly confirmedIdentities = new Map<string, string>();

  async findByFileHash(userId: string, fileSha256: string): Promise<ImportPreview | null> {
    return (
      [...this.previews.values()].find(
        (preview) => preview.userId === userId && preview.fileSha256 === fileSha256,
      ) ?? null
    );
  }

  async savePreview(
    preview: ImportPreview,
  ): Promise<{ preview: ImportPreview; created: boolean }> {
    const prior = [...this.previews.values()].find(
      (item) =>
        item.userId === preview.userId &&
        item.fileSha256 === preview.fileSha256,
    );
    if (prior) return { preview: prior, created: false };
    if (this.previews.has(preview.id)) throw new Error('import_preview_id_conflict');
    this.previews.set(preview.id, preview);
    return { preview, created: true };
  }

  async loadPreview(previewId: string): Promise<ImportPreview | null> {
    return this.previews.get(previewId) ?? null;
  }

  async confirm(input: {
    previewId: string;
    userId: string;
    candidates: readonly ImportCandidate[];
  }): Promise<
    | 'confirmed'
    | 'already_confirmed'
    | 'confirmation_conflict'
    | 'import_preview_not_found'
    | 'invalid_candidate_selection'
    | 'preview_integrity_error'
  > {
    const preview = this.previews.get(input.previewId);
    if (!preview || preview.userId !== input.userId) return 'import_preview_not_found';

    const selectable = new Map<string, ImportCandidate>();
    for (const row of preview.rows) {
      if (row.decision !== 'accepted' || row.candidate === null) continue;
      if (
        selectable.has(row.candidate.id) ||
        row.candidate.accountId !== preview.accountId ||
        row.candidate.source.trim().length === 0
      ) {
        return 'preview_integrity_error';
      }
      selectable.set(row.candidate.id, row.candidate);
    }
    const candidateIds = input.candidates.map((candidate) => candidate.id);
    if (
      new Set(candidateIds).size !== candidateIds.length ||
      candidateIds.some((candidateId) => !selectable.has(candidateId))
    ) {
      return 'invalid_candidate_selection';
    }

    const previous = this.confirmedCandidates.get(input.previewId);
    if (previous) {
      const previousIds = previous.map((candidate) => candidate.id).sort();
      const replayIds = [...candidateIds].sort();
      return previousIds.length === replayIds.length &&
        previousIds.every((candidateId, index) => candidateId === replayIds[index])
        ? 'already_confirmed'
        : 'confirmation_conflict';
    }

    const canonicalCandidates = candidateIds.map((candidateId) => selectable.get(candidateId)!);
    const identities = canonicalCandidates.map((candidate) =>
      confirmationIdentity(input.userId, candidate),
    );
    if (new Set(identities).size !== identities.length) return 'preview_integrity_error';
    if (identities.some((identity) => this.confirmedIdentities.has(identity))) {
      return 'confirmation_conflict';
    }

    this.confirmedCandidates.set(input.previewId, canonicalCandidates);
    identities.forEach((identity) => this.confirmedIdentities.set(identity, input.previewId));
    if (preview.state !== 'non_reproducible' && preview.state !== 'deletion_pending') {
      this.previews.set(input.previewId, { ...preview, state: 'confirmed' });
    }
    return 'confirmed';
  }

  async markEvidenceDeletionPending(previewId: string): Promise<void> {
    const preview = this.previews.get(previewId);
    if (preview && preview.state !== 'non_reproducible') {
      this.previews.set(previewId, { ...preview, state: 'deletion_pending' });
    }
  }

  async markNonReproducible(previewId: string): Promise<void> {
    const preview = this.previews.get(previewId);
    if (preview) this.previews.set(previewId, { ...preview, state: 'non_reproducible' });
  }
}
