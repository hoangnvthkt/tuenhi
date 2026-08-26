import { adminClient, hasFlag, valueForFlag } from './cutover-lib.mjs';
import { validateRealDataVerification } from './cutover-mock-disposition-lib.mjs';

const expectEmpty = hasFlag('--expect-empty-operational-data');
const requestedStage = expectEmpty
  ? 'EMPTY'
  : (valueForFlag('--stage') ?? '').toUpperCase();

if (!['EMPTY', 'CATALOG', 'OPENING'].includes(requestedStage)) {
  throw new Error(
    'Cần dùng --expect-empty-operational-data, --stage=catalog hoặc --stage=opening.',
  );
}
if (expectEmpty && valueForFlag('--stage')) {
  throw new Error('Không kết hợp --expect-empty-operational-data với --stage.');
}

const admin = await adminClient();
const { data, error } = await admin.rpc(
  'get_owner_pilot_real_data_verification',
  {
    p_stage: requestedStage,
  },
);
if (error || data?.ok !== true) {
  throw new Error(
    `Không thể đối soát dữ liệu thật: ${error?.message ?? data?.error?.message ?? 'không rõ lỗi'}`,
  );
}

const verified = validateRealDataVerification(data.data, {
  stage: requestedStage,
  expectEmpty,
});
console.log(
  JSON.stringify(
    {
      stage: verified.stage,
      operationalEmpty: verified.operationalEmpty,
      catalogReady: verified.catalogReady,
      openingReady: verified.openingReady,
      counts: verified.counts,
      openingMovementCount: verified.openingMovementCount,
      inventoryValue: verified.inventoryValue,
      financial: verified.financial,
    },
    null,
    2,
  ),
);
