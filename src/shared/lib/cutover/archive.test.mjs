import { createHash, randomBytes } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertExternalFile,
  createEncryptedArchive,
  decryptArchive,
  verifyBackupReceipt,
  verifyExtractedBackup,
  withTemporaryDirectory,
} from '../../../../scripts/cutover-archive.mjs';

const temporaryDirectories = [];

async function temporaryDirectory(prefix) {
  const directory = await mkdtemp(resolve(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('cutover archive safeguards', () => {
  it('rejects archives inside the workspace', () => {
    expect(() =>
      assertExternalFile(
        resolve(process.cwd(), 'backup.tar.gz.enc'),
        'archive',
      ),
    ).toThrow('nằm ngoài workspace');
  });

  it('creates an encrypted archive with a receipt that verifies', async () => {
    const directory = await temporaryDirectory('tuenhi-archive-test-');
    const sourcePath = resolve(directory, 'source.tar.gz');
    const archivePath = resolve(directory, 'source.tar.gz.enc');
    await writeFile(sourcePath, randomBytes(128), { mode: 0o600 });

    const receiptPath = await createEncryptedArchive({
      sourcePath,
      archivePath,
      passphrase: 'a unique test passphrase that is long enough',
    });

    await expect(
      verifyBackupReceipt({ archivePath, receiptPath }),
    ).resolves.toBe(undefined);
    await expect(stat(sourcePath)).rejects.toThrow();
    expect(await stat(archivePath)).toBeTruthy();
  });

  it('rejects a receipt when the encrypted archive checksum changes', async () => {
    const directory = await temporaryDirectory('tuenhi-receipt-test-');
    const archivePath = resolve(directory, 'backup.tar.gz.enc');
    const receiptPath = resolve(directory, 'backup.tar.gz.enc.receipt.json');
    await writeFile(archivePath, 'changed archive', { mode: 0o600 });
    await writeFile(
      receiptPath,
      JSON.stringify({
        encryptedArchive: 'backup.tar.gz.enc',
        sha256: '0'.repeat(64),
      }),
      { mode: 0o600 },
    );

    await expect(
      verifyBackupReceipt({ archivePath, receiptPath }),
    ).rejects.toThrow(/checksum/i);
  });

  it('removes plaintext if archive encryption fails', async () => {
    const directory = await temporaryDirectory(
      'tuenhi-encryption-failure-test-',
    );
    const sourcePath = resolve(directory, 'source.tar.gz');
    await writeFile(sourcePath, randomBytes(64), { mode: 0o600 });

    await expect(
      createEncryptedArchive({
        sourcePath,
        archivePath: resolve(directory, 'missing', 'source.tar.gz.enc'),
        passphrase: 'a unique test passphrase that is long enough',
      }),
    ).rejects.toThrow();

    await expect(stat(sourcePath)).rejects.toThrow();
  });

  it('removes an invalid plaintext archive before reporting the error', async () => {
    const directory = await temporaryDirectory('tuenhi-empty-archive-test-');
    const sourcePath = resolve(directory, 'empty.tar.gz');
    await writeFile(sourcePath, '', { mode: 0o600 });

    await expect(
      createEncryptedArchive({
        sourcePath,
        archivePath: resolve(directory, 'empty.tar.gz.enc'),
        passphrase: 'a unique test passphrase that is long enough',
      }),
    ).rejects.toThrow('không được rỗng');

    await expect(stat(sourcePath)).rejects.toThrow();
  });

  it('verifies every image checksum and validates a database dump', async () => {
    const directory = await temporaryDirectory('tuenhi-verify-test-');
    const imagesDirectory = resolve(directory, 'product-images', 'products');
    await mkdir(imagesDirectory, { recursive: true, mode: 0o700 });
    const imagePath = resolve(imagesDirectory, 'a.jpg');
    await writeFile(imagePath, 'image data', { mode: 0o600 });
    await writeFile(
      resolve(directory, 'product-images', 'product-images-manifest.json'),
      `${JSON.stringify({
        objects: [
          {
            path: 'products/a.jpg',
            bytes: 10,
            sha256: createHash('sha256').update('image data').digest('hex'),
          },
        ],
      })}\n`,
      { mode: 0o600 },
    );
    await writeFile(resolve(directory, 'application.dump'), 'test dump', {
      mode: 0o600,
    });
    const calls = [];
    await expect(
      verifyExtractedBackup(directory, {
        run: async (_command, args) => {
          calls.push(args);
        },
      }),
    ).resolves.toMatchObject({
      imageObjectCount: 1,
      hasDatabaseDump: true,
    });
    expect(calls).toEqual([['--list', resolve(directory, 'application.dump')]]);
    await writeFile(imagePath, 'tamperdata', { mode: 0o600 });
    await expect(verifyExtractedBackup(directory)).rejects.toThrow(/checksum/i);
  });

  it('always removes decrypted staging when verification fails', async () => {
    let stagingDirectory;

    await expect(
      withTemporaryDirectory('tuenhi-decrypted-test-', async (directory) => {
        stagingDirectory = directory;
        throw new Error('forced verification failure');
      }),
    ).rejects.toThrow('forced verification failure');

    await expect(stat(stagingDirectory)).rejects.toThrow();
  });

  it('decrypts an archive without retaining its unencrypted source', async () => {
    const directory = await temporaryDirectory('tuenhi-decrypt-test-');
    const sourcePath = resolve(directory, 'source.tar.gz');
    const archivePath = resolve(directory, 'source.tar.gz.enc');
    const decryptedPath = resolve(directory, 'decrypted.tar.gz');
    const source = randomBytes(64);
    await writeFile(sourcePath, source, { mode: 0o600 });

    await createEncryptedArchive({
      sourcePath,
      archivePath,
      passphrase: 'another unique test passphrase long enough',
    });
    await decryptArchive({
      archivePath,
      destinationPath: decryptedPath,
      passphrase: 'another unique test passphrase long enough',
    });

    expect(await readFile(decryptedPath)).toEqual(source);
  });
});
