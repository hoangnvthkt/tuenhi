import { readFile } from 'node:fs/promises';
import {
  adminClient,
  assertExternalDirectory,
  assertExternalFile,
  hasFlag,
  required,
  valueForFlag,
} from './cutover-lib.mjs';
import {
  disposeStoragePaths,
  validateApprovedManifest,
} from './cutover-mock-disposition-lib.mjs';

if (!hasFlag('--confirm')) {
  throw new Error('Cần --confirm để hủy dữ liệu mock theo manifest đã duyệt.');
}
if (required('CUTOVER_MOCK_DISPOSITION') !== 'OWNER_APPROVED') {
  throw new Error('CUTOVER_MOCK_DISPOSITION phải là OWNER_APPROVED.');
}

const destination = assertExternalDirectory(
  required('CUTOVER_MANIFEST_DIR'),
  'CUTOVER_MANIFEST_DIR',
);
const manifestArgument = valueForFlag('--manifest');
if (!manifestArgument)
  throw new Error('Cần truyền --manifest với tệp manifest đã duyệt.');
const manifestPath = assertExternalFile(
  destination,
  manifestArgument,
  'MANIFEST',
);
const approved = validateApprovedManifest(
  JSON.parse(await readFile(manifestPath, 'utf8')),
);
const admin = await adminClient();
const { data, error } = await admin.rpc('dispose_owner_pilot_mock_data', {
  p_manifest_sha256: approved.sha256,
  p_keep_store_settings: approved.manifest.keepStoreSettings,
  p_keep_sales_channels: approved.manifest.keepSalesChannels,
});
if (error || data?.ok !== true) {
  throw new Error(
    `Không thể hủy dữ liệu mock: ${error?.message ?? data?.error?.code ?? data?.error?.message ?? 'không rõ lỗi'}`,
  );
}

const receiptId = data.data.receiptId;
try {
  const paths = await disposeStoragePaths({
    receiptId,
    paths: data.data.storagePaths,
    remove: async (bucketId, objectPaths) => {
      const { error: storageError } = await admin.storage
        .from(bucketId)
        .remove(objectPaths);
      if (storageError) {
        throw new Error(
          `Không thể xóa object Storage trong bucket ${bucketId}.`,
        );
      }
    },
    finalize: async (id, deletedPaths) => {
      const result = await admin.rpc(
        'finalize_owner_pilot_mock_storage_disposal',
        {
          p_receipt_id: id,
          p_deleted_paths: deletedPaths,
        },
      );
      if (result.error || result.data?.ok !== true) {
        throw new Error(
          `Không thể hoàn tất receipt Storage: ${result.error?.message ?? result.data?.error?.code ?? 'không rõ lỗi'}`,
        );
      }
    },
  });
  console.log(
    JSON.stringify(
      {
        receiptId,
        manifestSha256: data.data.manifestSha256,
        deletedStorageObjectCount: paths.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    `Storage chưa hoàn tất cho receipt ${receiptId}. Không chạy lại disposal database; chỉ xử lý phần Storage theo receipt này.`,
  );
  throw error;
}
