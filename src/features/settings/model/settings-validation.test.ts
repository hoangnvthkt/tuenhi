import { describe, expect, it } from 'vitest';
import { validateSalesChannel } from './settings-validation';

describe('settings validation', () => {
  it('enforces stable channel codes and canonical sort order', () => {
    expect(
      validateSalesChannel({
        code: 'online-1',
        name: '',
        sortOrder: '1,000',
        isActive: true,
      }),
    ).toEqual({
      ok: false,
      fieldErrors: expect.objectContaining({
        code: 'Mã kênh phải bắt đầu bằng chữ in hoa và chỉ gồm A-Z, 0-9 hoặc dấu gạch dưới.',
        name: 'Tên không được để trống.',
        sortOrder: 'Thứ tự phải là số nguyên không âm.',
      }),
    });
    expect(
      validateSalesChannel(
        { code: 'OTHER', name: 'Online', sortOrder: '10', isActive: true },
        { originalCode: 'ONLINE' },
      ),
    ).toEqual({
      ok: false,
      fieldErrors: { code: 'Mã kênh bán không thể thay đổi sau khi tạo.' },
    });
  });
});
