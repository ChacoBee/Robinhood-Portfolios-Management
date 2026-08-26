export type ClerkPublicConfig = Readonly<{
  publishableKey: string;
  frontendApiOrigin: string;
  redirectOrigin: string;
}>;

function exactHttpsOrigin(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Connected mode requires ${name}.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Connected mode requires a valid ${name}.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== value) {
    throw new Error(`Connected mode requires a valid ${name}.`);
  }
  return url.origin;
}

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
  return typeof value === 'string' && /^pk_(?:test|live)_[A-Za-z0-9_-]{10,}$/.test(value);
}

export function readClerkPublicConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ClerkPublicConfig {
  if (!isValidClerkPublishableKey(environment.CLERK_PUBLISHABLE_KEY)) {
    throw new Error('Connected mode requires a valid Clerk publishable key.');
  }
  return {
    publishableKey: environment.CLERK_PUBLISHABLE_KEY,
    frontendApiOrigin: exactHttpsOrigin(environment.CLERK_FRONTEND_API_URL, 'CLERK_FRONTEND_API_URL'),
    redirectOrigin: exactWebOrigin(environment.WEB_ORIGIN, environment.NODE_ENV),
  };
}
