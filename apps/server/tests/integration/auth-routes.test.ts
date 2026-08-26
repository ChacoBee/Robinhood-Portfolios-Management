import { describe, expect, it, vi } from 'vitest';
import type { AppEnvironment } from '../../src/config';
import { createApi } from '../../src/app';
import {
  type AuthenticatedPrincipal,
  type TrustedOwnerVerifier,
} from '../../src/auth';
import { createCsrfToken } from '../../src/security';
import type { PortfolioReadModelSource } from '../../src/read-models/source';
import { createDemoReadModelSource } from '../../src/read-models/demo-source';
import type { OwnerDeletionService } from '../../src/routes/delete';
import type { OwnerDataExportService } from '../../src/routes/export';
import type { TrustedRecoveryComposition } from '../../src/routes/auth';

const csrfSecret = 'synthetic-csrf-secret-is-at-least-32-chars';
const now = () => new Date('2026-08-25T15:00:00.000Z');

const connectedConfig = {
  APP_MODE: 'connected',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost/aurum',
  OWNER_CLERK_USER_ID: 'user_owner123',
  OWNER_EMAIL: 'owner@example.test',
  WEB_ORIGIN: 'https://portfolio.example.test',
  CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic_public_identity_12345',
  CLERK_ISSUER_URL: 'https://synthetic.clerk.accounts.dev',
  CLERK_SECRET_KEY: 'sk_test_12345678901234567890',
  CSRF_SECRET: csrfSecret,
  ACCOUNT_REFERENCE_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'),
  ROBINHOOD_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString('base64'),
} as const satisfies AppEnvironment;

const ownerPrincipal: AuthenticatedPrincipal = {
  clerkUserId: 'user_owner123',
  email: 'Owner@Example.test',
  emailVerified: true,
  sessionId: 'session-owner',
  authorizedParty: 'https://portfolio.example.test',
  authentication: {
    method: 'passkey',
    verifiedAt: '2026-08-25T14:59:00.000Z',
  },
};

function verifierFor(
  principal: AuthenticatedPrincipal = ownerPrincipal,
): TrustedOwnerVerifier {
  return {
    verify: vi.fn(async () => principal),
  };
}

function connectedApp(
  options: {
    ownerVerifier?: TrustedOwnerVerifier;
    readModels?: PortfolioReadModelSource;
    recovery?: TrustedRecoveryComposition;
    dataExport?: OwnerDataExportService;
    deletion?: OwnerDeletionService;
  } = {},
) {
  return createApi(connectedConfig, {
    repositories: null,
    now,
    readModels: options.readModels ?? createDemoReadModelSource({ now }),
    ...(options.ownerVerifier ? { ownerVerifier: options.ownerVerifier } : {}),
    ...(options.recovery ? { recovery: options.recovery } : {}),
    ...(options.dataExport ? { dataExport: options.dataExport } : {}),
    ...(options.deletion ? { deletion: options.deletion } : {}),
  });
}

