import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  disposeStoragePaths,
  normalizeStoragePaths,
  validateRealDataVerification,
  validateApprovedManifest,
} from './cutover-mock-disposition-lib.mjs';
import {
  assertExternalFile,
  assertExternalDirectory,
  valueForFlag,
} from './cutover-lib.mjs';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function manifestFile() {
  const manifest = {
    version: 1,
    lifecycle: 'OWNER_PILOT',
    keepStoreSettings: true,
    keepSalesChannels: true,
    records: {},
    fingerprints: {},
    storagePaths: [
      { bucketId: 'payment-proofs', path: 'return/r1.webp' },
      { bucketId: 'product-images', path: 'product/p1.webp' },
    ],
  };
  const canonicalJson = JSON.stringify(manifest);
  return { manifest, canonicalJson, sha256: sha256(canonicalJson) };
}

test('validates only an approved manifest with a matching canonical hash', () => {
  const valid = manifestFile();
  assert.deepEqual(validateApprovedManifest(valid), valid);
  assert.throws(
    () => validateApprovedManifest({ ...valid, sha256: '0'.repeat(64) }),
    /MANIFEST_SHA256_INVALID/,
  );
});

test('normalizes unique allowed Storage paths in deterministic order', () => {
  assert.deepEqual(
    normalizeStoragePaths([
      { bucketId: 'product-images', path: 'product/p1.webp' },
      { bucketId: 'payment-proofs', path: 'return/r1.webp' },
    ]),
    [
      { bucketId: 'payment-proofs', path: 'return/r1.webp' },
      { bucketId: 'product-images', path: 'product/p1.webp' },
    ],
  );
  assert.throws(
    () =>
      normalizeStoragePaths([
        { bucketId: 'product-images', path: 'product/p1.webp' },
        { bucketId: 'product-images', path: 'product/p1.webp' },
      ]),
    /STORAGE_PATHS_INVALID/,
  );
});

test('does not finalize the receipt after a Storage deletion failure', async () => {
  const calls = [];
  await assert.rejects(
    () =>
      disposeStoragePaths({
        receiptId: '10000000-0000-4000-8000-000000000001',
        paths: manifestFile().manifest.storagePaths,
        remove: async (bucketId) => {
          calls.push(`remove:${bucketId}`);
          throw new Error('storage unavailable');
        },
        finalize: async () => calls.push('finalize'),
      }),
    /storage unavailable/,
  );
  assert.deepEqual(calls, ['remove:payment-proofs']);
});

test('refuses manifest paths inside the workspace or outside its external directory', () => {
  assert.throws(
    () => assertExternalDirectory(process.cwd(), 'CUTOVER_MANIFEST_DIR'),
    /ngoài workspace/,
  );
  const directory = '/Users/admin/TueNhi-Backups';
  assert.equal(
    assertExternalFile(directory, `${directory}/manifest.json`, 'MANIFEST'),
    `${directory}/manifest.json`,
  );
  assert.throws(
    () => assertExternalFile(directory, '/tmp/manifest.json', 'MANIFEST'),
    /nằm trong CUTOVER_MANIFEST_DIR/,
  );
});

test('requires an empty Cloud response before beginning real-data import', () => {
  const empty = {
    stage: 'EMPTY',
    operationalEmpty: true,
    counts: {},
    financial: { eventCount: 0, netRevenue: '0', netCogs: '0' },
  };
  assert.deepEqual(
    validateRealDataVerification(empty, { stage: 'EMPTY', expectEmpty: true }),
    empty,
  );

  assert.throws(
    () =>
      validateRealDataVerification(
        { ...empty, operationalEmpty: false },
        { stage: 'EMPTY', expectEmpty: true },
      ),
    /OPERATIONAL_DATA_NOT_EMPTY/,
  );
});

test('rejects a reconciliation response for the wrong requested milestone', () => {
  assert.throws(
    () =>
      validateRealDataVerification(
        {
          stage: 'CATALOG',
          operationalEmpty: false,
          counts: {},
          financial: { eventCount: 0, netRevenue: '0', netCogs: '0' },
        },
        { stage: 'OPENING', expectEmpty: false },
      ),
    /REAL_DATA_VERIFICATION_INVALID/,
  );
});

test('accepts both conventional forms of a command-line flag value', () => {
  assert.equal(valueForFlag('--stage', ['--stage', 'catalog']), 'catalog');
  assert.equal(valueForFlag('--stage', ['--stage=opening']), 'opening');
});
