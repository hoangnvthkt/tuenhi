import { describe, expect, it } from 'vitest';
import { calculatePaymentAllocation } from './payment-allocation';
describe('payment allocations', () => {
  it('computes exact paid and debt amounts for KH01', () => {
    expect(calculatePaymentAllocation('100000', '30000', '50000')).toEqual({
      ok: true,
      paid: '80000',
      debt: '20000',
      allocation: { cashAmount: '30000', bankTransferAmount: '50000' },
    });
  });
  it('keeps large fractional amounts exact', () => {
    expect(
      calculatePaymentAllocation(
        '9007199254740993.01',
        '9007199254740992.99',
        '0.01',
      ),
    ).toMatchObject({ ok: true, paid: '9007199254740993', debt: '0.01' });
  });
  it.each(['-1', 'NaN', '1.001', '1,00', '1000000000000000000'])(
    'rejects invalid money %s',
    (value) => {
      expect(calculatePaymentAllocation('100000', value, '0').ok).toBe(false);
    },
  );
  it('rejects overpayment and treats empty fields as zero', () => {
    expect(calculatePaymentAllocation('100', '80', '30').ok).toBe(false);
    expect(calculatePaymentAllocation('100', '', '')).toMatchObject({
      ok: true,
      paid: '0',
      debt: '100',
    });
  });
});
