import { describe, expect, it } from 'vitest';
import { invoiceFixture } from '../testing/invoice-fixture';
import type { Invoice } from '../api/sales-schemas';
import {
  cancelConfirmMessage,
  cancelRefund,
  cancelRefundLines,
} from './cancel-refund';

function invoice(
  totals: Partial<Invoice['totals']>,
  method: Invoice['sale']['paymentMethod'] = 'CASH',
): Invoice {
  const base = structuredClone(invoiceFixture);
  return {
    ...base,
    sale: { ...base.sale, paymentMethod: method },
    totals: { ...base.totals, ...totals },
  };
}

describe('cancel refund', () => {
  it('shows cash already collected on a debt invoice and the debt it clears', () => {
    const refund = cancelRefund(
      invoice({
        netTotal: '100000',
        capturedAmount: '30000',
        cashAmount: '30000',
        bankTransferAmount: '0',
        outstandingAmount: '70000',
      }),
    );
    expect(refund).toEqual({ cash: '30000', bank: '0', debt: '70000' });
    expect(cancelRefundLines(refund)).toEqual([
      'Trả lại tiền mặt: 30.000 ₫',
      'Xóa nợ còn lại: 70.000 ₫',
    ]);
  });

  it('splits a mixed payment by method', () => {
    const refund = cancelRefund(
      invoice(
        {
          capturedAmount: '100000',
          cashAmount: '40000',
          bankTransferAmount: '60000',
          outstandingAmount: '0',
        },
        'BANK_TRANSFER',
      ),
    );
    expect(cancelConfirmMessage(refund)).toBe(
      'Xác nhận hủy hóa đơn? Tồn kho được hoàn lại.\nTrả lại tiền mặt: 40.000 ₫\nTrả lại chuyển khoản: 60.000 ₫',
    );
  });

  it('falls back to the payment method for invoices without a split', () => {
    const base = invoice({ capturedAmount: '174000' }, 'BANK_TRANSFER');
    delete base.totals.cashAmount;
    delete base.totals.bankTransferAmount;
    delete base.totals.outstandingAmount;
    expect(cancelRefund(base)).toEqual({
      cash: '0',
      bank: '174000',
      debt: '0',
    });
  });
});
