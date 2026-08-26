import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('runbook requires manifest approval and both real-data baselines', async () => {
  const runbook = await readFile(
    new URL(
      '../docs/runbooks/phase-1f-b6-real-data-baselines.md',
      import.meta.url,
    ),
    'utf8',
  );

  for (const phrase of [
    'OWNER_PILOT',
    'manifest SHA-256',
    '/Users/admin/TueNhi-Backups',
    'Baseline 1',
    'Baseline 2',
    'không deploy Production',
  ]) {
    assert.match(runbook, new RegExp(phrase));
  }
});
