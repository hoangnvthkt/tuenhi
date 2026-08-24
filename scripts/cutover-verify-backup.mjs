import { resolve } from 'node:path';
import { hasFlag, valueForFlag } from './cutover-lib.mjs';
import {
  assertExternalFile,
  decryptArchive,
  readHiddenPassphrase,
  runProcess,
  verifyBackupReceipt,
  verifyExtractedBackup,
  withTemporaryDirectory,
} from './cutover-archive.mjs';

const archivePath = valueForFlag('--archive');
const receiptPath = valueForFlag('--receipt');
if (!archivePath || !receiptPath || !hasFlag('--confirm')) {
  throw new Error(
    'Dùng: pnpm cutover:verify-backup -- --archive <file.enc> --receipt <file.receipt.json> --confirm',
  );
}

const archive = assertExternalFile(archivePath, 'Archive mã hóa');
const receipt = assertExternalFile(receiptPath, 'Receipt backup');
await verifyBackupReceipt({ archivePath: archive, receiptPath: receipt });
const passphrase = await readHiddenPassphrase(
  'Nhập mật khẩu để xác minh archive backup: ',
);

const result = await withTemporaryDirectory(
  'tuenhi-verify-backup-',
  async (staging) => {
    const plaintextArchive = resolve(staging, 'backup.tar.gz');
    const extracted = resolve(staging, 'extracted');
    await decryptArchive({
      archivePath: archive,
      destinationPath: plaintextArchive,
      passphrase,
    });
    await runProcess('mkdir', ['-p', extracted]);
    await runProcess('tar', ['-xzf', plaintextArchive, '-C', extracted]);
    return verifyExtractedBackup(extracted);
  },
);

console.log(
  `Archive hợp lệ: ${result.imageObjectCount} ảnh; database dump: ${result.hasDatabaseDump ? 'có' : 'không'}.`,
);
console.log('Dữ liệu giải mã tạm đã được xóa.');
