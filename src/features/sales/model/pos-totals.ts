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
  return {
    subtotal: minorUnitsToCanonical(subtotalMinor),
    lineDiscount: minorUnitsToCanonical(lineDiscountMinor),
    discountTotal: minorUnitsToCanonical(discountMinor),
    total: minorUnitsToCanonical(
      subtotalMinor > discountMinor ? subtotalMinor - discountMinor : 0n,
    ),
  };
}
