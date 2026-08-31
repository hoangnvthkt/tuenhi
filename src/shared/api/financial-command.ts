import { z } from 'zod';

export const financialCommandNameSchema = z.enum([
  'sale.complete',
  'sale.cancel',
  'sale.return.complete',
  'purchase.post',
  'purchase.reverse',
  'stock.count.post',
  'opening.post',
]);

export type FinancialCommandName = z.infer<typeof financialCommandNameSchema>;

const pendingFinancialCommandSchema = z.object({
  version: z.literal(1),
  userId: z.uuid(),
  commandName: financialCommandNameSchema,
  entityId: z.uuid(),
  idempotencyKey: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type PendingFinancialCommand = z.infer<
  typeof pendingFinancialCommandSchema
>;

export type FinancialCommandStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;
export type FinancialCommandOutcome =
  | { status: 'RESOLVED'; response: unknown }
  | { status: 'NOT_FOUND'; response: null };

const storageKeyPrefix = 'tuenhi:pending-financial-command:v1:';
export const FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT =
  'tuenhi:financial-command:markers-changed';

function notifyBrowserMarkersChanged(storage: FinancialCommandStorage) {
  if (typeof window === 'undefined') return;
  try {
    if (storage === window.localStorage) {
      window.dispatchEvent(new Event(FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT));
    }
  } catch {
    // Browser storage diagnostics must never expose or replace command errors.
  }
}

export function isPendingFinancialCommandStorageKey(key: string | null) {
  return Boolean(key?.startsWith(storageKeyPrefix));
}

export class FinancialBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinancialBusinessError';
  }
}

export class FinancialTransportError extends Error {
  constructor() {
    super('Không thể kết nối máy chủ. Kết quả thao tác có thể chưa xác định.');
    this.name = 'FinancialTransportError';
  }
}

export class FinancialOutcomeUnknownError extends Error {
  constructor(readonly requestId: string) {
    super(
      'Chưa xác định được kết quả. Không tạo yêu cầu mới trước khi đối soát.',
    );
    this.name = 'FinancialOutcomeUnknownError';
  }
}

export class FinancialStorageUnavailableError extends Error {
  constructor() {
    super(
      'Không thể lưu mã yêu cầu an toàn trên thiết bị. Giao dịch chưa được gửi.',
    );
    this.name = 'FinancialStorageUnavailableError';
  }
}

export function getFinancialCorrelationId(error: unknown) {
  if (!(error instanceof FinancialBusinessError)) return undefined;
  if (!('correlationId' in error)) return undefined;
  return typeof error.correlationId === 'string'
    ? error.correlationId
    : undefined;
}

class FinancialUnclassifiedOutcomeError extends Error {}

function browserStorage(): FinancialCommandStorage {
  try {
    return window.localStorage;
  } catch {
    throw new FinancialStorageUnavailableError();
  }
}

function pendingStorageKey(
  input: Pick<PendingFinancialCommand, 'userId' | 'commandName' | 'entityId'>,
) {
  return `${storageKeyPrefix}${input.userId}:${input.commandName}:${input.entityId}`;
}

export function readPendingFinancialCommands(
  storage: FinancialCommandStorage = browserStorage(),
): PendingFinancialCommand[] {
  const commands: PendingFinancialCommand[] = [];
  let length: number;
  try {
    length = storage.length;
  } catch {
    return commands;
  }
  for (let index = 0; index < length; index += 1) {
    try {
      const key = storage.key(index);
      if (!key?.startsWith(storageKeyPrefix)) continue;
      const value = storage.getItem(key);
      if (!value) continue;
      const result = pendingFinancialCommandSchema.safeParse(JSON.parse(value));
      if (result.success) commands.push(result.data);
    } catch {
      // Diagnostic enumeration isolates malformed or concurrently removed entries.
    }
  }
  return commands;
}

export function findPendingFinancialCommand(
  input: Pick<PendingFinancialCommand, 'userId' | 'commandName' | 'entityId'>,
  storage: FinancialCommandStorage = browserStorage(),
) {
  let value: string | null;
  try {
    value = storage.getItem(pendingStorageKey(input));
  } catch {
    throw new FinancialStorageUnavailableError();
  }
  if (value === null) return undefined;

  try {
    const result = pendingFinancialCommandSchema.safeParse(JSON.parse(value));
    if (!result.success || !commandMatches(result.data, input)) {
      throw new FinancialStorageUnavailableError();
    }
    return result.data;
  } catch {
    throw new FinancialStorageUnavailableError();
  }
}

function persistPendingCommand(
  storage: FinancialCommandStorage,
  command: PendingFinancialCommand,
) {
  const key = pendingStorageKey(command);
  try {
    storage.setItem(key, JSON.stringify(command));
    const persisted = storage.getItem(key);
    const parsed = persisted
      ? pendingFinancialCommandSchema.safeParse(JSON.parse(persisted))
      : null;
    if (
      !parsed?.success ||
      parsed.data.idempotencyKey !== command.idempotencyKey
    ) {
      throw new FinancialStorageUnavailableError();
    }
  } catch {
    throw new FinancialStorageUnavailableError();
  }
}

