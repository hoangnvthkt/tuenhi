export const INTEGER_FINAL = /^(?:0|[1-9][0-9]*)$/;
export const MONEY_EDITING = /^(?:|(?:0|[1-9][0-9]*)(?:\.[0-9]{0,2})?)$/;
export const MONEY_FINAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;
export const QUANTITY_EDITING = /^(?:|(?:0|[1-9][0-9]*)(?:\.[0-9]{0,3})?)$/;
export const QUANTITY_FINAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/;

const INTEGER_EDITING = /^(?:|0|[1-9][0-9]*)$/;
const CANONICAL_WITH_UNBOUNDED_SCALE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

export type NumericKind = 'integer' | 'money' | 'quantity';
export type NumericErrorCode =
  | 'NUMBER_FORMAT_INVALID'
  | 'NUMBER_SCALE_EXCEEDED'
  | 'NUMBER_RANGE_EXCEEDED'
  | 'NUMBER_REQUIRED'
  | 'NUMBER_MUST_BE_POSITIVE'
  | 'NUMBER_MUST_BE_NON_NEGATIVE';

export const numericErrorMessages: Record<NumericErrorCode, string> = {
  NUMBER_FORMAT_INVALID: 'Chỉ nhập chữ số và dấu chấm cho phần thập phân.',
  NUMBER_SCALE_EXCEEDED: 'Số chữ số sau dấu chấm vượt quá giới hạn cho phép.',
  NUMBER_RANGE_EXCEEDED: 'Giá trị vượt quá giới hạn hệ thống cho phép.',
  NUMBER_REQUIRED: 'Vui lòng nhập giá trị.',
  NUMBER_MUST_BE_POSITIVE: 'Giá trị phải lớn hơn 0.',
  NUMBER_MUST_BE_NON_NEGATIVE: 'Giá trị không được nhỏ hơn 0.',
};

export type NumericValidationResult =
  | { ok: true; value: string }
  | { ok: false; code: NumericErrorCode; message: string };

export type NumericValidationOptions = {
  kind: NumericKind;
  precision: number;
  required?: boolean;
  positive?: boolean;
  nonNegative?: boolean;
};

function scaleFor(kind: NumericKind) {
  if (kind === 'money') return 2;
  if (kind === 'quantity') return 3;
  return 0;
}

function finalGrammarFor(kind: NumericKind) {
  if (kind === 'money') return MONEY_FINAL;
  if (kind === 'quantity') return QUANTITY_FINAL;
  return INTEGER_FINAL;
}

export function editingGrammarFor(kind: NumericKind) {
  if (kind === 'money') return MONEY_EDITING;
  if (kind === 'quantity') return QUANTITY_EDITING;
  return INTEGER_EDITING;
}

function numericFailure(code: NumericErrorCode): NumericValidationResult {
  return { ok: false, code, message: numericErrorMessages[code] };
}

export function validateCanonicalNumber(
  value: string,
  options: NumericValidationOptions,
): NumericValidationResult {
  if (value === '') {
    return options.required
      ? numericFailure('NUMBER_REQUIRED')
      : { ok: true, value };
  }

  const scale = scaleFor(options.kind);
  const [integerPart = '', fraction] = value.split('.');
  if (
    options.kind !== 'integer' &&
    CANONICAL_WITH_UNBOUNDED_SCALE.test(value) &&
    fraction &&
    fraction.length > scale
  ) {
    return numericFailure('NUMBER_SCALE_EXCEEDED');
  }

  if (!finalGrammarFor(options.kind).test(value)) {
    return numericFailure('NUMBER_FORMAT_INVALID');
  }

  const integerDigits = integerPart.length;
  if (integerDigits > options.precision - scale) {
    return numericFailure('NUMBER_RANGE_EXCEEDED');
  }

  const isZero = /^0(?:\.0+)?$/.test(value);
  if (options.positive && isZero) {
    return numericFailure('NUMBER_MUST_BE_POSITIVE');
  }

  if (options.nonNegative && value.startsWith('-')) {
    return numericFailure('NUMBER_MUST_BE_NON_NEGATIVE');
  }

  return { ok: true, value };
}

export function formatViNumber(value: string) {
  if (!CANONICAL_WITH_UNBOUNDED_SCALE.test(value)) {
    throw new Error('Giá trị canonical không hợp lệ.');
  }

  const [integer = '', rawFraction = ''] = value.split('.');
  const groupedInteger = integer.replace(/\B(?=(?:[0-9]{3})+(?![0-9]))/g, '.');
  const fraction = rawFraction.replace(/0+$/, '');

  return fraction ? `${groupedInteger},${fraction}` : groupedInteger;
}

export function normalizeCanonicalNumber(value: string) {
  if (!CANONICAL_WITH_UNBOUNDED_SCALE.test(value)) {
    throw new Error('Giá trị canonical không hợp lệ.');
  }

  const [integer = '', rawFraction] = value.split('.');
  const fraction = rawFraction?.replace(/0+$/, '') ?? '';
  return fraction ? `${integer}.${fraction}` : integer;
}

export function compareCanonicalNumbers(left: string, right: string) {
  const normalizedLeft = normalizeCanonicalNumber(left);
  const normalizedRight = normalizeCanonicalNumber(right);
  const [leftInteger = '', leftFraction = ''] = normalizedLeft.split('.');
  const [rightInteger = '', rightFraction = ''] = normalizedRight.split('.');

  if (leftInteger.length !== rightInteger.length) {
    return leftInteger.length > rightInteger.length ? 1 : -1;
  }
  if (leftInteger !== rightInteger) return leftInteger > rightInteger ? 1 : -1;

  const precision = Math.max(leftFraction.length, rightFraction.length);
  const paddedLeft = leftFraction.padEnd(precision, '0');
  const paddedRight = rightFraction.padEnd(precision, '0');
  if (paddedLeft === paddedRight) return 0;
  return paddedLeft > paddedRight ? 1 : -1;
}
