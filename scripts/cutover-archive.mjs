import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { stdin as input, stdout as output } from 'node:process';
import {
  assertExternalDirectory,
  assertExpectedFile,
  sha256File,
} from './cutover-lib.mjs';

const OPENSSL_ARGS = [
  'enc',
  '-aes-256-cbc',
  '-pbkdf2',
  '-iter',
  '600000',
  '-salt',
];

function assertPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 16) {
    throw new Error(
      'Mật khẩu backup phải có ít nhất 16 ký tự và không được lưu trong repository.',
    );
  }
}

function safeStoragePath(objectPath) {
  const segments = objectPath.split('/');
  if (
    !objectPath ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Đường dẫn object trong manifest không an toàn.');
  }
  return segments;
}

export function assertExternalFile(pathValue, label) {
  if (!pathValue || !pathValue.startsWith(sep)) {
    throw new Error(`${label} phải là file tuyệt đối nằm ngoài workspace.`);
  }
  const target = resolve(pathValue);
  assertExternalDirectory(resolve(target, '..'), `${label} chứa`);
  return target;
}

export function runProcess(command, args, options = {}) {
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
      else {
        reject(
          new Error(
            `${command} mã hóa/giải mã thất bại (${code}): ${stderr.trim()}`,
          ),
        );
      }
    });
  });
}

export async function withTemporaryDirectory(prefix, operation) {
  const directory = await mkdtemp(resolve(tmpdir(), prefix));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function readHiddenPassphrase(prompt) {
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

export async function createEncryptedArchive({
  sourcePath,
  archivePath,
  passphrase,
}) {
  try {
    assertPassphrase(passphrase);
    const source = await assertExpectedFile(sourcePath);
    if (source.size === 0) {
      throw new Error('Archive plaintext không được rỗng.');
    }
    const archive = assertExternalFile(archivePath, 'Archive mã hóa');
    await runWithPassphrase(
      'openssl',
      [...OPENSSL_ARGS, '-pass', 'stdin', '-in', sourcePath, '-out', archive],
      passphrase,
    );
    await assertExpectedFile(archive);
    const receiptPath = `${archive}.receipt.json`;
    await writeFile(
      receiptPath,
      `${JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          encryptedArchive: basename(archive),
          sha256: await sha256File(archive),
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    return receiptPath;
  } finally {
    if (typeof sourcePath === 'string') {
      await rm(sourcePath, { force: true });
    }
  }
}

export async function decryptArchive({
  archivePath,
  destinationPath,
  passphrase,
}) {
  assertPassphrase(passphrase);
  const archive = assertExternalFile(archivePath, 'Archive mã hóa');
  await assertExpectedFile(archive);
  await runWithPassphrase(
    'openssl',
    [
      ...OPENSSL_ARGS,
      '-d',
      '-pass',
      'stdin',
      '-in',
      archive,
      '-out',
      destinationPath,
    ],
    passphrase,
  );
  await assertExpectedFile(destinationPath);
}

export async function verifyBackupReceipt({ archivePath, receiptPath }) {
  const archive = assertExternalFile(archivePath, 'Archive mã hóa');
  const receipt = assertExternalFile(receiptPath, 'Receipt backup');
  await assertExpectedFile(archive);
  await assertExpectedFile(receipt);
  const value = JSON.parse(await readFile(receipt, 'utf8'));
  if (
    typeof value?.encryptedArchive !== 'string' ||
    value.encryptedArchive !== basename(archive) ||
    !/^[a-f0-9]{64}$/i.test(value?.sha256 ?? '')
  ) {
    throw new Error('Receipt backup không hợp lệ.');
  }
  if ((await sha256File(archive)) !== value.sha256.toLowerCase()) {
    throw new Error('Checksum archive mã hóa không khớp receipt.');
  }
}

export async function verifyExtractedBackup(root, { run = runProcess } = {}) {
  const imagesRoot = resolve(root, 'product-images');
  const manifestPath = resolve(imagesRoot, 'product-images-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest?.objects)) {
    throw new Error('Manifest product-images không hợp lệ.');
  }

  for (const object of manifest.objects) {
    if (
      typeof object?.path !== 'string' ||
      !Number.isSafeInteger(object?.bytes) ||
      object.bytes < 0 ||
      !/^[a-f0-9]{64}$/i.test(object?.sha256 ?? '')
    ) {
      throw new Error('Object trong manifest product-images không hợp lệ.');
    }
    const filePath = resolve(imagesRoot, ...safeStoragePath(object.path));
    const relation = filePath.slice(imagesRoot.length + 1);
    if (!relation || filePath === imagesRoot) {
      throw new Error('Đường dẫn object trong manifest không an toàn.');
    }
    if ((await stat(filePath)).size !== object.bytes) {
      throw new Error(`Kích thước ảnh không khớp manifest: ${object.path}`);
    }
    const actual = createHash('sha256')
      .update(await readFile(filePath))
      .digest('hex');
    if (actual !== object.sha256.toLowerCase()) {
      throw new Error(`Checksum ảnh không khớp manifest: ${object.path}`);
    }
  }

  const dumpPath = resolve(root, 'application.dump');
  let hasDatabaseDump = false;
  try {
    await assertExpectedFile(dumpPath);
    hasDatabaseDump = true;
  } catch {
    // Image-only archive is valid and does not include a PostgreSQL dump.
  }
  if (hasDatabaseDump) await run('pg_restore', ['--list', dumpPath]);

  return { imageObjectCount: manifest.objects.length, hasDatabaseDump };
}
