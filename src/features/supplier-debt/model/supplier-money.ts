/** Exact money helpers on whole cents (BigInt): no float ever touches money. */
export function toCents(value: string) {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  const cents =
    BigInt(whole || '0') * 100n + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -cents : cents;
}

export function fromCents(cents: bigint) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  const text = `${absolute / 100n}${fraction === '00' ? '' : `.${fraction}`}`;
  return negative ? `-${text}` : text;
}

export const addMoney = (...values: string[]) =>
  fromCents(values.reduce((sum, value) => sum + toCents(value || '0'), 0n));

export const minMoney = (left: string, right: string) =>
  toCents(left) <= toCents(right) ? left : right;

export const isPositiveMoney = (value: string) =>
  /^\d+(\.\d{1,2})?$/.test(value) && toCents(value) > 0n;

/**
 * Amount of a purchase return line, the same rule as the server: the last
 * units take what is left of the line cost, others are rounded half up.
 */
export function returnLineAmount(line: {
  lineCost: string;
  receivedQty: string;
  returnedQty: string;
  returnedAmount: string;
  quantity: string;
}) {
  const quantity = BigInt(line.quantity || '0');
  if (quantity <= 0n) return '0';
  const received = BigInt(line.receivedQty);
  if (BigInt(line.returnedQty) + quantity === received)
    return fromCents(toCents(line.lineCost) - toCents(line.returnedAmount));
  const numerator = toCents(line.lineCost) * quantity;
  return fromCents((numerator * 2n + received) / (received * 2n));
}

/** Pays the oldest debt first, as the server does. */
export function allocateOldestFirst<T extends { outstandingAmount: string }>(
  payables: T[],
  amount: string,
) {
  let left = toCents(amount || '0');
  return payables.map((payable) => {
    const take =
      left <= 0n
        ? 0n
        : left < toCents(payable.outstandingAmount)
          ? left
          : toCents(payable.outstandingAmount);
    left -= take;
    return { payable, amount: fromCents(take) };
  });
}

/**
 * Write-off value, the same rule as the server: the last units take the whole
 * remaining value, otherwise average cost (6 decimals) × quantity rounded half up.
 */
export function writeOffValue(input: {
  avgUnitCostExact: string;
  inventoryValue: string;
  onHandQty: string;
  quantity: string;
}) {
  const quantity = BigInt(input.quantity);
  if (quantity === BigInt(input.onHandQty)) return input.inventoryValue;
  const [whole = '0', fraction = ''] = input.avgUnitCostExact.split('.');
  const micro =
    BigInt(whole) * 1_000_000n + BigInt(`${fraction}000000`.slice(0, 6));
  // micro-đồng × quantity → cents, half up: 1 cent = 10 000 micro-đồng.
  const cents = (micro * quantity * 2n + 10_000n) / 20_000n;
  const value = fromCents(cents);
  return toCents(value) < toCents(input.inventoryValue)
    ? value
    : input.inventoryValue;
}
