import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  adminClient,
  assertExternalDirectory,
  ensureDirectory,
  hasFlag,
  required,
} from './cutover-lib.mjs';
import { validateApprovedManifest } from './cutover-mock-disposition-lib.mjs';

function requireDispositionFlags() {
  const keepStoreSettings = hasFlag('--keep-store-settings');
  const replaceStoreSettings = hasFlag('--replace-store-settings');
  const keepSalesChannels = hasFlag('--keep-sales-channels');
  const replaceSalesChannels = hasFlag('--replace-sales-channels');
  if (
    keepStoreSettings === replaceStoreSettings ||
    keepSalesChannels === replaceSalesChannels
  ) {
    throw new Error(
      'Cần chọn đúng một cờ giữ/thay cho cấu hình cửa hàng và kênh bán.',
    );
  }
  return { keepStoreSettings, keepSalesChannels };
}

const destination = assertExternalDirectory(
  required('CUTOVER_MANIFEST_DIR'),
  'CUTOVER_MANIFEST_DIR',
);
const flags = requireDispositionFlags();
const admin = await adminClient();
const { data, error } = await admin.rpc('get_owner_pilot_mock_manifest', {
  p_keep_store_settings: flags.keepStoreSettings,
  p_keep_sales_channels: flags.keepSalesChannels,
});
if (error || data?.ok !== true) {
  throw new Error(
    `Không thể tạo manifest mock: ${error?.message ?? data?.error?.message ?? 'không rõ lỗi'}`,
  );
}

const manifestFile = validateApprovedManifest({
  manifest: data.data.manifest,
  canonicalJson: data.data.canonicalJson,
  sha256: data.data.sha256,
});
const timestamp = new Date()
  .toISOString()
  .replaceAll(':', '')
  .replaceAll('.', '');
const fileName = `tuenhi-owner-pilot-mock-manifest-${timestamp}.json`;
const output = resolve(destination, fileName);
await ensureDirectory(destination);
await writeFile(
  output,
  `${JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      ...manifestFile,
    },
    null,
    2,
  )}\n`,
  { encoding: 'utf8', mode: 0o600, flag: 'wx' },
);

const recordCounts = Object.fromEntries(
  Object.entries(manifestFile.manifest.records).map(([key, value]) => [
    key,
    Array.isArray(value) ? value.length : 0,
  ]),
);
console.log(
  JSON.stringify(
    {
      fileName,
      sha256: manifestFile.sha256,
      recordCounts,
      storageObjectCount: manifestFile.manifest.storagePaths.length,
      keepStoreSettings: flags.keepStoreSettings,
      keepSalesChannels: flags.keepSalesChannels,
    },
    null,
    2,
  ),
);
