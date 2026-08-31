import { describe, expect, it } from 'vitest';
import {
  acquirePosEditorLease,
  migrateLegacyPosCart,
  ownsPosEditorLease,
  posCartSnapshotStorageKey,
  readPosCartSnapshot,
  refreshPosEditorLease,
  releasePosEditorLease,
  resolvePosCartSnapshot,
  sanitizePersistedPosCartItems,
  writeOwnedPosCartSnapshot,
  writePosCartSnapshot,
  type PosCartIdentity,
  type PosCartSnapshotV2,
} from './pos-storage';

const validLine = {
  productId: '10000000-0000-4000-8000-000000000001',
  productName: 'Sản phẩm',
  sku: 'SP-001',
  unitName: 'Cái',
  quantity: '1000',
  unitSalePrice: '150000',
  lineDiscountAmount: '0',
  lineOrder: 0,
  onHandQty: '1000',
};

describe('sanitizePersistedPosCartItems', () => {
  it('keeps canonical integer quantities and drops old fractional quantities', () => {
    expect(
      sanitizePersistedPosCartItems([
        validLine,
        {
          ...validLine,
          productId: '10000000-0000-4000-8000-000000000002',
          quantity: '1.5',
        },
      ]),
    ).toEqual([validLine]);
  });
});

class MemoryStorage implements Storage {
  #items = new Map<string, string>();

  get length() {
    return this.#items.size;
  }

  clear() {
    this.#items.clear();
  }

  getItem(key: string) {
    return this.#items.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#items.delete(key);
  }

  setItem(key: string, value: string) {
    this.#items.set(key, value);
  }
}

const userId = '10000000-0000-4000-8000-000000000099';
const otherUserId = '10000000-0000-4000-8000-000000000098';
const identity: PosCartIdentity = { kind: 'NEW' };

function snapshot(overrides: Partial<PosCartSnapshotV2> = {}) {
  return {
    version: 2 as const,
    userId,
    identity,
    serverVersion: null,
    revision: 1,
    updatedAt: '2026-08-31T07:00:00.000Z',
    lastWriterTabId: '20000000-0000-4000-8000-000000000001',
    items: [validLine],
    channelId: '10000000-0000-4000-8000-000000000001',
    customerId: '',
    orderDiscount: '0',
    note: '',
    ...overrides,
  } satisfies PosCartSnapshotV2;
}

describe('POS cart snapshot V2', () => {
  it('round-trips a validated snapshot only for its user and cart identity', () => {
    const storage = new MemoryStorage();
    writePosCartSnapshot(snapshot(), storage);

    expect(readPosCartSnapshot(userId, identity, storage)).toEqual(snapshot());
    expect(readPosCartSnapshot(otherUserId, identity, storage)).toBeUndefined();
  });

  it('rejects a snapshot whose payload identity does not match its storage key', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      posCartSnapshotStorageKey(userId, identity),
      JSON.stringify(snapshot({ userId: otherUserId })),
    );

    expect(readPosCartSnapshot(userId, identity, storage)).toBeUndefined();
  });

  it('migrates a valid legacy cart and removes the old key after verified persistence', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      `tuenhi:pos:cart:${userId}`,
      JSON.stringify({
        items: [validLine],
        channelId: '10000000-0000-4000-8000-000000000001',
        customerId: '',
        orderDiscount: '0',
        note: 'Giữ lại',
      }),
    );

    const result = migrateLegacyPosCart({
      userId,
      tabId: '20000000-0000-4000-8000-000000000001',
      now: new Date('2026-08-31T07:30:00.000Z'),
      storage,
    });

    expect(result?.invalidPayload).toBe(false);
    if (!result || result.invalidPayload) throw new Error('Expected migration');
    expect(result.snapshot.version).toBe(2);
    expect(result.snapshot.note).toBe('Giữ lại');
    expect(result.discardedLineCount).toBe(0);
    expect(storage.getItem(`tuenhi:pos:cart:${userId}`)).toBeNull();
    expect(readPosCartSnapshot(userId, identity, storage)).toEqual(
      result.snapshot,
    );
  });

  it('reports and drops invalid legacy lines without accepting malformed cart fields', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      `tuenhi:pos:cart:${userId}`,
      JSON.stringify({
        items: [validLine, { ...validLine, quantity: '1.5' }],
        channelId: '10000000-0000-4000-8000-000000000001',
        customerId: '',
        orderDiscount: '0',
        note: '',
      }),
    );

    const result = migrateLegacyPosCart({
      userId,
      tabId: '20000000-0000-4000-8000-000000000001',
      now: new Date('2026-08-31T07:30:00.000Z'),
      storage,
    });

    expect(result?.invalidPayload).toBe(false);
    if (!result || result.invalidPayload) throw new Error('Expected migration');
    expect(result.snapshot.items).toEqual([validLine]);
    expect(result.discardedLineCount).toBe(1);
  });

  it('reports a malformed legacy payload without deleting the recoverable source key', () => {
    const storage = new MemoryStorage();
    const legacyKey = `tuenhi:pos:cart:${userId}`;
    storage.setItem(legacyKey, '{not-json');

    const result = migrateLegacyPosCart({
      userId,
      tabId: '20000000-0000-4000-8000-000000000001',
      now: new Date('2026-08-31T07:30:00.000Z'),
      storage,
    });

    expect(result).toEqual({ invalidPayload: true });
    expect(storage.getItem(legacyKey)).toBe('{not-json');
    expect(readPosCartSnapshot(userId, identity, storage)).toBeUndefined();
  });

  it('uses the server draft when the persisted server version is stale', () => {
    const draftIdentity = {
      kind: 'DRAFT' as const,
      saleId: '30000000-0000-4000-8000-000000000001',
    };
    expect(
      resolvePosCartSnapshot(
        snapshot({ identity: draftIdentity, serverVersion: 4 }),
        5,
      ),
    ).toEqual({ status: 'STALE' });
    expect(
      resolvePosCartSnapshot(
        snapshot({ identity: draftIdentity, serverVersion: 5 }),
        5,
      ),
    ).toEqual({
      status: 'RESTORE',
      snapshot: snapshot({ identity: draftIdentity, serverVersion: 5 }),
    });
  });
});

