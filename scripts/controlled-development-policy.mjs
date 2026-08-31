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

function countMatchedMigrations(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
  }

  const migrationIds = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
    }

    const values = [row.local, row.remote].map((value) => {
      if (value === null || value === undefined) return '';
      if (typeof value !== 'string') {
        fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
      }
      return value.trim();
    });
    const [local, remote] = values;
    const time = typeof row.time === 'string' ? row.time.trim() : '';

    if ((!local && !remote) || !time) {
      fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
    }
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

  return { migrationCount: migrationIds.size };
}

export function parseLinkedMigrationList(output) {
  if (typeof output !== 'string') {
    fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
  }

  const trimmedOutput = output.trim();
  if (trimmedOutput.startsWith('{')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmedOutput);
    } catch {
      fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
    }
    return countMatchedMigrations(parsed?.migrations);
  }

  const lines = output.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const columns = line.split('|').map((value) => value.trim().toLowerCase());
    return (
      columns.length === 3 &&
      columns[0] === 'local' &&
      columns[1] === 'remote' &&
      columns[2] === 'time (utc)'
    );
  });
  if (
    headerIndex < 0 ||
    !/^\s*-+\s*\|\s*-+\s*\|\s*-+\s*$/.test(lines[headerIndex + 1] ?? '')
  ) {
    fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
  }

  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim()) continue;
    const columns = line.split('|').map((value) => value.trim());
    if (columns.length !== 3) {
      fail('CONTROLLED_DEVELOPMENT_MIGRATION_LIST_INVALID');
    }
    const [local = '', remote = '', time = ''] = columns;
    rows.push({ local, remote, time });
  }

  return countMatchedMigrations(rows);
}
