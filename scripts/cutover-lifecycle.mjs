import {
  adminClient,
  hasFlag,
  required,
  valueForFlag,
} from './cutover-lib.mjs';
import { getProjectLifecycle } from './project-lifecycle.mjs';

const action = required('CUTOVER_LIFECYCLE_ACTION').toUpperCase();
const admin = await adminClient();
let result;
if (action === 'OWNER_PILOT') {
  const cutoverAt = valueForFlag('--cutover-at');
  if (!cutoverAt || Number.isNaN(Date.parse(cutoverAt))) {
    throw new Error(
      'Cần truyền --cutover-at với ISO datetime hợp lệ để mở pilot owner.',
    );
  }
  if (!hasFlag('--confirm')) {
    throw new Error('Cần --confirm để chuyển lifecycle sang OWNER_PILOT.');
  }
  result = await admin.rpc('transition_project_lifecycle', {
    p_target_mode: 'OWNER_PILOT',
    p_cutover_at: new Date(cutoverAt).toISOString(),
  });
} else if (action === 'AUTH_HARDENED') {
  if (!hasFlag('--confirm'))
    throw new Error('Cần --confirm để ghi nhận Auth hardening.');
  result = await admin.rpc('record_auth_hardening');
} else if (action === 'STAFF_ACCESS_WAIVER') {
  const reason = valueForFlag('--reason');
  if (!reason?.trim()) {
    throw new Error(
      'Cần truyền --reason với lý do vận hành, không chứa thông tin bí mật.',
    );
  }
  if (!hasFlag('--confirm')) {
    throw new Error('Cần --confirm để cấp ngoại lệ tạo nhân viên.');
  }
  result = await admin.rpc('record_staff_access_waiver', {
    p_reason: reason.trim(),
  });
} else if (action === 'PRODUCTION') {
  if (!hasFlag('--confirm'))
    throw new Error('Cần --confirm để chuyển lifecycle sang PRODUCTION.');
  result = await admin.rpc('transition_project_lifecycle', {
    p_target_mode: 'PRODUCTION',
  });
} else {
  throw new Error(
    'CUTOVER_LIFECYCLE_ACTION chỉ nhận OWNER_PILOT, AUTH_HARDENED, STAFF_ACCESS_WAIVER hoặc PRODUCTION.',
  );
}
if (result.error || result.data?.ok !== true) {
  throw new Error(
    `Không thể chuyển lifecycle: ${result.error?.message ?? result.data?.error?.message ?? 'không rõ lỗi'}`,
  );
}
console.log(JSON.stringify(await getProjectLifecycle(admin), null, 2));
