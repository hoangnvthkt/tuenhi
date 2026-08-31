const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const MIGRATION_ID_PATTERN = /^\d{14}$/;
const ALLOWED_STAFF_ACCESS_POLICIES = new Set([
  'OWNER_WAIVER',
  'LEAKED_PASSWORD_PROTECTED',
]);

function fail(code) {
  throw new Error(code);
}

export function assertControlledDevelopmentLifecycle(lifecycle) {
  if (
    lifecycle?.mode !== 'PRODUCTION' ||
    !ALLOWED_STAFF_ACCESS_POLICIES.has(lifecycle.staffAccessPolicy)
  ) {
    fail('CONTROLLED_DEVELOPMENT_LIFECYCLE_INVALID');
  }

  return {
    mode: lifecycle.mode,
    policy: lifecycle.staffAccessPolicy,
  };
}

export function assertLinkedProjectIdentity({
  projectId,
  linkedRef,
  supabaseUrl,
}) {
  if (
    typeof projectId !== 'string' ||
    typeof linkedRef !== 'string' ||
    typeof supabaseUrl !== 'string' ||
    !PROJECT_REF_PATTERN.test(projectId) ||
    !PROJECT_REF_PATTERN.test(linkedRef) ||
    projectId !== linkedRef
  ) {
    fail('CONTROLLED_DEVELOPMENT_PROJECT_IDENTITY_INVALID');
  }

  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    fail('CONTROLLED_DEVELOPMENT_PROJECT_IDENTITY_INVALID');
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname !== `${projectId}.supabase.co` ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    fail('CONTROLLED_DEVELOPMENT_PROJECT_IDENTITY_INVALID');
  }

  return { projectId };
}

export function parseLinkedMigrationList(output) {
  if (typeof output !== 'string') {
    fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
  }

  const lines = output.split(/\r?\n/);
  const headerIndex = lines.findIndex(
    (line) =>
      /\bLOCAL\b/.test(line) && /\bREMOTE\b/.test(line) && line.includes('|'),
  );
  if (
    headerIndex < 0 ||
    !/^\s*-+\s*\|\s*-+/.test(lines[headerIndex + 1] ?? '')
  ) {
    fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
  }

  const migrationIds = new Set();
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim() || !line.includes('|')) continue;
    const [local = '', remote = ''] = line
      .split('|')
      .map((value) => value.trim());
    if (!local && !remote) continue;
    if (
      (local && !MIGRATION_ID_PATTERN.test(local)) ||
      (remote && !MIGRATION_ID_PATTERN.test(remote))
    ) {
      fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
    }
    if (!local || !remote || local !== remote || migrationIds.has(local)) {
      fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_MISMATCH');
    }
    migrationIds.add(local);
  }

  if (migrationIds.size === 0) {
    fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
  }

  return { migrationCount: migrationIds.size };
}
