import { describe, expect, it } from 'vitest';
import {
  DirectoryApiError,
  parseCustomerPage,
  parseSupplierPage,
} from './directory-api';

const success = (items: unknown[]) => ({
  ok: true,
  data: { items },
  error: null,
  correlationId: '10000000-0000-4000-8000-000000000001',
});

describe('directory API boundary', () => {
  it('parses typed pages and creates a keyset cursor at the page limit', () => {
    const item = {
      id: '10000000-0000-4000-8000-000000000002',
      code: 'NCC-01',
      name: '  Nhà   Cung Cấp A ',
      phone: '+84912345678',
      email: null,
      address: null,
      notes: null,
      isActive: true,
      version: 1,
    };
    expect(parseSupplierPage(success([item]), 1)).toEqual({
      items: [item],
      nextCursor: {
        name: 'nhà cung cấp a',
        id: item.id,
      },
    });
  });

  it('rejects sensitive or malformed customer fields', () => {
    expect(() =>
      parseCustomerPage(
        success([
          {
            id: '10000000-0000-4000-8000-000000000002',
            code: null,
            customerType: 'INDIVIDUAL',
            name: 'Khách A',
            phone: null,
            email: null,
            address: null,
            companyName: null,
            taxCode: null,
            customerGroup: null,
            notes: null,
            isActive: true,
            version: 1,
            identityNumber: 'không được nhận',
          },
        ]),
        30,
      ),
    ).toThrow('Phản hồi khách hàng không hợp lệ.');
  });

  it('maps business errors without exposing the raw server message', () => {
    expect(() =>
      parseSupplierPage(
        {
          ok: false,
          data: null,
          error: {
            code: 'DUPLICATE_IN_DATABASE',
            message: 'raw database detail',
            details: {},
          },
          correlationId: '10000000-0000-4000-8000-000000000003',
        },
        30,
      ),
    ).toThrow(DirectoryApiError);
    try {
      parseSupplierPage(
        {
          ok: false,
          data: null,
          error: { code: 'UNKNOWN', message: 'secret raw', details: {} },
          correlationId: '10000000-0000-4000-8000-000000000004',
        },
        30,
      );
    } catch (error) {
      expect(error).toMatchObject({
        message: 'Không thể hoàn tất thao tác. Vui lòng thử lại.',
      });
    }
  });
});
