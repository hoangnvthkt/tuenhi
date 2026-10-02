import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationCounts, adminClient } from './cutover-lib.mjs';
import { getProjectLifecycle } from './project-lifecycle.mjs';
import {
  assertControlledDevelopmentLifecycle,
  assertLinkedProjectIdentity,
  parseLinkedMigrationList,
} from './controlled-development-policy.mjs';

export const GATE_COMMANDS = Object.freeze([
  Object.freeze({
    id: 'migrationList',
    command: 'supabase',
    args: Object.freeze(['migration', 'list', '--linked']),
  }),
  Object.freeze({
    id: 'dbLint',
    command: 'supabase',
    args: Object.freeze(['db', 'lint', '--linked', '--fail-on', 'error']),
  }),
  Object.freeze({
    id: 'securityAdvisor',
    command: 'supabase',
    args: Object.freeze([
      'db',
      'advisors',
      '--linked',
      '--type',
      'security',
      '--level',
      'warn',
      '--fail-on',
      'error',
    ]),
  }),
  Object.freeze({
    id: 'performanceAdvisor',
    command: 'supabase',
    args: Object.freeze([
      'db',
      'advisors',
      '--linked',
      '--type',
      'performance',
      '--level',
      'warn',
      '--fail-on',
      'error',
    ]),
  }),
  Object.freeze({
    id: 'phase1fAssertions',
    command: 'pnpm',
    args: Object.freeze(['cloud:verify:phase1f']),
  }),
  Object.freeze({
    id: 'p2.2Assertions',
    command: 'pnpm',
    args: Object.freeze(['cloud:verify:p2.2']),
  }),
  Object.freeze({
    id: 'p2.3Assertions',
    command: 'pnpm',
    args: Object.freeze(['cloud:verify:p2.3']),
  }),
  Object.freeze({
    id: 'customerFeedbackAssertions',
    command: 'pnpm',
    args: Object.freeze(['cloud:verify:feedback']),
  }),
]);

const GATE_IDS = [
  'projectIdentity',
  'lifecycle',
  'applicationCounts',
  ...GATE_COMMANDS.map(({ id }) => id),
];

class ControlledDevelopmentGateError extends Error {
  constructor(code, report) {
    super(code);
    this.report = report;
  }
}

function createReport() {
  return {
    environmentRole: 'CONTROLLED_DEVELOPMENT_UAT',
    lifecycle: { mode: null, policy: null },
    migrationCount: null,
    applicationCounts: null,
    gates: Object.fromEntries(GATE_IDS.map((id) => [id, 'not-run'])),
  };
}

function stop(report, gate, code) {
  if (gate) report.gates[gate] = 'failed';
  throw new ControlledDevelopmentGateError(code, report);
}

function environmentIdentity(environment) {
  const projectId = environment.SUPABASE_PROJECT_ID?.trim();
  let configuredUrls;
  try {
    configuredUrls = [
      environment.SUPABASE_URL?.trim(),
      environment.VITE_SUPABASE_URL?.trim(),
    ]
      .filter(Boolean)
      .map((value) => new URL(value).href);
  } catch {
    throw new Error('CONTROLLED_DEVELOPMENT_PROJECT_IDENTITY_INVALID');
  }
  configuredUrls = [...new Set(configuredUrls)];
  if (configuredUrls.length !== 1) {
    throw new Error('CONTROLLED_DEVELOPMENT_PROJECT_IDENTITY_INVALID');
  }
  return { projectId, supabaseUrl: configuredUrls[0] };
}

function executeCommand(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function readLinkedProjectRef() {
  return (
    await readFile(resolve(process.cwd(), 'supabase/.temp/project-ref'), 'utf8')
  ).trim();
}

export async function runControlledDevelopmentGate({
  admin = null,
  environment = process.env,
  execute = executeCommand,
  identity = null,
  readProjectRef = readLinkedProjectRef,
} = {}) {
  const report = createReport();
  try {
    const runtimeIdentity = identity ?? {
      ...environmentIdentity(environment),
      linkedRef: await readProjectRef(),
    };
    assertLinkedProjectIdentity(runtimeIdentity);
  } catch {
    stop(
      report,
      'projectIdentity',
      'CONTROLLED_DEVELOPMENT_PROJECT_IDENTITY_INVALID',
    );
  }
  report.gates.projectIdentity = 'passed';

  const client = admin ?? (await adminClient());
  try {
    report.lifecycle = assertControlledDevelopmentLifecycle(
      await getProjectLifecycle(client),
    );
  } catch {
    stop(report, 'lifecycle', 'CONTROLLED_DEVELOPMENT_LIFECYCLE_INVALID');
  }
  report.gates.lifecycle = 'passed';

  try {
    report.applicationCounts = await applicationCounts(client);
  } catch {
    stop(
      report,
      'applicationCounts',
      'CONTROLLED_DEVELOPMENT_APPLICATION_COUNTS_UNAVAILABLE',
    );
  }
  report.gates.applicationCounts = 'passed';

  for (const { id, command, args } of GATE_COMMANDS) {
    let result;
    try {
      result = await execute(command, args);
    } catch {
      stop(report, id, 'CONTROLLED_DEVELOPMENT_GATE_FAILED');
    }
    if (result?.status !== 0) {
      stop(report, id, 'CONTROLLED_DEVELOPMENT_GATE_FAILED');
    }
    if (id === 'migrationList') {
      try {
        report.migrationCount = parseLinkedMigrationList(result.stdout);
      } catch (error) {
        stop(
          report,
          id,
          error instanceof Error &&
            /^CONTROLLED_DEVELOPMENT_MIGRATION_LIST_/.test(error.message)
            ? error.message
            : 'CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID',
        );
      }
      report.migrationCount = report.migrationCount.migrationCount;
    }
    report.gates[id] = 'passed';
  }
  return report;
}

export async function main() {
  try {
    console.log(JSON.stringify(await runControlledDevelopmentGate(), null, 2));
  } catch (error) {
    const report =
      error instanceof ControlledDevelopmentGateError
        ? error.report
        : createReport();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
