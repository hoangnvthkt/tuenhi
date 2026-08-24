import { describe, expect, it } from 'vitest';
import {
  ImportApiError,
  parseImportCreateEnvelope,
  parseImportValidationEnvelope,
} from './import-api';

const correlationId = '10000000-0000-4000-8000-000000000001';
const importRunId = '10000000-0000-4000-8000-000000000002';

describe('import API boundary', () => {
  it('accepts a typed create response', () => {
    expect(
      parseImportCreateEnvelope({
        ok: true,
        data: {
          importRunId,
          status: 'UPLOADED',
          expiresAt: '2026-09-21T00:00:00+00:00',
        },
        error: null,
        correlationId,
      }),
    ).toEqual({
      importRunId,
      status: 'UPLOADED',
      expiresAt: '2026-09-21T00:00:00+00:00',
    });
  });

  it('rejects malformed validation rows at the browser boundary', () => {
    expect(() =>
      parseImportValidationEnvelope({
        ok: true,
        data: {
          summary: {
            importRunId,
            targetType: 'CUSTOMERS',
            status: 'VALIDATED',
            totalRows: 1,
            validRows: 0,
            invalidRows: 1,
          },
          items: [
            {
              rowNumber: 2,
              status: 'INVALID',
              values: { name: 'Khách A' },
              errors: [{ code: 'PHONE_FORMAT_INVALID' }],
            },
          ],
          nextCursorRowNumber: null,
        },
        error: null,
        correlationId,
      }),
    ).toThrow('Phản hồi kiểm tra nhập dữ liệu không hợp lệ.');
  });

  it('maps a stable import error without exposing the raw server message', () => {
    try {
      parseImportCreateEnvelope({
        ok: false,
        data: null,
        error: {
          code: 'TEMPLATE_VERSION_UNSUPPORTED',
          message: 'raw database detail',
          details: {},
        },
        correlationId,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ImportApiError);
      expect(error).toMatchObject({
        code: 'TEMPLATE_VERSION_UNSUPPORTED',
        correlationId,
        message: 'Phiên bản mẫu Excel chưa được hỗ trợ.',
      });
      expect((error as Error).message).not.toContain('raw database');
    }
  });
});
