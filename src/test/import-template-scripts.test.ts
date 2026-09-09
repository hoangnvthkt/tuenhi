import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const generateScript = resolve(
  process.cwd(),
  'scripts/generate-import-templates.mjs',
);
const verifyScript = resolve(
  process.cwd(),
  'scripts/verify-import-templates.mjs',
);
const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(
    resolve(tmpdir(), 'tuenhi-import-templates-test-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function runScript(script: string, cwd: string) {
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('official import template scripts', () => {
  it('generates and verifies every supported workbook from a clean directory', async () => {
    const directory = await temporaryDirectory();

    const generated = runScript(generateScript, directory);
    expect(generated.stderr).toBe('');
    expect(generated.status).toBe(0);

    const templateDirectory = resolve(directory, 'public/templates/import');
    expect((await readdir(templateDirectory)).sort()).toEqual([
      'categories-v1.xlsx',
      'customers-v1.xlsx',
      'customers-v2.xlsx',
      'opening-balances-v1.xlsx',
      'products-v1.xlsx',
      'purchase-receipt-v1.xlsx',
      'suppliers-v1.xlsx',
    ]);

    const verified = runScript(verifyScript, directory);
    expect(verified.stderr).toBe('');
    expect(verified.status).toBe(0);
  });
});
