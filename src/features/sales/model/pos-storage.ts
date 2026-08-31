import { z } from 'zod';
import {
  INTEGER_FINAL,
  MONEY_EDITING,
  MONEY_FINAL,
} from '@/shared/lib/numeric/canonical-number';
import type { PosCartItem } from './pos-types';

const POS_CART_PREFIX = 'tuenhi:pos:cart:';
const POS_CART_V2_PREFIX = 'tuenhi:pos:cart:v2:';
const POS_EDITOR_LEASE_PREFIX = 'tuenhi:pos:editor:v1:';
const POS_EDITOR_LEASE_TTL_MS = 60_000;

type StorageLike = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;

const cartIdentitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('NEW') }),
  z.object({ kind: z.literal('DRAFT'), saleId: z.uuid() }),
]);

export type PosCartIdentity = z.infer<typeof cartIdentitySchema>;

const cartItemSchema = z.object({
  productId: z.uuid(),
  productName: z.string().min(1).max(500),
  sku: z.string().min(1).max(100),
  unitName: z.string().min(1).max(100),
  quantity: z.string().regex(INTEGER_FINAL).max(18),
  unitSalePrice: z.string().regex(MONEY_FINAL).max(24),
  lineDiscountAmount: z.string().regex(MONEY_EDITING).max(24),
  lineOrder: z.number().int().nonnegative(),
  onHandQty: z.string().regex(INTEGER_FINAL).max(18),
});

const emptyOrUuid = z.union([z.literal(''), z.uuid()]);

const snapshotSchema = z.object({
  version: z.literal(2),
  userId: z.uuid(),
  identity: cartIdentitySchema,
  serverVersion: z.number().int().nonnegative().nullable(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }),
  lastWriterTabId: z.uuid(),
  items: z.array(cartItemSchema).max(500),
  channelId: emptyOrUuid,
  customerId: emptyOrUuid,
  orderDiscount: z.string().regex(MONEY_EDITING).max(24),
  note: z.string().max(2_000),
});

export type PosCartSnapshotV2 = z.infer<typeof snapshotSchema>;

const legacyCartSchema = z.object({
  items: z.array(z.unknown()).max(500),
  channelId: emptyOrUuid,
  customerId: emptyOrUuid,
  orderDiscount: z.string().regex(MONEY_EDITING).max(24),
  note: z.string().max(2_000),
});

