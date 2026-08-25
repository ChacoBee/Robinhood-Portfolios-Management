import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadTrustedComposition } from '../../src/runtime/composition-loader';

const fixture = fileURLToPath(
  new URL('../fixtures/trusted-composition.mjs', import.meta.url),
);

describe('trusted runtime composition loader', () => {
  it('loads only an explicit factory from an absolute private module path', async () => {
    await expect(
      loadTrustedComposition(fixture, 'createApiComposition'),
    ).resolves.toEqual({ marker: 'synthetic-api-composition' });
  });

  it('returns null when no private module is configured', async () => {
    await expect(
      loadTrustedComposition(undefined, 'createApiComposition'),
    ).resolves.toBeNull();
  });

  it('rejects relative paths and missing factories', async () => {
    await expect(
      loadTrustedComposition('./composition.mjs', 'createApiComposition'),
    ).rejects.toThrow('trusted_composition_path_must_be_absolute');
    await expect(
      loadTrustedComposition(fixture, 'missingFactory'),
    ).rejects.toThrow('trusted_composition_factory_missing');
  });
});
