import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import {
  assertPreProductionAutomationAllowed,
  assertSyntheticTestsAllowed,
} from '../../../../scripts/project-lifecycle.mjs';

const workspace = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

async function blockedAutomationBootstrap() {
  const directory = await mkdtemp(
    resolve(tmpdir(), 'tuenhi-automation-guard-'),
  );
  const bootstrap = resolve(directory, 'bootstrap.mjs');
  await writeFile(
    bootstrap,
    `import { registerHooks } from 'node:module';
const client = \`data:text/javascript,export function createClient(){return {rpc:async()=>({data:{ok:true,data:{mode:'OWNER_PILOT'}},error:null}),auth:{admin:{}},from(){throw new Error('UNREACHABLE_CLOUD_READ')}}}\`;
registerHooks({resolve(specifier, context, nextResolve) { if (specifier === '@supabase/supabase-js') return { url: client, shortCircuit: true }; return nextResolve(specifier, context); }});
const phase = process.argv[1]?.includes('phase-1b') ? 'phase1b' : 'phase1a';
Object.assign(process.env, {
  SUPABASE_URL: 'https://example.invalid', VITE_SUPABASE_URL: 'https://example.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'public-test-key', SUPABASE_SECRET_KEY: 'service-test-secret',
  SUPABASE_ACCESS_TOKEN: 'access-test-token', SUPABASE_PROJECT_ID: 'project-test-id',
  TEST_OWNER_EMAIL: \`codex-\${phase}-owner@example.invalid\`, TEST_OWNER_PASSWORD: 'Password1!',
  TEST_EMPLOYEE_EMAIL: 'codex-phase1a-employee@example.invalid', TEST_EMPLOYEE_PASSWORD: 'Password1!',
  TEST_CATALOG_EMPLOYEE_EMAIL: 'codex-phase1b-catalog@example.invalid', TEST_CATALOG_EMPLOYEE_PASSWORD: 'Password1!',
  TEST_BUSINESS_EMPLOYEE_EMAIL: 'codex-phase1b-business@example.invalid', TEST_BUSINESS_EMPLOYEE_PASSWORD: 'Password1!'
});
globalThis.fetch = async () => new Response(JSON.stringify([{name:'service_role',api_key:'service-test-secret'}]), {status: 200});
`,
  );
  return { directory, bootstrap };
}

test('allows Cloud automation only while lifecycle is PRE_PRODUCTION', () => {
  const lifecycle = { mode: 'PRE_PRODUCTION' };

  assert.equal(assertPreProductionAutomationAllowed(lifecycle), lifecycle);
});

test('blocks OWNER_PILOT and PRODUCTION automation without exposing lifecycle data', () => {
  for (const mode of ['OWNER_PILOT', 'PRODUCTION']) {
    assert.throws(
      () => assertPreProductionAutomationAllowed({ mode }),
      (error) => {
        assert.equal(error.message, 'PRODUCTION_TEST_DATA_FORBIDDEN');
        assert.doesNotMatch(error.message, /OWNER_PILOT|lifecycle|mode/i);
        return true;
      },
    );
  }
});

test('keeps the synthetic-test adapter on the shared automation guard', async () => {
  const lifecycle = { mode: 'PRE_PRODUCTION' };
  const admin = {
    rpc: async (name) => {
      assert.equal(name, 'get_project_lifecycle');
      return { data: { ok: true, data: lifecycle }, error: null };
    },
  };

  assert.equal(await assertSyntheticTestsAllowed(admin), lifecycle);
});

test('blocks cleanup, preflight, and every Cloud test runner before Cloud reads or writes', async () => {
  const packageJson = await import('../../../../package.json', {
    with: { type: 'json' },
  });
  const cloudRunners = Object.entries(packageJson.default.scripts)
    .filter(([name]) => name.startsWith('test:cloud:'))
    .map(
      ([, command]) =>
        command.match(/^node --env-file=\.env (scripts\/[^\s]+)$/)?.[1],
    );
  assert.ok(cloudRunners.every(Boolean));

  const { directory, bootstrap } = await blockedAutomationBootstrap();
  try {
    for (const runner of [
      'scripts/cutover-cleanup-tests.mjs',
      'scripts/cutover-preflight.mjs',
      ...cloudRunners,
    ]) {
      const result = spawnSync(
        process.execPath,
        ['--import', bootstrap, runner],
        {
          cwd: workspace,
          encoding: 'utf8',
          timeout: 5_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      assert.notEqual(
        result.status,
        0,
        `${runner} must reject production automation`,
      );
      assert.match(output, /PRODUCTION_TEST_DATA_FORBIDDEN/, runner);
      assert.doesNotMatch(
        output,
        /OWNER_PILOT|access-test-token|service-test-secret/,
        runner,
      );
      assert.doesNotMatch(output, /UNREACHABLE_CLOUD_READ/, runner);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
