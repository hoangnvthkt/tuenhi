import { describe, expect, it } from 'vitest';
import { getBusinessErrorMessage } from './command-error';

describe('getBusinessErrorMessage', () => {
  it('maps PRICE_CHANGED to actionable Vietnamese copy', () => {
    expect(getBusinessErrorMessage('PRICE_CHANGED')).toBe(
      'Giá bán đã thay đổi. Vui lòng kiểm tra và xác nhận lại giỏ hàng.',
    );
  });

  it('uses safe generic copy for an unknown server code', () => {
    expect(getBusinessErrorMessage('SERVER_DETAIL_NOT_FOR_USERS')).toBe(
      'Không thể hoàn tất thao tác. Vui lòng thử lại.',
    );
  });

  it.each(['toString', 'constructor'])(
    'uses safe generic copy for inherited property code %s',
    (code) => {
      expect(getBusinessErrorMessage(code)).toBe(
        'Không thể hoàn tất thao tác. Vui lòng thử lại.',
      );
    },
  );
});
