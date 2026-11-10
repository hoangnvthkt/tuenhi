import type { RevenueReport } from '../api/report-schemas';
import { addIsoDays } from './report-period';

function toCents(value: string): bigint {
  const negative = value.startsWith('-');
  const [integer = '0', fraction = ''] = value.replace(/^[-+]/, '').split('.');
  const cents =
    BigInt(integer || '0') * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -cents : cents;
}

function centsToDecimal(cents: bigint) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const fraction = absolute % 100n;
  const text =
    fraction === 0n
      ? (absolute / 100n).toString()
      : `${absolute / 100n}.${fraction.toString().padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/** Bar length in percent of `max` (display only, exact cents in BigInt). */
export function moneyShare(value: string, max: string) {
  const amount = toCents(value);
  const total = toCents(max);
  if (total <= 0n || amount <= 0n) return 0;
  if (amount >= total) return 100;
  return Number((amount * 1000n) / total) / 10;
}

export type RevenueBucket = {
  key: string;
  label: string;
  from: string;
  to: string;
  netRevenue: string;
};

const MAX_DAILY_BARS = 31;

/** Every day of the range (zero when no sale), or every month for long ranges. */
export function revenueBuckets(
  daily: RevenueReport['daily'],
  from: string,
  to: string,
): RevenueBucket[] {
  const byDay = new Map(daily.map((item) => [item.day, item.netRevenue]));
  const days: string[] = [];
  for (
    let day = from;
    day <= to && days.length <= 400;
    day = addIsoDays(day, 1)
  )
    days.push(day);
  if (days.length <= MAX_DAILY_BARS)
    return days.map((day) => ({
      key: day,
      label: `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`,
      from: day,
      to: day,
      netRevenue: byDay.get(day) ?? '0',
    }));
  const months = new Map<string, RevenueBucket & { cents: bigint }>();
  for (const day of days) {
    const key = day.slice(0, 7);
    const bucket = months.get(key) ?? {
      key,
      label: `T${Number(key.slice(5))}/${key.slice(2, 4)}`,
      from: day,
      to: day,
      netRevenue: '0',
      cents: 0n,
    };
    bucket.to = day;
    bucket.cents += toCents(byDay.get(day) ?? '0');
    months.set(key, bucket);
  }
  return [...months.values()].map(({ cents, ...bucket }) => ({
    ...bucket,
    netRevenue: centsToDecimal(cents),
  }));
}

export function maxMoney(values: string[]) {
  return centsToDecimal(
    values.reduce((max, value) => {
      const cents = toCents(value);
      return cents > max ? cents : max;
    }, 0n),
  );
}

export type FlowRow = {
  key: 'gross' | 'discounts' | 'returns' | 'cancellations' | 'net';
  label: string;
  amount: string;
  /** Bar start and length, percent of gross sales. */
  offset: number;
  width: number;
};

/** Gross sales down to net revenue, each deduction drawn where it bites. */
export function revenueFlow(summary: RevenueReport['summary']): FlowRow[] {
  const gross = summary.grossSales;
  const discounts = centsToDecimal(
    toCents(summary.lineDiscounts) + toCents(summary.orderDiscounts),
  );
  let remaining = toCents(gross);
  const deduction = (
    key: FlowRow['key'],
    label: string,
    amount: string,
  ): FlowRow => {
    remaining -= toCents(amount);
    const start = centsToDecimal(remaining > 0n ? remaining : 0n);
    return {
      key,
      label,
      amount,
      offset: moneyShare(start, gross),
      width: moneyShare(amount, gross),
    };
  };
  return [
    {
      key: 'gross',
      label: 'Tiền hàng',
      amount: gross,
      offset: 0,
      width: moneyShare(gross, gross),
    },
    deduction('discounts', 'Giảm giá', discounts),
    deduction('returns', 'Khách trả hàng', summary.salesReturns),
    deduction('cancellations', 'Hủy đơn', summary.cancellations),
    {
      key: 'net',
      label: 'Doanh thu',
      amount: summary.netRevenue,
      offset: 0,
      width: moneyShare(summary.netRevenue, gross),
    },
  ];
}
