import { parsePublishableKey } from '@clerk/shared/keys';

export type ClerkPublicConfig = Readonly<{
  publishableKey: string;
  frontendApiOrigin: string;
  redirectOrigin: string;
}>;

function exactWebOrigin(value: string | undefined, nodeEnvironment: string | undefined): string {
  if (!value) throw new Error('Connected mode requires WEB_ORIGIN.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Connected mode requires a valid WEB_ORIGIN.');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  const allowsDevelopmentLoopback = nodeEnvironment !== 'production' && url.protocol === 'http:' && loopback;
  if ((!allowsDevelopmentLoopback && url.protocol !== 'https:') || url.username || url.password || url.origin !== value) {
    throw new Error('Connected mode requires a valid WEB_ORIGIN.');
  }
  return url.origin;
}

export function isValidClerkPublishableKey(value: string | undefined): value is string {
  return parsePublishableKey(value) !== null;
}

function frontendApiOrigin(publishableKey: string): string {
  const parsed = parsePublishableKey(publishableKey);
  if (!parsed) throw new Error('Connected mode requires a valid Clerk publishable key.');
  const origin = new URL(`https://${parsed.frontendApi}`);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.origin !== `https://${parsed.frontendApi}`) {
    throw new Error('Connected mode requires a valid Clerk publishable key.');
  }
  return origin.origin;
}

export function readClerkPublicConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ClerkPublicConfig {
  if (!isValidClerkPublishableKey(environment.CLERK_PUBLISHABLE_KEY)) {
    throw new Error('Connected mode requires a valid Clerk publishable key.');
  }
  const derivedFrontendApiOrigin = frontendApiOrigin(environment.CLERK_PUBLISHABLE_KEY);
  if (
    environment.CLERK_FRONTEND_API_URL !== undefined &&
    environment.CLERK_FRONTEND_API_URL !== derivedFrontendApiOrigin
  ) {
    throw new Error('CLERK_FRONTEND_API_URL must exactly match the FAPI origin derived from CLERK_PUBLISHABLE_KEY.');
  }
  return {
    publishableKey: environment.CLERK_PUBLISHABLE_KEY,
    frontendApiOrigin: derivedFrontendApiOrigin,
    redirectOrigin: exactWebOrigin(environment.WEB_ORIGIN, environment.NODE_ENV),
  };
}
