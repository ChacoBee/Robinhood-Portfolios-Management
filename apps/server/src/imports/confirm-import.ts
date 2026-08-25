import {
  IMPORT_LIMITS,
  type ImportConfirmation,
  type ImportResult,
  type ImportStateStore,
} from './contracts';

export async function confirmImport(
  confirmation: ImportConfirmation,
  dependencies: { stateStore: ImportStateStore },
): Promise<ImportResult> {
  const preview = await dependencies.stateStore.loadPreview(confirmation.previewId);
  if (!preview || preview.userId !== confirmation.userId) {
    throw new Error('import_preview_not_found');
  }
  if (confirmation.selectedCandidateIds.length > IMPORT_LIMITS.maxRows) {
    throw new Error('too_many_candidate_selections');
  }
  if (
    confirmation.selectedCandidateIds.some(
      (candidateId) => typeof candidateId !== 'string' || candidateId.length === 0,
    )
  ) {
    throw new Error('invalid_candidate_selection');
  }
  const selected = new Set(confirmation.selectedCandidateIds);
  if (selected.size !== confirmation.selectedCandidateIds.length) {
    throw new Error('duplicate_candidate_selection');
  }
  const selectable = preview.rows
    .filter((row) => row.decision === 'accepted' && row.candidate !== null)
    .map((row) => row.candidate!);
  if (
    new Set(selectable.map((candidate) => candidate.id)).size !== selectable.length ||
    selectable.some(
      (candidate) =>
        candidate.accountId !== preview.accountId || candidate.source.trim().length === 0,
    )
  ) {
    throw new Error('preview_integrity_error');
  }
  const candidates = selectable.filter((candidate) => selected.has(candidate.id));
  if (candidates.length !== selected.size) throw new Error('invalid_candidate_selection');

  const state = await dependencies.stateStore.confirm({
    previewId: preview.id,
    userId: confirmation.userId,
    candidates,
  });
  if (state === 'import_preview_not_found') throw new Error('import_preview_not_found');
  if (state === 'confirmation_conflict') throw new Error('confirmation_conflict');
  if (state === 'invalid_candidate_selection') throw new Error('invalid_candidate_selection');
  if (state === 'preview_integrity_error') throw new Error('preview_integrity_error');
  return {
    previewId: preview.id,
    importedRows: state === 'confirmed' ? candidates.length : 0,
    skippedRows: preview.rows.length - candidates.length,
    state,
  };
}

export async function deleteImportEvidence(
  previewId: string,
  userId: string,
  dependencies: {
    stateStore: ImportStateStore;
    evidenceStore: import('./contracts').EvidenceStore;
  },
): Promise<void> {
  const preview = await dependencies.stateStore.loadPreview(previewId);
  if (!preview || preview.userId !== userId) throw new Error('import_preview_not_found');
  await dependencies.stateStore.markEvidenceDeletionPending(preview.id);
  await dependencies.evidenceStore.delete(preview.evidenceKey);
  await dependencies.stateStore.markNonReproducible(preview.id);
  await dependencies.evidenceStore.markNonReproducible(preview.id);
}
