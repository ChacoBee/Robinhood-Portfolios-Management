import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

async function sourceFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, {
      withFileTypes: true,
      encoding: 'utf8',
    });
    const nested = await Promise.all(
      entries.map((entry) => {
        const path = join(root, entry.name);
        return entry.isDirectory() ? sourceFiles(path) : Promise.resolve([path]);
      }),
    );
    return nested.flat().filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  } catch {
    return [];
  }
}

describe('provider implementation boundary', () => {
  it('keeps generic MCP, tool names, and account vaults out of routes and web', async () => {
    const roots = [
      join(process.cwd(), 'src', 'routes'),
      join(process.cwd(), '..', 'web'),
    ];
    const files = (await Promise.all(roots.map(sourceFiles))).flat();
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source, file).not.toMatch(
        /robinhood\/(?:transport|read-methods|vault)/,
      );
      expect(source, file).not.toContain('mcp__robinhood__');
    }
  });
});
