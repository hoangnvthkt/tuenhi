import {
  adminClient,
  hasFlag,
  listSyntheticAuthUsers,
  listSyntheticProfiles,
} from './cutover-lib.mjs';
import { assertSyntheticTestsAllowed } from './project-lifecycle.mjs';

const cleanupRpcByPhase = {
  phase1a: 'cleanup_phase1a_test_users',
  phase1b: 'cleanup_phase1b_test_users',
  phase1c: 'cleanup_phase1c_test_users',
  phase1e: 'cleanup_phase1e_test_users',
  phase1f: 'cleanup_phase1f_test_users',
};

const admin = await adminClient();
await assertSyntheticTestsAllowed(admin);

const [profiles, authUsers] = await Promise.all([
  listSyntheticProfiles(admin),
  listSyntheticAuthUsers(admin),
]);
const grouped = Object.fromEntries(
  Object.keys(cleanupRpcByPhase).map((phase) => [phase, []]),
);
for (const profile of profiles) {
  const match = profile.email.match(/^codex-(phase1[abcef])-/i);
  if (!match || !grouped[match[1].toLowerCase()]) {
    throw new Error(
      `TEST_DATA_PREFIX_INVALID: Không thể dọn an toàn ${profile.email}.`,
    );
  }
  grouped[match[1].toLowerCase()].push(profile.id);
}

console.log(
  JSON.stringify(
    {
      mode: hasFlag('--confirm') ? 'CONFIRM' : 'DRY_RUN',
      profilesByPhase: Object.fromEntries(
        Object.entries(grouped).map(([phase, ids]) => [phase, ids.length]),
      ),
      authUsers: authUsers.map((user) => user.email),
    },
    null,
    2,
  ),
);

if (!hasFlag('--confirm')) {
  console.log(
    'Dry-run hoàn tất. Chỉ chạy lại với --confirm sau khi owner duyệt danh sách.',
  );
  process.exit(0);
}

for (const [phase, ids] of Object.entries(grouped)) {
  for (let index = 0; index < ids.length; index += 10) {
    const { data, error } = await admin.rpc(cleanupRpcByPhase[phase], {
      p_user_ids: ids.slice(index, index + 10),
    });
    if (error || data?.ok !== true) {
      throw new Error(`Không thể dọn profile test ${phase} an toàn.`);
    }
  }
}

for (const user of authUsers) {
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Không thể xóa Auth user test ${user.email}.`);
}

const [remainingProfiles, remainingAuth] = await Promise.all([
  listSyntheticProfiles(admin),
  listSyntheticAuthUsers(admin),
]);
if (remainingProfiles.length || remainingAuth.length) {
  throw new Error('CLEANUP_INCOMPLETE: Vẫn còn dữ liệu test sau cleanup.');
}
console.log(
  'Cleanup test hoàn tất, không còn profile hoặc Auth user codex-phase*.',
);
