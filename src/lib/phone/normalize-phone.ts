import { parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js';

const E164_PHONE = /^\+[1-9][0-9]{7,14}$/;
const STRICT_PHONE_INPUT = /^(?:\+[0-9]+|[0-9]+)$/;

export type PhoneNormalizationResult =
  | { ok: true; e164: string | null }
  | {
      ok: false;
      code: 'PHONE_FORMAT_INVALID';
      message: 'Số điện thoại chưa đúng định dạng quốc tế.';
    };

const invalidPhone: PhoneNormalizationResult = {
  ok: false,
  code: 'PHONE_FORMAT_INVALID',
  message: 'Số điện thoại chưa đúng định dạng quốc tế.',
};

export function normalizePhone(
  raw: string,
  defaultCountry: CountryCode,
): PhoneNormalizationResult {
  if (raw === '') return { ok: true, e164: null };
  if (!STRICT_PHONE_INPUT.test(raw)) return invalidPhone;

  try {
    const phone = parsePhoneNumberWithError(raw, {
      defaultCountry,
      extract: false,
    });

    if (phone.ext || !phone.isValid() || !E164_PHONE.test(phone.number)) {
      return invalidPhone;
    }

    return { ok: true, e164: phone.number };
  } catch {
    return invalidPhone;
  }
}