describe('connected owner authentication', () => {
  it('fails closed before reading portfolio data when no verifier is injected', async () => {
    const getDashboard = vi.fn();
    const source = {
      ...createDemoReadModelSource({ now }),
      getDashboard,
    };
    const app = connectedApp({ readModels: source });

    const response = await app.inject({ method: 'GET', url: '/v1/dashboard' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'authentication_unavailable' },
    });
    expect(getDashboard).not.toHaveBeenCalled();
    await app.close();
  });

  it('keeps readiness closed when the database is ready but auth is not composed', async () => {
    const app = createApi(connectedConfig, {
      repositories: null,
      readinessCheck: vi.fn(async () => true),
      now,
    });

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready' });
    await app.close();
  });

  it('keeps infrastructure readiness open when operational health is degraded', async () => {
    const readModels: PortfolioReadModelSource = {
      ...createDemoReadModelSource({ now }),
      getHealth: async () => ({
        status: 'degraded',
        mode: 'connected',
        database: 'ready',
        worker: 'stalled',
        provider: 'unavailable',
        lastSuccessfulRefreshAt: '2026-08-25T14:55:00.000Z',
      }),
    };
    const app = createApi(connectedConfig, {
      repositories: null,
      readinessCheck: vi.fn(async () => true),
      ownerVerifier: verifierFor(),
      readModels,
      now,
    });

    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready', mode: 'connected' });
    await app.close();
  });

  it('returns 401 when the trusted verifier cannot authenticate a session', async () => {
    const ownerVerifier: TrustedOwnerVerifier = {
      verify: vi.fn(async () => {
        throw new Error('private Clerk failure detail');
      }),
    };
    const app = connectedApp({ ownerVerifier });

    const response = await app.inject({ method: 'GET', url: '/v1/auth/session' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: 'authentication_required' },
    });
    expect(response.body).not.toContain('private Clerk failure detail');
    await app.close();
  });

  it.each([
    { principalPatch: { clerkUserId: 'user_other' }, caseName: 'wrong Clerk user ID' },
    { principalPatch: { email: 'other@example.test' }, caseName: 'wrong verified email' },
    {
      principalPatch: { authorizedParty: 'https://evil.example' },
      caseName: 'wrong authorized party',
    },
  ])('returns 403 for $caseName', async ({ principalPatch }) => {
    const app = connectedApp({
      ownerVerifier: verifierFor({ ...ownerPrincipal, ...principalPatch }),
    });

    const response = await app.inject({ method: 'GET', url: '/v1/auth/session' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: 'authorization_denied' },
    });
    await app.close();
  });

  it('rejects a supplied attacker Origin before the request reaches the verifier', async () => {
    const ownerVerifier = verifierFor();
    const app = connectedApp({ ownerVerifier });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { origin: 'https://evil.example' },
    });

    expect(response.statusCode).toBe(403);
    expect(ownerVerifier.verify).not.toHaveBeenCalled();
    await app.close();
  });

  it('ignores demo-bypass headers in connected production', async () => {
    const app = createApi(
      { ...connectedConfig, NODE_ENV: 'production' },
      { repositories: null, now },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/dashboard',
      headers: { 'x-aurum-demo-bypass': 'true' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'authentication_unavailable' },
    });
    await app.close();
  });

  it('does not initialize or call an injected verifier in public Demo mode', async () => {
    let verifierAccessed = false;
    const dependencies = {
      repositories: null,
      get ownerVerifier(): TrustedOwnerVerifier {
        verifierAccessed = true;
        throw new Error('Clerk must stay unloaded');
      },
    };
    const app = createApi(
      { APP_MODE: 'demo', NODE_ENV: 'production' },
      dependencies,
    );

    const response = await app.inject({ method: 'GET', url: '/v1/dashboard' });

    expect(response.statusCode).toBe(200);
    expect(verifierAccessed).toBe(false);
    await app.close();
  });
});

