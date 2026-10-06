import { validateCanonicalNumber } from './canonical-number';
export type PaymentAllocation = {
  cashAmount: string;
  bankTransferAmount: string;
};

export function moneyFromMinor(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n)
    .toString()
    .padStart(2, '0')
    .replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}
function minor(value: string) {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function calculatePaymentAllocation(
  total: string,
  cashAmount: string,
  bankTransferAmount: string,
):
  | { ok: true; paid: string; debt: string; allocation: PaymentAllocation }
  | { ok: false; message: string } {
  const values = [total, cashAmount || '0', bankTransferAmount || '0'];
  for (const value of values) {
    const valid = validateCanonicalNumber(value, {
      kind: 'money',
      precision: 20,
      required: true,
    });
    if (!valid.ok) return { ok: false, message: valid.message };
  }
  const sum = minor(total),
    cash = minor(cashAmount || '0'),
    bank = minor(bankTransferAmount || '0');
  const paid = cash + bank;
  if (paid > sum)
    return { ok: false, message: 'Tiền thanh toán vượt tổng hóa đơn.' };
  return {
    ok: true,
    paid: moneyFromMinor(paid),
    debt: moneyFromMinor(sum - paid),
    allocation: {
      cashAmount: moneyFromMinor(cash),
      bankTransferAmount: moneyFromMinor(bank),
    },
  };
}
