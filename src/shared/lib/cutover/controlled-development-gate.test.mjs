import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  assertControlledDevelopmentLifecycle,
  assertLinkedProjectIdentity,
  parseLinkedMigrationList,
} from '../../../../scripts/controlled-development-policy.mjs';
import {
  GATE_COMMANDS,
  runControlledDevelopmentGate,
} from '../../../../scripts/controlled-development-gate.mjs';

const projectRef = 'abcdefghijklmnopqrst';
const supabaseUrl = `https://${projectRef}.supabase.co`;
const migrationList = `
 LOCAL            | REMOTE           | TIME (UTC)
------------------|------------------|---------------------
 20260822040151   | 20260822040151   | 2026-08-22 04:01:51
 20260823095940   | 20260823095940   | 2026-08-23 09:59:40
`;

function validLifecycle() {
  return { mode: 'PRODUCTION', staffAccessPolicy: 'OWNER_WAIVER' };
}

function validIdentity() {
  return {
    projectId: projectRef,
    linkedRef: projectRef,
    supabaseUrl,
  };
}

test('rejects a mismatched linked project without disclosing project identity', () => {
  assert.throws(
    () =>
      assertLinkedProjectIdentity({
        ...validIdentity(),
        linkedRef: 'qrstuvwxyzabcdefghij',
      }),
    (error) => {
      assert.equal(
        error.message,
        'CONTROLLED_DEVELOPMENT_PROJECT_IDENTITY_INVALID',
      );
      assert.doesNotMatch(error.message, /abcdefghijklmnopqrst|qrstuvwxyz/i);
      return true;
    },
  );
});

test('rejects a malformed or non-project Supabase URL', () => {
  for (const supabaseUrl of [
    'not-a-url',
    'http://abcdefghijklmnopqrst.supabase.co',
    'https://different.supabase.co',
  ]) {
    assert.throws(
      () => assertLinkedProjectIdentity({ ...validIdentity(), supabaseUrl }),
      /CONTROLLED_DEVELOPMENT_PROJECT_IDENTITY_INVALID/,
    );
  }
});

test('rejects lifecycle modes and staff policies outside the production contract', () => {
  for (const lifecycle of [
    { mode: 'OWNER_PILOT', staffAccessPolicy: 'OWNER_WAIVER' },
    { mode: 'PRODUCTION', staffAccessPolicy: 'BLOCKED' },
    { mode: 'PRODUCTION' },
  ]) {
    assert.throws(
      () => assertControlledDevelopmentLifecycle(lifecycle),
      /CONTROLLED_DEVELOPMENT_LIFECYCLE_INVALID/,
    );
  }
});

test('rejects a migration list with a local-only migration', () => {
  assert.throws(
    () =>
      parseLinkedMigrationList(`
 LOCAL            | REMOTE           | TIME (UTC)
------------------|------------------|---------------------
 20260822040151   | 20260822040151   | 2026-08-22 04:01:51
 20260823095940   |                  | 2026-08-23 09:59:40
`),
    /CONTROLLED_DEVELOPMENT_MIGRATION_LIST_MISMATCH/,
  );
});

test('rejects a migration list with a remote-only migration', () => {
  assert.throws(
    () =>
      parseLinkedMigrationList(`
 LOCAL            | REMOTE           | TIME (UTC)
------------------|------------------|---------------------
                 | 20260823095940   | 2026-08-23 09:59:40
`),
    /CONTROLLED_DEVELOPMENT_MIGRATION_LIST_MISMATCH/,
  );
});

test('rejects an empty migration table as malformed verification output', () => {
  assert.throws(
    () =>
      parseLinkedMigrationList(`
 LOCAL            | REMOTE           | TIME (UTC)
------------------|------------------|---------------------
`),
    /CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID/,
  );
});

test('runs the fixed read-only gate sequence and reports a subprocess failure safely', async () => {
  const calls = [];
  const admin = {
    rpc: async () => ({
      data: { ok: true, data: validLifecycle() },
      error: null,
    }),
    from: () => ({
      select: async () => ({ count: 0, error: null }),
    }),
  };
  const execute = async (command, args) => {
    calls.push([command, args]);
    if (calls.length === 1)
      return { status: 0, stdout: migrationList, stderr: '' };
    if (calls.length === 2)
      return { status: 1, stdout: '', stderr: 'sensitive CLI detail' };
    throw new Error('subsequent gates must not run');
  };

  await assert.rejects(
    () =>
      runControlledDevelopmentGate({
        admin,
        execute,
        identity: validIdentity(),
      }),
    (error) => {
      assert.equal(error.message, 'CONTROLLED_DEVELOPMENT_GATE_FAILED');
      assert.deepEqual(
        calls,
        GATE_COMMANDS.slice(0, 2).map(({ command, args }) => [command, args]),
      );
      assert.equal(error.report.gates.migrationList, 'passed');
      assert.equal(error.report.gates.dbLint, 'failed');
      assert.equal(error.report.gates.securityAdvisor, 'not-run');
      assert.doesNotMatch(JSON.stringify(error.report), /sensitive CLI detail/);
      return true;
    },
  );
});

test('accepts the browser URL fallback and returns only the scrubbed release report', async () => {
  const admin = {
    rpc: async () => ({
      data: {
        ok: true,
        data: {
          ...validLifecycle(),
          updatedAt: 'private timestamp',
          cutoverAt: 'private timestamp',
        },
      },
      error: null,
    }),
    from: () => ({
      select: async () => ({ count: 0, error: null }),
    }),
  };
  const report = await runControlledDevelopmentGate({
    admin,
    environment: {
      SUPABASE_PROJECT_ID: projectRef,
      SUPABASE_URL: '',
      VITE_SUPABASE_URL: supabaseUrl,
    },
    readProjectRef: async () => projectRef,
    execute: async (_command, args) => ({
      status: 0,
      stdout: args[0] === 'migration' ? migrationList : '',
      stderr: '',
    }),
  });

  assert.deepEqual(Object.keys(report).sort(), [
    'applicationCounts',
    'environmentRole',
    'gates',
    'lifecycle',
    'migrationCount',
  ]);
  assert.deepEqual(report.lifecycle, {
    mode: 'PRODUCTION',
    policy: 'OWNER_WAIVER',
  });
  assert.equal(report.migrationCount, 2);
  assert.ok(Object.values(report.gates).every((status) => status === 'passed'));
  assert.doesNotMatch(JSON.stringify(report), /private timestamp/);
});
