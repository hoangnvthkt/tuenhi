import { MONEY_FINAL } from '@/shared/lib/numeric/canonical-number';
export type CashChange = {
  status: 'EMPTY' | 'INVALID' | 'INSUFFICIENT' | 'SUFFICIENT';
  change: string | null;
  shortfall: string | null;
};
function minor(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function canonical(value: bigint) {
  const cents = (value % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return `${value / 100n}${cents ? `.${cents}` : ''}`;
}
export function calculateCashChange(
  total: string,
  tendered: string,
): CashChange {
  if (!MONEY_FINAL.test(total))
    return { status: 'INVALID', change: null, shortfall: null };
  if (tendered === '')
    return { status: 'EMPTY', change: null, shortfall: null };
  if (!MONEY_FINAL.test(tendered))
    return { status: 'INVALID', change: null, shortfall: null };
  const difference = minor(tendered) - minor(total);
  return difference < 0n
    ? {
        status: 'INSUFFICIENT',
        change: null,
        shortfall: canonical(-difference),
      }
    : { status: 'SUFFICIENT', change: canonical(difference), shortfall: null };
}

/** VND display without a Number conversion; keep meaningful fractional digits. */
export function formatCashAmount(value: string): string {
  if (!MONEY_FINAL.test(value)) return '—';
  const [whole, fraction = ''] = value.split('.');
  const decimals = fraction.replace(/0+$/, '');
  return `${new Intl.NumberFormat('vi-VN').format(BigInt(whole!))}${decimals ? ',' + decimals : ''} ₫`;
}
