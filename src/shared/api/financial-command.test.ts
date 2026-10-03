import { describe, expect, it, vi } from 'vitest';
import {
  executeFinancialCommand,
  FinancialBusinessError,
  FinancialOutcomeUnknownError,
  FinancialStorageUnavailableError,
  FinancialTransportError,
  readPendingFinancialCommands,
} from './financial-command';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const baseInput = {
  userId: '10000000-0000-4000-8000-000000000001',
  commandName: 'sale.complete' as const,
  entityId: '20000000-0000-4000-8000-000000000001',
};

describe('executeFinancialCommand', () => {
  it('removes the pending marker after a confirmed success', async () => {
    const storage = new MemoryStorage();

    const result = await executeFinancialCommand({
      ...baseInput,
      storage,
      createId: () => '30000000-0000-4000-8000-000000000001',
      invoke: async () => ({ saleId: baseInput.entityId }),
      lookup: async () => ({ status: 'NOT_FOUND', response: null }),
      parseCachedResponse: (response) => response as { saleId: string },
      wait: async () => undefined,
    });

    expect(result).toEqual({ saleId: baseInput.entityId });
    expect(readPendingFinancialCommands(storage)).toEqual([]);
  });

  it('recovers a lost response by parsing the cached outcome', async () => {
    const storage = new MemoryStorage();
    const keys: string[] = [];

    const result = await executeFinancialCommand({
      ...baseInput,
      storage,
      createId: () => '30000000-0000-4000-8000-000000000002',
      invoke: async (key) => {
        keys.push(key);
        throw new FinancialTransportError();
      },
      lookup: async () => ({
        status: 'RESOLVED',
        response: { saleNumber: 'HD000001' },
      }),
      parseCachedResponse: (response) => response as { saleNumber: string },
      wait: async () => undefined,
    });

    expect(result).toEqual({ saleNumber: 'HD000001' });
    expect(keys).toEqual(['30000000-0000-4000-8000-000000000002']);
    expect(readPendingFinancialCommands(storage)).toEqual([]);
  });

  it('retries once with the same key when no cached outcome is found', async () => {
    const storage = new MemoryStorage();
    const keys: string[] = [];
    let invocation = 0;

    await executeFinancialCommand({
      ...baseInput,
      storage,
      createId: () => '30000000-0000-4000-8000-000000000003',
      invoke: async (key) => {
        keys.push(key);
        invocation += 1;
        if (invocation === 1) throw new FinancialTransportError();
        return { completed: true };
      },
      lookup: async () => ({ status: 'NOT_FOUND', response: null }),
      parseCachedResponse: (response) => response as { completed: boolean },
      wait: async () => undefined,
    });

    expect(keys).toEqual([
      '30000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000003',
    ]);
  });

  it('retains the request marker when the outcome remains unknown', async () => {
    const storage = new MemoryStorage();
    const invoke = vi.fn().mockRejectedValue(new FinancialTransportError());

    const promise = executeFinancialCommand({
      ...baseInput,
      storage,
      createId: () => '30000000-0000-4000-8000-000000000004',
      now: () => new Date('2026-08-28T00:00:00.000Z'),
      invoke,
      lookup: async () => ({ status: 'NOT_FOUND', response: null }),
      parseCachedResponse: (response) => response as never,
      isOnline: () => false,
      wait: async () => undefined,
    });

    await expect(promise).rejects.toMatchObject({
      requestId: '30000000-0000-4000-8000-000000000004',
    });
    await expect(promise).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(readPendingFinancialCommands(storage)).toEqual([
      {
        version: 1,
        userId: baseInput.userId,
        commandName: baseInput.commandName,
        entityId: baseInput.entityId,
        idempotencyKey: '30000000-0000-4000-8000-000000000004',
        createdAt: '2026-08-28T00:00:00.000Z',
      },
    ]);
  });

  it('clears a pending marker after a definitive business error', async () => {
    const storage = new MemoryStorage();
    const businessError = new FinancialBusinessError('Tồn kho không đủ.');

    await expect(
      executeFinancialCommand({
        ...baseInput,
        storage,
        createId: () => '30000000-0000-4000-8000-000000000005',
        invoke: async () => {
          throw businessError;
        },
        lookup: async () => ({ status: 'NOT_FOUND', response: null }),
        parseCachedResponse: (response) => response as never,
        wait: async () => undefined,
      }),
    ).rejects.toBe(businessError);

    expect(readPendingFinancialCommands(storage)).toEqual([]);
  });

  it('does not retry when a cached outcome contains a definitive business error', async () => {
    const storage = new MemoryStorage();
    const invoke = vi.fn().mockRejectedValue(new FinancialTransportError());
    const businessError = new FinancialBusinessError('Tồn kho không đủ.');

    await expect(
      executeFinancialCommand({
        ...baseInput,
        storage,
        createId: () => '30000000-0000-4000-8000-000000000008',
        invoke,
        lookup: async () => ({ status: 'RESOLVED', response: { ok: false } }),
        parseCachedResponse: () => {
          throw businessError;
        },
        wait: async () => undefined,
      }),
    ).rejects.toBe(businessError);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(readPendingFinancialCommands(storage)).toEqual([]);
  });

  it('keeps markers isolated by user, command and entity', async () => {
    const storage = new MemoryStorage();
    const createId = vi
      .fn()
      .mockReturnValueOnce('30000000-0000-4000-8000-000000000006')
      .mockReturnValueOnce('30000000-0000-4000-8000-000000000007');
    const fail = () => Promise.reject(new FinancialTransportError());

    await expect(
      executeFinancialCommand({
        ...baseInput,
        storage,
        createId,
        invoke: fail,
        lookup: async () => ({ status: 'NOT_FOUND', response: null }),
        parseCachedResponse: (response) => response as never,
        wait: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);
    await expect(
      executeFinancialCommand({
        ...baseInput,
        entityId: '20000000-0000-4000-8000-000000000002',
        storage,
        createId,
        invoke: fail,
        lookup: async () => ({ status: 'NOT_FOUND', response: null }),
        parseCachedResponse: (response) => response as never,
        wait: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);

    expect(readPendingFinancialCommands(storage)).toHaveLength(2);
  });

  it('reconciles an existing marker before invoking the command again', async () => {
    const storage = new MemoryStorage();
    const firstInvoke = vi
      .fn()
      .mockRejectedValue(new FinancialTransportError());

    await expect(
      executeFinancialCommand({
        ...baseInput,
        storage,
        createId: () => '30000000-0000-4000-8000-000000000012',
        invoke: firstInvoke,
        lookup: async () => ({ status: 'NOT_FOUND', response: null }),
        parseCachedResponse: (response) => response as never,
        isOnline: () => false,
        wait: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);

    const resumedInvoke = vi.fn();
    const result = await executeFinancialCommand({
      ...baseInput,
      storage,
      invoke: resumedInvoke,
      lookup: async () => ({
        status: 'RESOLVED',
        response: { saleNumber: 'HD000012' },
      }),
      parseCachedResponse: (response) => response as { saleNumber: string },
      wait: async () => undefined,
    });

    expect(result).toEqual({ saleNumber: 'HD000012' });
    expect(resumedInvoke).not.toHaveBeenCalled();
    expect(readPendingFinancialCommands(storage)).toEqual([]);
  });

  it('retains the marker when the command response cannot be classified', async () => {
    const storage = new MemoryStorage();

    await expect(
      executeFinancialCommand({
        ...baseInput,
        storage,
        createId: () => '30000000-0000-4000-8000-000000000009',
        invoke: async () => {
          throw new Error('Malformed success envelope');
        },
        lookup: async () => ({ status: 'NOT_FOUND', response: null }),
        parseCachedResponse: (response) => response as never,
        isOnline: () => false,
        wait: async () => undefined,
      }),
    ).rejects.toMatchObject({
      requestId: '30000000-0000-4000-8000-000000000009',
    });

    expect(readPendingFinancialCommands(storage)).toHaveLength(1);
  });

  it('retains the marker when a resolved cached response is malformed', async () => {
    const storage = new MemoryStorage();
    const invoke = vi.fn().mockRejectedValue(new FinancialTransportError());

    await expect(
      executeFinancialCommand({
        ...baseInput,
        storage,
        createId: () => '30000000-0000-4000-8000-000000000010',
        invoke,
        lookup: async () => ({ status: 'RESOLVED', response: { ok: true } }),
        parseCachedResponse: () => {
          throw new Error('Malformed cached envelope');
        },
        wait: async () => undefined,
      }),
    ).rejects.toMatchObject({
      requestId: '30000000-0000-4000-8000-000000000010',
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(readPendingFinancialCommands(storage)).toHaveLength(1);
  });

  it('surfaces a safe lookup business error without discarding the marker', async () => {
    const storage = new MemoryStorage();
    const lookupError = new FinancialBusinessError(
      'Phiên đăng nhập không còn hợp lệ.',
    );
    const invoke = vi.fn().mockRejectedValue(new FinancialTransportError());

    await expect(
      executeFinancialCommand({
        ...baseInput,
        storage,
        createId: () => '30000000-0000-4000-8000-000000000013',
        invoke,
        lookup: async () => {
          throw lookupError;
        },
        parseCachedResponse: (response) => response as never,
        wait: async () => undefined,
      }),
    ).rejects.toBe(lookupError);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(readPendingFinancialCommands(storage)).toHaveLength(1);
  });

  it('fails closed before invoking when the marker cannot be persisted', async () => {
    const storage = new MemoryStorage();
    const invoke = vi.fn();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    await expect(
      executeFinancialCommand({
        ...baseInput,
        storage,
        createId: () => '30000000-0000-4000-8000-000000000011',
        invoke,
        lookup: async () => ({ status: 'NOT_FOUND', response: null }),
        parseCachedResponse: (response) => response as never,
        wait: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(FinancialStorageUnavailableError);

    expect(invoke).not.toHaveBeenCalled();
  });

  it('fails closed when the deterministic marker is malformed', async () => {
    const storage = new MemoryStorage();

    await expect(
      executeFinancialCommand({
        ...baseInput,
        storage,
        createId: () => '30000000-0000-4000-8000-000000000014',
        invoke: async () => {
          throw new FinancialTransportError();
        },
        lookup: async () => ({ status: 'NOT_FOUND', response: null }),
        parseCachedResponse: (response) => response as never,
        isOnline: () => false,
        wait: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);

    const markerKey = storage.key(0);
    expect(markerKey).not.toBeNull();
    storage.setItem(markerKey!, '{"version":1,"idempotencyKey":"broken"}');
    const invoke = vi.fn();

    await expect(
      executeFinancialCommand({
        ...baseInput,
        storage,
        invoke,
        lookup: async () => ({ status: 'NOT_FOUND', response: null }),
        parseCachedResponse: (response) => response as never,
        wait: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(FinancialStorageUnavailableError);

    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps valid diagnostic entries when a neighboring marker is malformed', async () => {
    const storage = new MemoryStorage();
    const fail = () => Promise.reject(new FinancialTransportError());
    const createId = vi
      .fn()
      .mockReturnValueOnce('30000000-0000-4000-8000-000000000015')
      .mockReturnValueOnce('30000000-0000-4000-8000-000000000016');

    for (const entityId of [
      '20000000-0000-4000-8000-000000000015',
      '20000000-0000-4000-8000-000000000016',
    ]) {
      await expect(
        executeFinancialCommand({
          ...baseInput,
          entityId,
          storage,
          createId,
          invoke: fail,
          lookup: async () => ({ status: 'NOT_FOUND', response: null }),
          parseCachedResponse: (response) => response as never,
          isOnline: () => false,
          wait: async () => undefined,
        }),
      ).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);
    }

    const malformedKey = storage.key(0);
    expect(malformedKey).not.toBeNull();
    storage.setItem(malformedKey!, '{not-json');

    const diagnostics = readPendingFinancialCommands(storage);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.idempotencyKey).toBe(
      '30000000-0000-4000-8000-000000000016',
    );
  });
});

it('does not create another request when a recovery races with marker resolution', async () => {
  const storage = new MemoryStorage();
  const invoke = vi.fn();
  const lookup = vi.fn();
  await expect(
    executeFinancialCommand({
      ...baseInput,
      storage,
      resumeOnly: true,
      invoke,
      lookup,
      parseCachedResponse: (value) => value,
    }),
  ).rejects.toBeInstanceOf(FinancialBusinessError);
  expect(invoke).not.toHaveBeenCalled();
  expect(lookup).not.toHaveBeenCalled();
  expect(storage.length).toBe(0);
});
