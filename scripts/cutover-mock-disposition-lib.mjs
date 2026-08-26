import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const SHA256 = /^[0-9a-f]{64}$/;
const storageBuckets = new Set([
  'payment-proofs',
  'product-images',
  'store-branding',
]);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeStoragePaths(value) {
  if (!Array.isArray(value))
    throw new Error('STORAGE_PATHS_INVALID: Danh sách Storage phải là mảng.');
  const normalized = value.map((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.bucketId !== 'string' ||
      typeof item.path !== 'string' ||
      !storageBuckets.has(item.bucketId) ||
      !item.path.trim() ||
      item.path
        .split('/')
        .some((part) => !part || part === '.' || part === '..')
    ) {
      throw new Error('STORAGE_PATHS_INVALID: Object Storage không hợp lệ.');
    }
    return { bucketId: item.bucketId, path: item.path };
  });
  normalized.sort(
    (left, right) =>
      left.bucketId.localeCompare(right.bucketId) ||
      left.path.localeCompare(right.path),
  );
  if (
    normalized.some(
      (item, index) =>
        index > 0 &&
        item.bucketId === normalized[index - 1].bucketId &&
        item.path === normalized[index - 1].path,
    )
  ) {
    throw new Error('STORAGE_PATHS_INVALID: Object Storage bị lặp.');
  }
  return normalized;
}

export function validateApprovedManifest(value) {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof value.sha256 !== 'string' ||
    !SHA256.test(value.sha256) ||
    typeof value.canonicalJson !== 'string' ||
    typeof value.manifest !== 'object' ||
    value.manifest === null
  ) {
    throw new Error('MANIFEST_SHA256_INVALID: Tệp manifest không hợp lệ.');
  }
  if (sha256(value.canonicalJson) !== value.sha256) {
    throw new Error('MANIFEST_SHA256_INVALID: SHA-256 manifest không khớp.');
  }
  let parsed;
  try {
    parsed = JSON.parse(value.canonicalJson);
  } catch {
    throw new Error('MANIFEST_SHA256_INVALID: Canonical JSON không hợp lệ.');
  }
  if (!isDeepStrictEqual(parsed, value.manifest)) {
    throw new Error('MANIFEST_SHA256_INVALID: Nội dung manifest không khớp.');
  }
  if (
    value.manifest.lifecycle !== 'OWNER_PILOT' ||
    typeof value.manifest.keepStoreSettings !== 'boolean' ||
    typeof value.manifest.keepSalesChannels !== 'boolean'
  ) {
    throw new Error(
      'MANIFEST_SHA256_INVALID: Manifest không thuộc Owner Pilot.',
    );
  }
  normalizeStoragePaths(value.manifest.storagePaths);
  return value;
}

export function validateRealDataVerification(value, { stage, expectEmpty }) {
  if (
    typeof value !== 'object' ||
    value === null ||
    value.stage !== stage ||
    typeof value.operationalEmpty !== 'boolean' ||
    typeof value.counts !== 'object' ||
    value.counts === null ||
    typeof value.financial !== 'object' ||
    value.financial === null
  ) {
    throw new Error(
      'REAL_DATA_VERIFICATION_INVALID: Phản hồi đối soát dữ liệu không hợp lệ.',
    );
  }
  if (expectEmpty && !value.operationalEmpty) {
    throw new Error(
      'OPERATIONAL_DATA_NOT_EMPTY: Cloud vẫn còn dữ liệu vận hành, không được bắt đầu nhập dữ liệu thật.',
    );
  }
  return value;
}

export async function disposeStoragePaths({
  receiptId,
  paths,
  remove,
  finalize,
}) {
  if (typeof receiptId !== 'string' || !receiptId) {
    throw new Error('MOCK_RECEIPT_INVALID: Receipt Storage không hợp lệ.');
  }
  const normalized = normalizeStoragePaths(paths);
  for (const bucketId of storageBuckets) {
    const objectPaths = normalized
      .filter((item) => item.bucketId === bucketId)
      .map((item) => item.path);
    if (objectPaths.length > 0) await remove(bucketId, objectPaths);
  }
  await finalize(receiptId, normalized);
  return normalized;
}
