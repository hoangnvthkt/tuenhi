import { compareCanonicalNumbers } from '@/shared/lib/numeric/canonical-number';
import type { Invoice } from '../api/sales-schemas';
import { formatCashAmount } from './cash-change';

export type CancelRefund = { cash: string; bank: string; debt: string };

/** Money the shop gives back and debt it clears when this invoice is cancelled. */
export function cancelRefund(invoice: Invoice): CancelRefund {
  const totals = invoice.totals;
  const hasSplit = totals.cashAmount !== undefined;
  return {
    cash: hasSplit
      ? totals.cashAmount!
      : invoice.sale.paymentMethod === 'CASH'
        ? totals.capturedAmount
        : '0',
    bank: hasSplit
      ? (totals.bankTransferAmount ?? '0')
      : invoice.sale.paymentMethod === 'BANK_TRANSFER'
        ? totals.capturedAmount
        : '0',
    debt: totals.outstandingAmount ?? '0',
  };
}

function positive(value: string) {
  return compareCanonicalNumbers(value, '0') > 0;
}

/** Short lines, only for amounts that are not zero. */
export function cancelRefundLines(refund: CancelRefund): string[] {
  const lines: string[] = [];
  if (positive(refund.cash))
    lines.push(`Trả lại tiền mặt: ${formatCashAmount(refund.cash)}`);
  if (positive(refund.bank))
    lines.push(`Trả lại chuyển khoản: ${formatCashAmount(refund.bank)}`);
  if (positive(refund.debt))
    lines.push(`Xóa nợ còn lại: ${formatCashAmount(refund.debt)}`);
  return lines;
}

export function cancelConfirmMessage(refund: CancelRefund): string {
  const lines = cancelRefundLines(refund);
  return [
    'Xác nhận hủy hóa đơn? Tồn kho được hoàn lại.',
    ...(lines.length ? lines : ['Không có tiền cần trả lại.']),
  ].join('\n');
}
