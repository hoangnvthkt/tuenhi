import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  applicationCounts,
  assertExternalDirectory,
  adminClient,
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
import { getProjectLifecycle } from './project-lifecycle.mjs';

const destination = assertExternalDirectory(
  required('CUTOVER_BACKUP_DIR'),
  'CUTOVER_BACKUP_DIR',
);
const database = {
  PGHOST: required('SUPABASE_DB_HOST'),
  PGPORT: required('SUPABASE_DB_PORT'),
  PGUSER: required('SUPABASE_DB_USER'),
  PGDATABASE: required('SUPABASE_DB_NAME'),
  PGPASSWORD: required('SUPABASE_DB_PASSWORD'),
};
const timestamp = new Date()
  .toISOString()
  .replaceAll(':', '')
  .replaceAll('.', '');
const archiveName = `tuenhi-cutover-${timestamp}.tar.gz`;
const encryptedPath = resolve(destination, `${archiveName}.enc`);

await ensureDirectory(destination);
const admin = await adminClient();
const lifecycle = await getProjectLifecycle(admin);
if (!['PRE_PRODUCTION', 'OWNER_PILOT'].includes(lifecycle.mode)) {
  throw new Error(
    'BACKUP_LIFECYCLE_INVALID: Chỉ tạo baseline backup ở PRE_PRODUCTION hoặc OWNER_PILOT.',
  );
}

const passphrase = await readHiddenPassphrase(
  'Nhập mật khẩu mã hóa AES-256 cho backup: ',
);

const receiptPath = await withTemporaryDirectory(
  'tuenhi-cutover-backup-',
  async (staging) => {
    const payload = resolve(staging, 'payload');
    await ensureDirectory(payload);
    const dumpPath = resolve(payload, 'application.dump');
    await runProcess(
      'pg_dump',
      [
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--schema=api',
        '--schema=app_private',
        '--file',
        dumpPath,
      ],
      { env: { ...process.env, ...database } },
    );
    await runProcess('pg_restore', ['--list', dumpPath]);

    const images = await exportProductImages(
      admin,
      resolve(payload, 'product-images'),
    );
    const manifest = {
      createdAt: new Date().toISOString(),
      lifecycle,
      applicationCounts: await applicationCounts(admin),
      applicationDump: {
        file: 'application.dump',
        bytes: (await stat(dumpPath)).size,
        sha256: createHash('sha256')
          .update(await readFile(dumpPath))
          .digest('hex'),
      },
      productImages: { objectCount: images.length },
    };
    await writeFile(
      resolve(payload, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 },
    );

    const plaintextArchive = resolve(staging, archiveName);
    await runProcess('tar', ['-C', payload, '-czf', plaintextArchive, '.']);
    return createEncryptedArchive({
      sourcePath: plaintextArchive,
      archivePath: encryptedPath,
      passphrase,
    });
  },
);

console.log(`Backup mã hóa hoàn tất: ${encryptedPath}`);
console.log(`Receipt checksum: ${receiptPath}`);
console.log('Staging và archive plaintext đã được xóa, kể cả khi có lỗi.');
