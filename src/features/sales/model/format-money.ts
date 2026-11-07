export function formatPosMoney(value: string | number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 2,
  }).format(
    // Exact decimal string: no float rounding, keep real fractional dong.
    typeof value === 'string' ? (value as Intl.StringNumericLiteral) : value,
  );
}