describe('POS editor lease', () => {
  const tabA = '20000000-0000-4000-8000-000000000001';
  const tabB = '20000000-0000-4000-8000-000000000002';
  const startedAt = new Date('2026-08-31T08:00:00.000Z');

  it('allows one tab to edit and requires explicit takeover by another tab', () => {
    const storage = new MemoryStorage();

    expect(
      acquirePosEditorLease({
        userId,
        identity,
        tabId: tabA,
        now: startedAt,
        storage,
      }),
    ).toBe(true);
    expect(
      acquirePosEditorLease({
        userId,
        identity,
        tabId: tabB,
        now: new Date(startedAt.getTime() + 1_000),
        storage,
      }),
    ).toBe(false);
    expect(
      acquirePosEditorLease({
        userId,
        identity,
        tabId: tabB,
        now: new Date(startedAt.getTime() + 2_000),
        storage,
        force: true,
      }),
    ).toBe(true);
    const afterTakeover = new Date(startedAt.getTime() + 3_000);
    expect(
      ownsPosEditorLease({
        userId,
        identity,
        tabId: tabA,
        storage,
        now: afterTakeover,
      }),
    ).toBe(false);
    expect(
      ownsPosEditorLease({
        userId,
        identity,
        tabId: tabB,
        storage,
        now: afterTakeover,
      }),
    ).toBe(true);
  });

  it('refreshes only the owner and lets another tab recover an expired lease', () => {
    const storage = new MemoryStorage();
    acquirePosEditorLease({
      userId,
      identity,
      tabId: tabA,
      now: startedAt,
      storage,
    });

    expect(
      refreshPosEditorLease({
        userId,
        identity,
        tabId: tabB,
        now: new Date(startedAt.getTime() + 10_000),
        storage,
      }),
    ).toBe(false);
    expect(
      acquirePosEditorLease({
        userId,
        identity,
        tabId: tabB,
        now: new Date(startedAt.getTime() + 60_001),
        storage,
      }),
    ).toBe(true);
  });

  it('releases a lease only when called by its owner', () => {
    const storage = new MemoryStorage();
    acquirePosEditorLease({
      userId,
      identity,
      tabId: tabA,
      now: startedAt,
      storage,
    });

    releasePosEditorLease({ userId, identity, tabId: tabB, storage });
    const beforeExpiry = new Date(startedAt.getTime() + 1_000);
    expect(
      ownsPosEditorLease({
        userId,
        identity,
        tabId: tabA,
        storage,
        now: beforeExpiry,
      }),
    ).toBe(true);
    releasePosEditorLease({ userId, identity, tabId: tabA, storage });
    expect(
      ownsPosEditorLease({
        userId,
        identity,
        tabId: tabA,
        storage,
        now: beforeExpiry,
      }),
    ).toBe(false);
  });

  it('prevents a tab without the lease from writing a cart snapshot', () => {
    const storage = new MemoryStorage();
    acquirePosEditorLease({
      userId,
      identity,
      tabId: tabA,
      now: startedAt,
      storage,
    });

    expect(
      writeOwnedPosCartSnapshot({
        snapshot: snapshot({ lastWriterTabId: tabB }),
        tabId: tabB,
        now: startedAt,
        storage,
      }),
    ).toBe(false);
    expect(readPosCartSnapshot(userId, identity, storage)).toBeUndefined();
  });
});
