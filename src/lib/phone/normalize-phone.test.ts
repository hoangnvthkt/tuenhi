import { describe, expect, it } from 'vitest';
import { normalizePhone } from './normalize-phone';

describe('normalizePhone', () => {
  it('converts a Vietnamese national number to E.164', () => {
    expect(normalizePhone('0912345678', 'VN')).toEqual({
      ok: true,
      e164: '+84912345678',
    });
  });

  it('keeps a valid E.164 number unchanged', () => {
    expect(normalizePhone('+84912345678', 'VN')).toEqual({
      ok: true,
      e164: '+84912345678',
    });
  });

  it('keeps a blank optional phone as null', () => {
    expect(normalizePhone('', 'VN')).toEqual({ ok: true, e164: null });
  });

  it.each([
    '0912 345 678',
    '0912-345-678',
    '０９１２３４５６７８',
    '+84+912345678',
    '0912345678x12',
  ])('rejects a non-canonical phone input %j', (raw) => {
    expect(normalizePhone(raw, 'VN')).toEqual({
      ok: false,
      code: 'PHONE_FORMAT_INVALID',
      message: 'Số điện thoại chưa đúng định dạng quốc tế.',
    });
  });
});