function commandMatches(
  command: PendingFinancialCommand,
  input: Pick<PendingFinancialCommand, 'userId' | 'commandName' | 'entityId'>,
) {
  return (
    command.userId === input.userId &&
    command.commandName === input.commandName &&
    command.entityId === input.entityId
  );
}

function removePendingCommand(
  storage: FinancialCommandStorage,
  input: Pick<PendingFinancialCommand, 'userId' | 'commandName' | 'entityId'>,
) {
  try {
    storage.removeItem(pendingStorageKey(input));
    notifyBrowserMarkersChanged(storage);
  } catch {
    // A stale marker is safer than losing the idempotency key before certainty.
  }
}

function unknownFinancialOutcome(
  pending: PendingFinancialCommand,
  storage: FinancialCommandStorage,
) {
  notifyBrowserMarkersChanged(storage);
  return new FinancialOutcomeUnknownError(pending.idempotencyKey);
}

export function clearPendingFinancialCommand(
  command: PendingFinancialCommand,
  storage: FinancialCommandStorage = browserStorage(),
) {
  removePendingCommand(storage, command);
}

async function executeFinancialCommandUnlocked<T>({
  userId,
  commandName,
  entityId,
  invoke,
  lookup,
  parseCachedResponse,
  storage = browserStorage(),
  createId = () => crypto.randomUUID(),
  now = () => new Date(),
  isOnline = () => typeof navigator === 'undefined' || navigator.onLine,
  wait = (milliseconds) =>
    new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)),
}: {
  userId: string;
  commandName: FinancialCommandName;
  entityId: string;
  invoke: (idempotencyKey: string) => Promise<T>;
  lookup: (
    commandName: FinancialCommandName,
    idempotencyKey: string,
  ) => Promise<FinancialCommandOutcome>;
  parseCachedResponse: (response: unknown) => T;
  storage?: FinancialCommandStorage;
  createId?: () => string;
  now?: () => Date;
  isOnline?: () => boolean;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<T> {
  const identity = { userId, commandName, entityId };
  let pending = findPendingFinancialCommand(identity, storage);
  const isResuming = Boolean(pending);

  if (!pending) {
    pending = pendingFinancialCommandSchema.parse({
      version: 1,
      ...identity,
      idempotencyKey: createId(),
      createdAt: now().toISOString(),
    });
    persistPendingCommand(storage, pending);
  }

  const invokeAndFinalize = async () => {
    try {
      const result = await invoke(pending.idempotencyKey);
      removePendingCommand(storage, identity);
      return result;
    } catch (error) {
      if (error instanceof FinancialBusinessError) {
        removePendingCommand(storage, identity);
        throw error;
      }
      if (error instanceof FinancialTransportError) throw error;
      throw new FinancialUnclassifiedOutcomeError();
    }
  };

  const reconcile = async (): Promise<
    { resolved: false } | { resolved: true; value: T }
  > => {
    for (const delay of [0, 1_000, 2_000]) {
      if (delay > 0) await wait(delay);
      let outcome: FinancialCommandOutcome;
      try {
        outcome = await lookup(commandName, pending.idempotencyKey);
      } catch (error) {
        if (error instanceof FinancialBusinessError) throw error;
        // A failed lookup leaves the original outcome unknown; continue the schedule.
        continue;
      }
      if (outcome.status === 'RESOLVED') {
        try {
          const result = parseCachedResponse(outcome.response);
          removePendingCommand(storage, identity);
          return { resolved: true, value: result };
        } catch (error) {
          if (error instanceof FinancialBusinessError) {
            removePendingCommand(storage, identity);
            throw error;
          }
          throw unknownFinancialOutcome(pending, storage);
        }
      }
    }
    return { resolved: false };
  };

  if (isResuming) {
    const recovered = await reconcile();
    if (recovered.resolved) return recovered.value;
  } else {
    try {
      return await invokeAndFinalize();
    } catch (error) {
      if (error instanceof FinancialBusinessError) throw error;
    }

    const recovered = await reconcile();
    if (recovered.resolved) return recovered.value;
  }

  if (!isOnline()) {
    throw unknownFinancialOutcome(pending, storage);
  }

  try {
    return await invokeAndFinalize();
  } catch (error) {
    if (error instanceof FinancialBusinessError) throw error;
    throw unknownFinancialOutcome(pending, storage);
  }
}

export async function executeFinancialCommand<T>(
  input: Parameters<typeof executeFinancialCommandUnlocked<T>>[0],
): Promise<T> {
  const lockManager =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { locks?: LockManager }).locks;
  if (!lockManager) return executeFinancialCommandUnlocked(input);

  const lockName = pendingStorageKey(input);
  return lockManager.request(lockName, () =>
    executeFinancialCommandUnlocked(input),
  );
}
