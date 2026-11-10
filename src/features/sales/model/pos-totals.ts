import {
  INTEGER_FINAL,
  MONEY_FINAL,
} from '@/shared/lib/numeric/canonical-number';

type PosTotalLine = {
  quantity: string;
  unitSalePrice: string;
  lineDiscountAmount: string;
};

function moneyToMinorUnits(value: string) {
  if (value === '') return 0n;
  if (!MONEY_FINAL.test(value)) return 0n;
  const [integer, fraction = ''] = value.split('.');
  return BigInt(integer!) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function minorUnitsToCanonical(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const integer = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  const canonical =
    fraction === '00'
      ? integer.toString()
      : `${integer}.${fraction.replace(/0$/, '')}`;
  return negative ? `-${canonical}` : canonical;
}

function quantityToBigInt(value: string) {
  return INTEGER_FINAL.test(value) ? BigInt(value) : 0n;
}

export function calculatePosTotals(
  lines: PosTotalLine[],
  orderDiscount: string,
) {
  const subtotalMinor = lines.reduce(
    (total, line) =>
      total +
      quantityToBigInt(line.quantity) * moneyToMinorUnits(line.unitSalePrice),
    0n,
  );
  const lineDiscountMinor = lines.reduce(
    (total, line) => total + moneyToMinorUnits(line.lineDiscountAmount),
    0n,
  );
  const discountMinor = lineDiscountMinor + moneyToMinorUnits(orderDiscount);
  const itemsMinor = subtotalMinor - lineDiscountMinor;
  return {
    subtotal: minorUnitsToCanonical(subtotalMinor),
    lineDiscount: minorUnitsToCanonical(lineDiscountMinor),
    itemsTotal: minorUnitsToCanonical(itemsMinor > 0n ? itemsMinor : 0n),
    discountTotal: minorUnitsToCanonical(discountMinor),
    total: minorUnitsToCanonical(
      subtotalMinor > discountMinor ? subtotalMinor - discountMinor : 0n,
    ),
  };
}

export function lineGrossAmount(
  line: Omit<PosTotalLine, 'lineDiscountAmount'>,
) {
  return minorUnitsToCanonical(
    quantityToBigInt(line.quantity) * moneyToMinorUnits(line.unitSalePrice),
  );
}

export function lineNetAmount(line: PosTotalLine) {
  const net =
    quantityToBigInt(line.quantity) * moneyToMinorUnits(line.unitSalePrice) -
    moneyToMinorUnits(line.lineDiscountAmount);
  return minorUnitsToCanonical(net > 0n ? net : 0n);
}

export function isPositiveMoney(value: string) {
  return moneyToMinorUnits(value) > 0n;
}

export function exceedsMoney(value: string, maximum: string) {
  return moneyToMinorUnits(value) > moneyToMinorUnits(maximum);
}

export function subtractMoney(base: string, amount: string) {
  const rest = moneyToMinorUnits(base) - moneyToMinorUnits(amount);
  return minorUnitsToCanonical(rest > 0n ? rest : 0n);
}

/** Percent (0–100, up to 2 decimals) of base, rounded half-up to whole dong and capped at base. */
export function discountFromPercent(base: string, percent: string) {
  if (!MONEY_FINAL.test(percent)) return '0';
  const baseMinor = moneyToMinorUnits(base);
  const percentHundredths = moneyToMinorUnits(percent);
  if (percentHundredths > 10000n) return minorUnitsToCanonical(baseMinor);
  // base(minor, x100) * percent(x100) / 100% (x100) / 100 (to dong) = / 10^6 dong
  const dong = (baseMinor * percentHundredths * 2n + 1_000_000n) / 2_000_000n;
  const amount = dong * 100n;
  return minorUnitsToCanonical(amount > baseMinor ? baseMinor : amount);
}
