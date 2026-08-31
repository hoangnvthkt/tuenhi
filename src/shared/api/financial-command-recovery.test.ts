import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeFinancialCommand,
  FinancialOutcomeUnknownError,
  FinancialTransportError,
  readPendingFinancialCommands,
  type FinancialCommandName,
} from './financial-command';
import {
  financialCommandActionRoute,
  listPendingFinancialCommandRecoveries,
  reconcilePendingFinancialCommands,
} from './financial-command-recovery';

const userId = '10000000-0000-4000-8000-000000000001';
const otherUserId = '10000000-0000-4000-8000-000000000002';
const entityId = '20000000-0000-4000-8000-000000000001';

async function seedPending({
  actorId = userId,
  commandName = 'sale.complete',
  targetId = entityId,
  requestId = '30000000-0000-4000-8000-000000000001',
}: {
  actorId?: string;
  commandName?: FinancialCommandName;
  targetId?: string;
  requestId?: string;
} = {}) {
  await expect(
    executeFinancialCommand({
      userId: actorId,
      commandName,
      entityId: targetId,
      createId: () => requestId,
      now: () => new Date('2026-08-31T07:00:00.000Z'),
      invoke: async () => {
        throw new FinancialTransportError();
      },
      lookup: async () => ({ status: 'NOT_FOUND', response: null }),
      parseCachedResponse: (response) => response as never,
      isOnline: () => false,
      wait: async () => undefined,
    }),
  ).rejects.toBeInstanceOf(FinancialOutcomeUnknownError);
}

beforeEach(() => localStorage.clear());

describe('financial command recovery', () => {
  it('lists only the current user markers with their document routes', async () => {
    await seedPending();
    await seedPending({
      actorId: otherUserId,
      requestId: '30000000-0000-4000-8000-000000000002',
    });

    expect(listPendingFinancialCommandRecoveries(userId)).toEqual([
      expect.objectContaining({
        status: 'NOT_FOUND',
        requestId: '30000000-0000-4000-8000-000000000001',
        actionRoute: `/sales/${entityId}`,
      }),
    ]);
  });

  it('clears a resolved marker only after validating its cached success envelope', async () => {
    await seedPending();

    const result = await reconcilePendingFinancialCommands({
      userId,
      lookup: async () => ({
        status: 'RESOLVED',
        response: {
          ok: true,
          data: { saleId: entityId },
          error: null,
          correlationId: '40000000-0000-4000-8000-000000000001',
        },
      }),
    });

    expect(result).toEqual([
      expect.objectContaining({
        status: 'RESOLVED',
        requestId: '30000000-0000-4000-8000-000000000001',
        correlationId: '40000000-0000-4000-8000-000000000001',
      }),
    ]);
    expect(readPendingFinancialCommands()).toEqual([]);
  });

  it('keeps NOT_FOUND and malformed resolved markers for later reconciliation', async () => {
    await seedPending();
    const notFound = await reconcilePendingFinancialCommands({
      userId,
      lookup: async () => ({ status: 'NOT_FOUND', response: null }),
    });
    expect(notFound[0]?.status).toBe('NOT_FOUND');
    expect(readPendingFinancialCommands()).toHaveLength(1);

    const malformed = await reconcilePendingFinancialCommands({
      userId,
      lookup: async () => ({
        status: 'RESOLVED',
        response: { ok: true, data: {} },
      }),
    });
    expect(malformed[0]?.status).toBe('ERROR');
    expect(readPendingFinancialCommands()).toHaveLength(1);
  });

  it('looks up markers sequentially to avoid a burst after reconnect', async () => {
    await seedPending();
    await seedPending({
      commandName: 'stock.count.post',
      targetId: '20000000-0000-4000-8000-000000000002',
      requestId: '30000000-0000-4000-8000-000000000002',
    });
    let active = 0;
    let maximumActive = 0;

    await reconcilePendingFinancialCommands({
      userId,
      lookup: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        return { status: 'NOT_FOUND', response: null };
      },
    });

    expect(maximumActive).toBe(1);
  });
});

describe('financialCommandActionRoute', () => {
  it.each([
    ['sale.complete', `/sales/${entityId}`],
    ['sale.cancel', `/sales/${entityId}`],
    ['sale.return.complete', `/returns/${entityId}`],
    ['purchase.post', `/more/purchases/${entityId}`],
    ['purchase.reverse', `/more/purchases/${entityId}`],
    ['stock.count.post', `/stock-counts/${entityId}`],
    ['opening.post', `/more/inventory/opening/${entityId}`],
  ] as const)('maps %s to its document route', (commandName, expected) => {
    expect(financialCommandActionRoute(commandName, entityId)).toBe(expected);
  });
});
