/**
 * Donut geometry from canonical decimal strings. Shares are computed with
 * BigInt on whole cents, so the percentages never depend on float money.
 */
export const DONUT_RADIUS = 60;
export const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const GAP = 2;
const MIN_SLICE = 3;

export function toCents(value: string): bigint {
  const negative = value.startsWith('-');
  const [integer = '0', fraction = ''] = value.replace(/^[-+]/, '').split('.');
  const cents =
    BigInt(integer || '0') * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -cents : cents;
}

export function centsToDecimal(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const integer = absolute / 100n;
  const fraction = absolute % 100n;
  const text =
    fraction === 0n
      ? integer.toString()
      : `${integer}.${fraction.toString().padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

export function sumDecimals(values: string[]) {
  return centsToDecimal(values.reduce((sum, v) => sum + toCents(v), 0n));
}

export type DonutSlice = {
  /** Share label such as "36%", "<1%"; empty when the value is not positive. */
  percent: string;
  dashArray: string;
  dashOffset: string;
  visible: boolean;
};

/**
 * Only positive values take part of the ring; negative ones keep a legend row.
 * Tiny shares keep a minimum arc and the larger slices shrink to make room, so
 * no slice is drawn over another.
 */
export function donutSlices(values: string[]): DonutSlice[] {
  const cents = values.map((value) => {
    const amount = toCents(value);
    return amount > 0n ? amount : 0n;
  });
  const total = cents.reduce((sum, value) => sum + value, 0n);
  const visible = cents.filter((value) => value > 0n).length;
  // Display-only geometry; parts-per-million keeps it exact enough for pixels.
  const shares = cents.map((value) =>
    total === 0n ? 0 : Number((value * 1_000_000n) / total) / 1_000_000,
  );
  const available = DONUT_CIRCUMFERENCE - (visible > 1 ? GAP * visible : 0);
  const raw = shares.map((share) => share * available);
  const small = raw.filter(
    (length, index) => cents[index]! > 0n && length < MIN_SLICE,
  );
  const largeTotal = raw
    .filter((length) => length >= MIN_SLICE)
    .reduce((sum, length) => sum + length, 0);
  const excess = small.reduce((sum, length) => sum + (MIN_SLICE - length), 0);
  let start = 0;
  return cents.map((value, index) => {
    if (value === 0n) {
      return { percent: '', dashArray: '0 1', dashOffset: '0', visible: false };
    }
    const length =
      raw[index]! < MIN_SLICE
        ? MIN_SLICE
        : raw[index]! - (excess * raw[index]!) / largeTotal;
    const roundedPercent = (value * 200n + total) / (total * 2n);
    const slice = {
      percent: roundedPercent === 0n ? '<1%' : `${roundedPercent}%`,
      dashArray: `${length.toFixed(2)} ${(DONUT_CIRCUMFERENCE - length).toFixed(2)}`,
      dashOffset: (-start).toFixed(2),
      visible: true,
    };
    start += length + (visible > 1 ? GAP : 0);
    return slice;
  });
}
