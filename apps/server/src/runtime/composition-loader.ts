import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadTrustedComposition<T extends object>(
  modulePath: string | undefined,
  factoryName: string,
): Promise<T | null> {
  if (!modulePath) return null;
  if (!isAbsolute(modulePath)) {
    throw new Error('trusted_composition_path_must_be_absolute');
  }
  const loaded = (await import(pathToFileURL(modulePath).href)) as Record<
    string,
    unknown
  >;
  const factory = loaded[factoryName];
  if (typeof factory !== 'function') {
    throw new Error('trusted_composition_factory_missing');
  }
  const composition = await factory();
  if (!composition || typeof composition !== 'object') {
    throw new Error('trusted_composition_invalid');
  }
  return composition as T;
}
