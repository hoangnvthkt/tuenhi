import { z } from 'zod';
import {
  clearPendingFinancialCommand,
  getFinancialCorrelationId,
  readPendingFinancialCommands,
  type FinancialCommandName,
  type FinancialCommandOutcome,
  type FinancialCommandStorage,
  type PendingFinancialCommand,
} from './financial-command';

export { FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT } from './financial-command';

export const FINANCIAL_COMMAND_RECONCILE_EVENT =
  'tuenhi:financial-command:reconcile';

export function requestFinancialCommandReconciliation() {
  window.dispatchEvent(new Event(FINANCIAL_COMMAND_RECONCILE_EVENT));
}

const cachedSuccessEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.unknown(),
  error: z.null(),
  correlationId: z.uuid(),
});

export type PendingFinancialCommandRecovery = {
  commandName: FinancialCommandName;
  entityId: string;
  requestId: string;
  createdAt: string;
  label: string;
  actionRoute: string;
  status: 'CHECKING' | 'NOT_FOUND' | 'RESOLVED' | 'ERROR';
  correlationId?: string;
};

const commandLabels: Record<FinancialCommandName, string> = {
  'customer.debt.collect': 'Thu nợ khách hàng',
  'customer.debt.adjust': 'Chỉnh số dư công nợ',
  'sale.complete': 'Thanh toán hóa đơn',
  'sale.cancel': 'Hủy hóa đơn',
  'sale.return.complete': 'Hoàn tất trả hàng',
  'purchase.post': 'Ghi phiếu nhập',
  'purchase.reverse': 'Đảo phiếu nhập',
  'stock.count.post': 'Ghi phiếu kiểm kho',
  'opening.post': 'Ghi phiếu mở sổ',
  'cash.voucher.create': 'Lập phiếu thu/chi',
  'cash.voucher.cancel': 'Hủy phiếu thu/chi',
  'cash.opening.set': 'Nhập số dư đầu quỹ',
  'cash.shift.open': 'Mở ca',
  'cash.shift.close': 'Đóng ca',
  'supplier.debt.pay': 'Trả nợ nhà cung cấp',
  'supplier.debt.opening': 'Nhập nợ đầu kỳ NCC',
  'purchase.return.post': 'Trả hàng nhập',
  'inventory.writeoff.post': 'Xuất hủy',
  'lots.assign': 'Gán lô đầu kỳ',
};

export function financialCommandActionRoute(
  commandName: FinancialCommandName,
  entityId: string,
) {
  if (
    commandName === 'customer.debt.collect' ||
    commandName === 'customer.debt.adjust'
  )
    return `/more/customers/${entityId}`;
  if (commandName === 'sale.complete' || commandName === 'sale.cancel') {
    return `/sales/${entityId}`;
  }
  if (commandName === 'sale.return.complete') return `/returns/${entityId}`;
  if (commandName === 'purchase.post' || commandName === 'purchase.reverse') {
    return `/more/purchases/${entityId}`;
  }
  if (commandName === 'stock.count.post') return `/stock-counts/${entityId}`;
  if (commandName === 'cash.shift.open' || commandName === 'cash.shift.close')
    return '/cash-book/shift';
  if (commandName.startsWith('cash.')) return '/cash-book';
  if (commandName.startsWith('supplier.debt.'))
    return `/more/supplier-debts?supplier=${entityId}`;
  if (commandName === 'purchase.return.post')
    return `/more/purchases/${entityId}/return`;
  if (commandName === 'inventory.writeoff.post') return '/more/write-offs';
  if (commandName === 'lots.assign') return `/products/${entityId}`;
  return `/more/inventory/opening/${entityId}`;
}

function recoveryFromMarker(
  marker: PendingFinancialCommand,
  status: PendingFinancialCommandRecovery['status'],
  correlationId?: string,
): PendingFinancialCommandRecovery {
  return {
    commandName: marker.commandName,
    entityId: marker.entityId,
    requestId: marker.idempotencyKey,
    createdAt: marker.createdAt,
    label: commandLabels[marker.commandName],
    actionRoute: financialCommandActionRoute(
      marker.commandName,
      marker.entityId,
    ),
    status,
    correlationId,
  };
}

export function listPendingFinancialCommandRecoveries(
  userId: string,
  storage?: FinancialCommandStorage,
) {
  return readPendingFinancialCommands(storage)
    .filter((marker) => marker.userId === userId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .map((marker) => recoveryFromMarker(marker, 'NOT_FOUND'));
}

export async function reconcilePendingFinancialCommands({
  userId,
  lookup,
  storage,
}: {
  userId: string;
  lookup: (
    commandName: FinancialCommandName,
    idempotencyKey: string,
  ) => Promise<FinancialCommandOutcome>;
  storage?: FinancialCommandStorage;
}) {
  const markers = readPendingFinancialCommands(storage)
    .filter((marker) => marker.userId === userId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const recoveries: PendingFinancialCommandRecovery[] = [];

  for (const marker of markers) {
    try {
      const outcome = await lookup(marker.commandName, marker.idempotencyKey);
      if (outcome.status === 'NOT_FOUND') {
        recoveries.push(recoveryFromMarker(marker, 'NOT_FOUND'));
        continue;
      }
      const cached = cachedSuccessEnvelopeSchema.safeParse(outcome.response);
      if (!cached.success) {
        recoveries.push(recoveryFromMarker(marker, 'ERROR'));
        continue;
      }
      clearPendingFinancialCommand(marker, storage);
      recoveries.push(
        recoveryFromMarker(marker, 'RESOLVED', cached.data.correlationId),
      );
    } catch (error) {
      recoveries.push(
        recoveryFromMarker(marker, 'ERROR', getFinancialCorrelationId(error)),
      );
    }
  }

  return recoveries;
}
