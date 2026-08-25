import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerImportRoutes } from '../../src/routes/imports';

describe('import routes', () => {
  it('accepts only the explicit local synthetic fixture in Demo mode', async () => {
    const app = Fastify();
    registerImportRoutes(app, { mode: 'demo' });

    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/imports/preview',
      payload: {
        accountId: 'anything',
        filename: 'private.csv',
        mediaType: 'text/csv',
        contentBase64: Buffer.from('private bytes').toString('base64'),
      },
    });
    expect(rejected.statusCode).toBe(400);

    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/imports/preview',
      payload: { fixture: 'synthetic-activity-v1' },
    });
    expect(accepted.statusCode).toBe(200);
    const preview = accepted.json().data;
    expect(preview).toMatchObject({ acceptedRows: 2, state: 'preview_ready' });
    expect(JSON.stringify(preview)).not.toContain('evidenceKey');
    expect(JSON.stringify(preview)).not.toContain('sourceFingerprint');
    expect(JSON.stringify(preview)).not.toContain('rawChecksum');

    const confirmed = await app.inject({
      method: 'POST',
      url: '/v1/imports/confirm',
      payload: {
        previewId: preview.id,
        selectedCandidateIds: preview.rows.map(
          (row: { candidate: { id: string } | null }) => row.candidate?.id,
        ).filter(Boolean),
      },
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json().data).toMatchObject({ importedRows: 2, state: 'confirmed' });
    await app.close();
  });

  it('fails closed in connected mode without a durable controller', async () => {
    const app = Fastify();
    registerImportRoutes(app, { mode: 'connected' });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/imports/preview',
      payload: {
        accountId: '00000000-0000-4000-8000-000000000001',
        filename: 'activity.csv',
        mediaType: 'text/csv',
        contentBase64: Buffer.from('date,type,amount,description\n').toString('base64'),
      },
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });
});