describe('connected request security', () => {
  it('requires a session-bound CSRF token for cookie-authenticated writes', async () => {
    const app = connectedApp({ ownerVerifier: verifierFor() });
    const validToken = createCsrfToken('session-owner', csrfSecret);

    const missing = await app.inject({
      method: 'POST',
      url: '/v1/refresh',
      headers: { cookie: '__session=synthetic' },
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/refresh',
      headers: {
        cookie: '__session=synthetic',
        'x-csrf-token': createCsrfToken('different-session', csrfSecret),
      },
    });
    const valid = await app.inject({
      method: 'POST',
      url: '/v1/refresh',
      headers: { cookie: '__session=synthetic', 'x-csrf-token': validToken },
    });

    expect(missing.statusCode).toBe(403);
    expect(invalid.statusCode).toBe(403);
    expect(valid.statusCode).toBe(200);
    await app.close();
  });

  it('authenticates before parsing writes and returns a stable 400 for malformed JSON', async () => {
    const ownerVerifier = verifierFor();
    const app = connectedApp({ ownerVerifier });

    const noAuthApp = connectedApp();
    const blocked = await noAuthApp.inject({
      method: 'POST',
      url: '/v1/delete',
      headers: { 'content-type': 'application/json' },
      payload: '{"confirmation":',
    });
    expect(blocked.statusCode).toBe(503);
    await noAuthApp.close();

    const malformed = await app.inject({
      method: 'POST',
      url: '/v1/delete',
      headers: {
        cookie: '__session=synthetic',
        'x-csrf-token': createCsrfToken('session-owner', csrfSecret),
        'content-type': 'application/json',
      },
      payload: '{"confirmation":',
    });

    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({
      error: { code: 'invalid_request' },
    });
    expect(malformed.body).not.toContain('Unexpected end');
    expect(ownerVerifier.verify).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns a safe invalid-request envelope for unsupported request media', async () => {
    const app = connectedApp({ ownerVerifier: verifierFor() });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/delete',
      headers: {
        'content-type': 'application/xml',
        cookie: '__session=synthetic',
        'x-csrf-token': createCsrfToken('session-owner', csrfSecret),
      },
      payload: '<delete />',
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({
      error: { code: 'invalid_request' },
    });
    expect(response.body).not.toContain('application/xml');
    await app.close();
  });

  it('returns the strict security headers and exact-origin CORS policy', async () => {
    const app = connectedApp({ ownerVerifier: verifierFor() });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/session',
      headers: { origin: 'https://portfolio.example.test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://portfolio.example.test',
    );
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['strict-transport-security']).toContain('max-age=');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('applies the lower sensitive-operation rate limit', async () => {
    const dataExport: OwnerDataExportService = {
      createExport: async () => ({
        exportId: 'export-synthetic',
        state: 'queued',
        expiresAt: null,
      }),
    };
    const ownerVerifier = verifierFor();
    const app = connectedApp({ ownerVerifier, dataExport });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/export',
        headers: { 'x-forwarded-for': `203.0.113.${attempt + 1}` },
      });
      expect(response.statusCode).toBe(202);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/v1/export',
      headers: { 'x-forwarded-for': '203.0.113.250' },
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: 'rate_limited' } });
    expect(ownerVerifier.verify).toHaveBeenCalledTimes(3);
    await app.close();
  });

  it('applies the dedicated manual-refresh limit before authentication', async () => {
    const ownerVerifier = verifierFor();
    const app = connectedApp({ ownerVerifier });

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await app.inject({ method: 'POST', url: '/v1/refresh' });
      expect(response.statusCode).toBe(200);
    }
    const limited = await app.inject({ method: 'POST', url: '/v1/refresh' });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: 'rate_limited' } });
    expect(ownerVerifier.verify).toHaveBeenCalledTimes(6);
    await app.close();
  });
});

