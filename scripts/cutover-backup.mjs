import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import {
  applicationCounts,
  assertExternalDirectory,
  assertExpectedFile,
  adminClient,
  ensureDirectory,
  exportProductImages,
  required,
} from './cutover-lib.mjs';
import { getProjectLifecycle } from './project-lifecycle.mjs';

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} thất bại (${code}): ${stderr.trim()}`));
    });
  });
}

function runWithPassphrase(command, args, passphrase) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.stdin.end(passphrase);
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else
        reject(
          new Error(`${command} mã hóa thất bại (${code}): ${stderr.trim()}`),
        );
    });
  });
}

async function readHiddenPassphrase(prompt) {
  if (!input.isTTY) {
    throw new Error(
      'Backup cần terminal tương tác để nhận mật khẩu mã hóa an toàn.',
    );
  }
  output.write(prompt);
  return new Promise((resolvePrompt) => {
    let value = '';
    input.setRawMode(true);
    input.resume();
    const onData = (chunk) => {
      const character = chunk.toString('utf8');
      if (character === '\r' || character === '\n') {
        input.off('data', onData);
        input.setRawMode(false);
        output.write('\n');
        resolvePrompt(value);
      } else if (character === '\u0003') {
        input.off('data', onData);
        input.setRawMode(false);
        process.exit(130);
      } else if (character === '\u007f') {
        value = value.slice(0, -1);
      } else if (!character.includes('\u001b')) {
        value += character;
      }
    };
    input.on('data', onData);
  });
}

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
const staging = await mkdtemp(resolve(tmpdir(), 'tuenhi-cutover-backup-'));
const archiveName = `tuenhi-cutover-${timestamp}.tar.gz`;
const archivePath = resolve(destination, archiveName);
const encryptedPath = `${archivePath}.enc`;
let stagingRemoved = false;

try {
  await ensureDirectory(destination);
  const admin = await adminClient();
  const lifecycle = await getProjectLifecycle(admin);
  if (lifecycle.mode !== 'PRE_PRODUCTION') {
    throw new Error(
      'BACKUP_LIFECYCLE_INVALID: Chỉ tạo baseline backup trước cutover.',
    );
  }

  const dumpPath = resolve(staging, 'application.dump');
  await run(
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
  await run('pg_restore', ['--list', dumpPath]);

  const images = await exportProductImages(
    admin,
    resolve(staging, 'product-images'),
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
    resolve(staging, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );

  await run('tar', ['-C', staging, '-czf', archivePath, '.']);
  await assertExpectedFile(archivePath);

  const passphrase = await readHiddenPassphrase(
    'Nhập mật khẩu mã hóa AES-256 cho backup: ',
  );
  if (passphrase.length < 16) {
    throw new Error(
      'Mật khẩu backup phải có ít nhất 16 ký tự và không được lưu trong repository.',
    );
  }
  await runWithPassphrase(
    'openssl',
    [
      'enc',
      '-aes-256-cbc',
      '-pbkdf2',
      '-iter',
      '600000',
      '-salt',
      '-pass',
      'stdin',
      '-in',
      archivePath,
      '-out',
      encryptedPath,
    ],
    passphrase,
  );
  await assertExpectedFile(encryptedPath);
  const receipt = {
    createdAt: new Date().toISOString(),
    encryptedArchive: basename(encryptedPath),
    sha256: createHash('sha256')
      .update(await readFile(encryptedPath))
      .digest('hex'),
  };
  await writeFile(
    `${encryptedPath}.receipt.json`,
    `${JSON.stringify(receipt, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );

  await rm(archivePath, { force: true });
  await rm(staging, { recursive: true, force: true });
  stagingRemoved = true;
  console.log(`Backup mã hóa hoàn tất: ${encryptedPath}`);
  console.log(
    'Bản staging và archive chưa mã hóa đã được xóa sau khi checksum encrypted archive được tạo.',
  );
} finally {
  if (!stagingRemoved) {
    console.error(`Backup staging chưa được xóa do lỗi: ${staging}`);
  }
}
