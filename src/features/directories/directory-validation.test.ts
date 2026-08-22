import { describe, expect, it } from 'vitest';
import {
  validateCustomer,
  validateSalesChannel,
  validateSupplier,
} from './directory-validation';

describe('directory validation', () => {
  it('requires names and normalizes strict optional phones to E.164', () => {
    expect(
      validateSupplier({
        code: '',
        name: '  Nhà cung cấp A  ',
        phone: '0912345678',
        email: 'CONTACT@EXAMPLE.INVALID',
        address: '',
        notes: '',
        isActive: true,
      }),
    ).toEqual({
      ok: true,
      data: expect.objectContaining({
        name: 'Nhà cung cấp A',
        phone: '+84912345678',
        email: 'contact@example.invalid',
      }),
    });

    const invalid = validateSupplier({
      code: '',
      name: '',
      phone: '0912 345 678',
      email: 'sai-email',
      address: '',
      notes: '',
      isActive: true,
    });
    expect(invalid).toEqual({
      ok: false,
      fieldErrors: expect.objectContaining({
        name: 'Tên không được để trống.',
        phone: 'Số điện thoại chưa đúng định dạng quốc tế.',
        email: 'Email chưa đúng định dạng.',
      }),
    });
  });

  it('requires company for BUSINESS and clears it for INDIVIDUAL', () => {
    const base = {
      code: '',
      name: 'Khách hàng A',
      phone: '',
      email: '',
      address: '',
      companyName: '',
      taxCode: '',
      customerGroup: '',
      notes: '',
      isActive: true,
    } as const;
    expect(validateCustomer({ ...base, customerType: 'BUSINESS' })).toEqual({
      ok: false,
      fieldErrors: expect.objectContaining({
        companyName: 'Tên công ty không được để trống với khách doanh nghiệp.',
      }),
    });
    expect(
      validateCustomer({
        ...base,
        customerType: 'INDIVIDUAL',
        companyName: 'Không được gửi',
      }),
    ).toEqual({
      ok: true,
      data: expect.objectContaining({ companyName: '' }),
    });
  });

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
