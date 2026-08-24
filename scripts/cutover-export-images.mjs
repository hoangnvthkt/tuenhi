import { resolve } from 'node:path';
import {
  adminClient,
  assertExternalDirectory,
  ensureDirectory,
  exportProductImages,
  required,
} from './cutover-lib.mjs';
import {
  createEncryptedArchive,
  readHiddenPassphrase,
  runProcess,
  withTemporaryDirectory,
} from './cutover-archive.mjs';

const destination = assertExternalDirectory(
  required('CUTOVER_IMAGE_EXPORT_DIR'),
  'CUTOVER_IMAGE_EXPORT_DIR',
);
const timestamp = new Date()
  .toISOString()
  .replaceAll(':', '')
  .replaceAll('.', '');
const archiveName = `tuenhi-product-images-${timestamp}.tar.gz`;
const encryptedPath = resolve(destination, `${archiveName}.enc`);

await ensureDirectory(destination);
const passphrase = await readHiddenPassphrase(
  'Nhập mật khẩu mã hóa AES-256 cho archive ảnh: ',
);

const { objectCount, receiptPath } = await withTemporaryDirectory(
  'tuenhi-product-images-',
  async (staging) => {
    const payload = resolve(staging, 'payload');
    await ensureDirectory(payload);
    const images = await exportProductImages(
      await adminClient(),
      resolve(payload, 'product-images'),
    );
    const plaintextArchive = resolve(staging, archiveName);
    await runProcess('tar', ['-C', payload, '-czf', plaintextArchive, '.']);
    return {
      objectCount: images.length,
      receiptPath: await createEncryptedArchive({
        sourcePath: plaintextArchive,
        archivePath: encryptedPath,
        passphrase,
      }),
    };
  },
);

console.log(
  `Đã xuất mã hóa ${objectCount} object product-images: ${encryptedPath}`,
);
console.log(`Receipt checksum: ${receiptPath}`);
console.log('Staging và archive plaintext đã được xóa, kể cả khi có lỗi.');
