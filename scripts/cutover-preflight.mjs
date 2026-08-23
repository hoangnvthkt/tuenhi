import {
  applicationCounts,
  adminClient,
  listSyntheticAuthUsers,
  listSyntheticProfiles,
} from './cutover-lib.mjs';
import { spawnSync } from 'node:child_process';
import { getProjectLifecycle } from './project-lifecycle.mjs';

const admin = await adminClient();
const [lifecycle, profiles, authUsers, counts] = await Promise.all([
  getProjectLifecycle(admin),
  listSyntheticProfiles(admin),
  listSyntheticAuthUsers(admin),
  applicationCounts(admin),
]);

const pending = {};
for (const table of ['sale_returns', 'stock_counts', 'purchase_receipts']) {
  const { data, error } = await admin.from(table).select('status');
  if (error)
    throw new Error(`Không thể kiểm tra chứng từ ${table}: ${error.message}`);
  pending[table] = (data ?? []).reduce((result, item) => {
    result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, {});
}

const qualityCommands = [
  ['migration-list', ['exec', 'supabase', 'migration', 'list', '--linked']],
  ['db-lint', ['exec', 'supabase', 'db', 'lint', '--linked']],
  [
    'security-advisor',
    [
      'exec',
      'supabase',
      'db',
      'advisors',
      '--linked',
      '--type',
      'security',
      '--fail-on',
      'error',
    ],
  ],
  [
    'performance-advisor',
    [
      'exec',
      'supabase',
      'db',
      'advisors',
      '--linked',
      '--type',
      'performance',
      '--fail-on',
      'error',
    ],
  ],
];
const quality = {};
for (const [label, args] of qualityCommands) {
  const result = spawnSync('pnpm', args, { encoding: 'utf8' });
  quality[label] = {
    ok: result.status === 0,
    output: `${result.stdout}\n${result.stderr}`.trim(),
  };
}

console.log(
  JSON.stringify(
    {
      lifecycle,
      syntheticProfiles: profiles.map((profile) => profile.email),
      syntheticAuthUsers: authUsers.map((user) => user.email),
      applicationCounts: counts,
      documentStatuses: pending,
      quality,
    },
    null,
    2,
  ),
);

if (lifecycle.mode !== 'PRE_PRODUCTION') {
  throw new Error(
    'PRECHECK_LIFECYCLE_INVALID: Môi trường không còn PRE_PRODUCTION.',
  );
}
if (profiles.length > 0 || authUsers.length > 0) {
  throw new Error(
    'PRECHECK_SYNTHETIC_DATA_PRESENT: Còn dữ liệu test cần dry-run cleanup.',
  );
}
if (Object.values(quality).some((result) => !result.ok)) {
  throw new Error(
    'PRECHECK_QUALITY_FAILED: Migration, lint hoặc advisor chưa đạt.',
  );
}