describe('owner Settings and sensitive data controls', () => {
  it('rejects sensitive actions when recent passkey assurance is absent or expired', async () => {
    const dataExport: OwnerDataExportService = {
      createExport: vi.fn(async () => ({
        exportId: 'should-not-run',
        state: 'queued' as const,
        expiresAt: null,
      })),
    };
    const app = connectedApp({
      ownerVerifier: verifierFor({
        ...ownerPrincipal,
        authentication: {
          method: 'passkey',
          verifiedAt: '2026-08-25T14:50:00.000Z',
        },
      }),
      dataExport,
    });

    const response = await app.inject({ method: 'POST', url: '/v1/export' });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: 'recent_passkey_required' },
    });
    expect(dataExport.createExport).not.toHaveBeenCalled();
    await app.close();
  });

  it('shows fail-closed capabilities and safe previews when services are absent', async () => {
    const app = connectedApp({ ownerVerifier: verifierFor() });

    const settings = await app.inject({ method: 'GET', url: '/v1/settings' });
    const exportPreview = await app.inject({
      method: 'GET',
      url: '/v1/export/preview',
    });
    const deletionPreview = await app.inject({
      method: 'GET',
      url: '/v1/delete/preview',
    });

    expect(settings.json()).toMatchObject({
      data: {
        authentication: { state: 'verified_owner' },
        recovery: { state: 'disabled' },
        export: { state: 'disabled' },
        deletion: { state: 'disabled' },
      },
    });
    expect(exportPreview.json()).toMatchObject({ data: { state: 'disabled' } });
    expect(exportPreview.body).not.toMatch(/account(?:Number|_number)/i);
    expect(deletionPreview.json()).toMatchObject({
      data: {
        state: 'disabled',
        confirmationPhrase: 'DELETE ALL AURUM DATA',
        backups: { individuallyRewritten: false },
      },
    });
    await app.close();
  });

  it('keeps recovery disabled unless dual proof and restricted passkey reenrollment are injected', async () => {
    const app = connectedApp({ ownerVerifier: verifierFor() });
    const csrfToken = createCsrfToken('session-owner', csrfSecret);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery-codes/regenerate',
      headers: {
        cookie: '__session=synthetic',
        'x-csrf-token': csrfToken,
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'recovery_unavailable' },
    });
    await app.close();
  });

  it('enables regeneration only for a composition declaring both recovery assurances', async () => {
    const regenerateRecoveryCodes = vi.fn(async () => ({
      codes: ['SYN1-THET-IC00-CODE-0000-0001'],
    }));
    const recovery: TrustedRecoveryComposition = {
      assurance: {
        dualProof: 'recovery_code_and_verified_email',
        resultingCapability: 'passkey_reenrollment_only',
      },
      regenerateRecoveryCodes,
    };
    const app = connectedApp({ ownerVerifier: verifierFor(), recovery });

    const untrustedProof = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery-codes/regenerate',
      headers: {
        cookie: '__session=synthetic',
        'x-csrf-token': createCsrfToken('session-owner', csrfSecret),
        'content-type': 'application/json',
      },
      payload: { verifiedEmailProof: true },
    });
    expect(untrustedProof.statusCode).toBe(400);
    expect(regenerateRecoveryCodes).not.toHaveBeenCalled();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/recovery-codes/regenerate',
      headers: {
        cookie: '__session=synthetic',
        'x-csrf-token': createCsrfToken('session-owner', csrfSecret),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        state: 'generated',
        codes: ['SYN1-THET-IC00-CODE-0000-0001'],
      },
    });
    await app.close();
  });

  it('requires the exact deletion phrase before invoking an injected deletion service', async () => {
    const deleteOwnerData = vi.fn(async () => ({
      deletionId: 'deletion-123',
      state: 'scheduled' as const,
      backupExpiresAt: '2026-09-24T15:00:00.000Z',
    }));
    const deletion: OwnerDeletionService = { deleteOwnerData };
    const app = connectedApp({ ownerVerifier: verifierFor(), deletion });
    const csrfToken = createCsrfToken('session-owner', csrfSecret);
    const headers = {
      cookie: '__session=synthetic',
      'x-csrf-token': csrfToken,
      'content-type': 'application/json',
    };

    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/delete',
      headers,
      payload: { confirmation: 'delete all aurum data' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(deleteOwnerData).not.toHaveBeenCalled();

    const valid = await app.inject({
      method: 'POST',
      url: '/v1/delete',
      headers,
      payload: { confirmation: 'DELETE ALL AURUM DATA' },
    });
    expect(valid.statusCode).toBe(202);
    expect(valid.json()).toMatchObject({
      data: { deletionId: 'deletion-123', state: 'scheduled' },
    });
    expect(deleteOwnerData).toHaveBeenCalledWith({
      ownerId: 'user_owner123',
      ownerEmail: 'owner@example.test',
      requestId: expect.any(String),
    });
    await app.close();
  });

  it('does not start export without an injected export service', async () => {
    const app = connectedApp({ ownerVerifier: verifierFor() });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/export',
      headers: {
        cookie: '__session=synthetic',
        'x-csrf-token': createCsrfToken('session-owner', csrfSecret),
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'export_unavailable' },
    });
    await app.close();
  });
});
