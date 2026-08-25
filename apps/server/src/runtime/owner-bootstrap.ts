import { createHash } from 'node:crypto';
import type { PortfolioRepository } from '../db/repositories';

export function ownerRecordId(clerkUserId: string): string {
  const bytes = createHash('sha256')
    .update(`aurum-owner\0${clerkUserId}`, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function bootstrapConfiguredOwner(
  portfolios: Pick<PortfolioRepository, 'createOwner'>,
  input: { clerkUserId: string; email: string },
): Promise<string> {
  const id = ownerRecordId(input.clerkUserId);
  await portfolios.createOwner({
    id,
    email: input.email,
    clerkUserId: input.clerkUserId,
  });
  return id;
}
