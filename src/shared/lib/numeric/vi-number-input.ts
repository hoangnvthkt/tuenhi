/**
 * Vietnamese number entry (same rules as khotienthinh):
 * dot groups thousands and is added by the input itself, comma marks decimals.
 * The display string is for people; callers keep the canonical string
 * (`1234.5`) so money and quantity logic never sees a float or a locale.
 */

const groupThousands = (digits: string) =>
  digits.replace(/\B(?=(?:[0-9]{3})+(?![0-9]))/g, '.');

function stripLeadingZeros(digits: string) {
  return digits.replace(/^0+(?=[0-9])/, '');
}

function isCommaGrouped(parts: string[]) {
  return (
    parts.length > 1 &&
    /^[1-9][0-9]{0,2}$/.test(parts[0]!) &&
    parts.slice(1).every((part) => /^[0-9]{3}$/.test(part))
  );
}

/**
 * Reformat what the person typed or pasted. Dots are always thousand
 * separators, so `12.5` shows as `125` at once instead of being stored as 12,5.
 * `1,234.5` (English) and `50,000` (comma-grouped money) are understood.
 */
export function formatViNumberInput(raw: string, maxFractionDigits: number) {
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  if (cleaned === '') return '';
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let integer: string;
  let fraction: string | null = null;
  if (lastComma >= 0 && lastDot > lastComma) {
    integer = cleaned.slice(0, lastDot).replace(/[.,]/g, '');
    fraction = cleaned.slice(lastDot + 1).replace(/[.,]/g, '');
  } else if (lastComma >= 0) {
    const parts = cleaned.replace(/\./g, '').split(',');
    if (maxFractionDigits < 3 && isCommaGrouped(parts)) {
      integer = parts.join('');
    } else {
      integer = parts[0]!;
      fraction = parts.slice(1).join('');
    }
  } else {
    integer = cleaned.replace(/\./g, '');
  }
  const whole = integer === '' ? '0' : stripLeadingZeros(integer);
  return fraction === null
    ? groupThousands(whole)
    : `${groupThousands(whole)},${fraction}`;
}

/** `1.234,5` → `1234.5`; a trailing comma stays as `1234.` while typing. */
export function viNumberInputToCanonical(display: string) {
  return display.replace(/\./g, '').replace(',', '.');
}

/** `1234.50` → `1.234,5`; zero-only fractions are not shown. */
export function canonicalToViNumberInput(canonical: string) {
  if (canonical === '') return '';
  const [integer = '', fraction] = canonical.split('.');
  const grouped = groupThousands(stripLeadingZeros(integer || '0'));
  if (fraction === undefined) return grouped;
  const shown = fraction.replace(/0+$/, '');
  return shown
    ? `${grouped},${shown}`
    : fraction === ''
      ? `${grouped},`
      : grouped;
}

/** Same number, ignoring trailing zeros and a trailing decimal mark. */
export function sameCanonicalNumber(left: string, right: string) {
  const normalize = (value: string) => {
    if (!value.includes('.')) return value.replace(/^0+(?=[0-9])/, '');
    const [integer = '', fraction = ''] = value.split('.');
    const trimmed = fraction.replace(/0+$/, '');
    const whole = integer.replace(/^0+(?=[0-9])/, '') || '0';
    return trimmed ? `${whole}.${trimmed}` : whole;
  };
  return normalize(left) === normalize(right);
}

/** Caret index in `display` after the `count`-th digit/comma typed so far. */
export function caretAfterSignificant(display: string, count: number) {
  if (count <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < display.length; index += 1) {
    if (display[index] !== '.') seen += 1;
    if (seen === count) return index + 1;
  }
  return display.length;
}

export function significantBefore(raw: string, caret: number) {
  return raw.slice(0, caret).replace(/[^0-9,]/g, '').length;
}
