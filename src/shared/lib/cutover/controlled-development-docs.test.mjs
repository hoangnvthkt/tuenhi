import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'vitest';

async function readRepositoryFile(path) {
  try {
    return await readFile(resolve(process.cwd(), path), 'utf8');
  } catch {
    return '';
  }
}

test('documents the controlled-development environment and safe release command', async () => {
  const runbook = await readRepositoryFile(
    'docs/runbooks/phase-2-p2-0-controlled-development.md',
  );

  for (const contract of [
    /CONTROLLED_DEVELOPMENT_UAT/,
    /PRODUCTION_TEST_DATA_FORBIDDEN/,
    /pnpm p2:release:verify/,
    /project Supabase Free thứ hai/i,
    /không reset tại chỗ/i,
  ]) {
    assert.match(runbook, contract);
  }
});

test('marks Cloud data runners as historical and points operators to P2.0', async () => {
  const readme = await readRepositoryFile('README.md');

  assert.match(readme, /Lịch sử PRE_PRODUCTION/i);
  assert.match(readme, /PRODUCTION_TEST_DATA_FORBIDDEN/);
  assert.match(readme, /pnpm p2:release:verify/);
  assert.match(readme, /phase-2-p2-0-controlled-development\.md/);
});

test('records the Owner-approved Phase 2 master design status', async () => {
  const masterDesign = await readRepositoryFile(
    'docs/superpowers/specs/2026-08-31-phase-2-master-design.md',
  );

  assert.match(masterDesign, /Trạng thái: Owner đã duyệt/);
  assert.doesNotMatch(masterDesign, /chờ duyệt đặc tả văn bản/i);
});