const editorLeaseSchema = z.object({
  version: z.literal(1),
  userId: z.uuid(),
  identity: cartIdentitySchema,
  tabId: z.uuid(),
  updatedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type PosEditorLeaseV1 = z.infer<typeof editorLeaseSchema>;

export function posCartStorageKey(userId: string) {
  return `${POS_CART_PREFIX}${userId}`;
}

function identityStoragePart(identity: PosCartIdentity) {
  return identity.kind === 'NEW' ? 'new' : `draft:${identity.saleId}`;
}

export function posCartSnapshotStorageKey(
  userId: string,
  identity: PosCartIdentity,
) {
  return `${POS_CART_V2_PREFIX}${userId}:${identityStoragePart(identity)}`;
}

export function posEditorLeaseStorageKey(
  userId: string,
  identity: PosCartIdentity,
) {
  return `${POS_EDITOR_LEASE_PREFIX}${userId}:${identityStoragePart(identity)}`;
}

function sameIdentity(left: PosCartIdentity, right: PosCartIdentity) {
  return (
    left.kind === right.kind &&
    (left.kind === 'NEW' ||
      (right.kind === 'DRAFT' && left.saleId === right.saleId))
  );
}

export function sanitizePersistedPosCartItems(value: unknown): PosCartItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const result = cartItemSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

export function readPosCartSnapshot(
  userId: string,
  identity: PosCartIdentity,
  storage: StorageLike = window.localStorage,
) {
  try {
    const raw = storage.getItem(posCartSnapshotStorageKey(userId, identity));
    if (!raw) return undefined;
    const result = snapshotSchema.safeParse(JSON.parse(raw));
    if (
      !result.success ||
      result.data.userId !== userId ||
      !sameIdentity(result.data.identity, identity)
    ) {
      return undefined;
    }
    return result.data;
  } catch {
    return undefined;
  }
}

export function writePosCartSnapshot(
  snapshot: PosCartSnapshotV2,
  storage: StorageLike = window.localStorage,
) {
  const validated = snapshotSchema.parse(snapshot);
  const key = posCartSnapshotStorageKey(validated.userId, validated.identity);
  try {
    storage.setItem(key, JSON.stringify(validated));
    const persisted = readPosCartSnapshot(
      validated.userId,
      validated.identity,
      storage,
    );
    if (
      !persisted ||
      persisted.revision !== validated.revision ||
      persisted.lastWriterTabId !== validated.lastWriterTabId
    ) {
      throw new Error('POS_CART_PERSIST_FAILED');
    }
  } catch {
    throw new Error('POS_CART_PERSIST_FAILED');
  }
}

export function resolvePosCartSnapshot(
  snapshot: PosCartSnapshotV2 | undefined,
  serverVersion: number | null,
):
  | { status: 'NONE' }
  | { status: 'STALE' }
  | { status: 'RESTORE'; snapshot: PosCartSnapshotV2 } {
  if (!snapshot) return { status: 'NONE' };
  if (
    snapshot.identity.kind === 'DRAFT' &&
    snapshot.serverVersion !== serverVersion
  ) {
    return { status: 'STALE' };
  }
  return { status: 'RESTORE', snapshot };
}

export function removePosCartSnapshot(
  userId: string,
  identity: PosCartIdentity,
  storage: StorageLike = window.localStorage,
) {
  try {
    storage.removeItem(posCartSnapshotStorageKey(userId, identity));
  } catch {
    // Keeping a stale local snapshot is safer than affecting another cart.
  }
}

export function migrateLegacyPosCart({
  userId,
  tabId,
  now,
  storage = window.localStorage,
}: {
  userId: string;
  tabId: string;
  now: Date;
  storage?: StorageLike;
}): { snapshot: PosCartSnapshotV2; discardedLineCount: number } | undefined {
  const existing = readPosCartSnapshot(userId, { kind: 'NEW' }, storage);
  if (existing) return { snapshot: existing, discardedLineCount: 0 };

  const legacyKey = posCartStorageKey(userId);
  try {
    const raw = storage.getItem(legacyKey);
    if (!raw) return undefined;
    const parsed = legacyCartSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return undefined;

    const items = sanitizePersistedPosCartItems(parsed.data.items);
    const snapshot = snapshotSchema.parse({
      version: 2,
      userId,
      identity: { kind: 'NEW' },
      serverVersion: null,
      revision: 1,
      updatedAt: now.toISOString(),
      lastWriterTabId: tabId,
      items,
      channelId: parsed.data.channelId,
      customerId: parsed.data.customerId,
      orderDiscount: parsed.data.orderDiscount,
      note: parsed.data.note,
    });
    writePosCartSnapshot(snapshot, storage);
    storage.removeItem(legacyKey);
    return {
      snapshot,
      discardedLineCount: parsed.data.items.length - items.length,
    };
  } catch {
    return undefined;
  }
}

function readEditorLease(
  userId: string,
  identity: PosCartIdentity,
  storage: StorageLike,
) {
  try {
    const raw = storage.getItem(posEditorLeaseStorageKey(userId, identity));
    if (!raw) return undefined;
    const parsed = editorLeaseSchema.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      parsed.data.userId !== userId ||
      !sameIdentity(parsed.data.identity, identity)
    ) {
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}

function persistEditorLease(lease: PosEditorLeaseV1, storage: StorageLike) {
  try {
    storage.setItem(
      posEditorLeaseStorageKey(lease.userId, lease.identity),
      JSON.stringify(lease),
    );
    return (
      readEditorLease(lease.userId, lease.identity, storage)?.tabId ===
      lease.tabId
    );
  } catch {
    return false;
  }
}

type LeaseInput = {
  userId: string;
  identity: PosCartIdentity;
  tabId: string;
  storage?: StorageLike;
};

export function acquirePosEditorLease({
  userId,
  identity,
  tabId,
  now,
  storage = window.localStorage,
  force = false,
}: LeaseInput & { now: Date; force?: boolean }) {
  const current = readEditorLease(userId, identity, storage);
  if (
    current &&
    current.tabId !== tabId &&
    new Date(current.expiresAt).getTime() > now.getTime() &&
    !force
  ) {
    return false;
  }

  return persistEditorLease(
    editorLeaseSchema.parse({
      version: 1,
      userId,
      identity,
      tabId,
      updatedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + POS_EDITOR_LEASE_TTL_MS,
      ).toISOString(),
    }),
    storage,
  );
}

export function ownsPosEditorLease({
  userId,
  identity,
  tabId,
  storage = window.localStorage,
  now = new Date(),
}: LeaseInput & { now?: Date }) {
  const current = readEditorLease(userId, identity, storage);
  return (
    current?.tabId === tabId &&
    new Date(current.expiresAt).getTime() > now.getTime()
  );
}

export function writeOwnedPosCartSnapshot({
  snapshot,
  tabId,
  now,
  storage = window.localStorage,
}: {
  snapshot: PosCartSnapshotV2;
  tabId: string;
  now: Date;
  storage?: StorageLike;
}) {
  if (
    snapshot.lastWriterTabId !== tabId ||
    !ownsPosEditorLease({
      userId: snapshot.userId,
      identity: snapshot.identity,
      tabId,
      now,
      storage,
    })
  ) {
    return false;
  }
  try {
    writePosCartSnapshot(snapshot, storage);
    return true;
  } catch {
    return false;
  }
}

export function refreshPosEditorLease({
  userId,
  identity,
  tabId,
  now,
  storage = window.localStorage,
}: LeaseInput & { now: Date }) {
  if (!ownsPosEditorLease({ userId, identity, tabId, storage, now })) {
    return false;
  }
  return acquirePosEditorLease({
    userId,
    identity,
    tabId,
    now,
    storage,
    force: true,
  });
}

export function releasePosEditorLease({
  userId,
  identity,
  tabId,
  storage = window.localStorage,
}: LeaseInput) {
  if (readEditorLease(userId, identity, storage)?.tabId !== tabId) return;
  try {
    storage.removeItem(posEditorLeaseStorageKey(userId, identity));
  } catch {
    // The lease expires automatically if the browser cannot remove it.
  }
}
