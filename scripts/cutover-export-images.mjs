import {
  assertExternalDirectory,
  adminClient,
  ensureDirectory,
  required,
  exportProductImages,
} from './cutover-lib.mjs';

const destination = assertExternalDirectory(
  required('CUTOVER_IMAGE_EXPORT_DIR'),
  'CUTOVER_IMAGE_EXPORT_DIR',
);
await ensureDirectory(destination);
const manifest = await exportProductImages(await adminClient(), destination);
console.log(
  `Đã xuất ${manifest.length} object product-images vào ${destination}.`,
);
