import { describe, expect, it } from 'vitest';
import {
  LegacySalesApiError,
  parseLegacyDetailEnvelope,
  parseLegacyListEnvelope,
} from './legacy-sales-api';

const correlationId = '10000000-0000-4000-8000-000000000001';
const saleId = '10000000-0000-4000-8000-000000000002';
const runId = '10000000-0000-4000-8000-000000000003';

describe('legacy sales API boundary', () => {
  it('requires the read model to be explicitly non-operational', () => {
    const result = parseLegacyListEnvelope({
      ok: true,
      data: {
        items: [
          {
            id: saleId,
            sourceSaleNumber: 'HD-GIA-001',
            soldOn: '2026-08-21',
            customerLabel: 'Khách Mẫu',
            channelLabel: 'Online',
            reportedNetTotal: '49000.00',
            qualityStatus: 'WARNING',
            warningCount: 1,
            isOperational: false,
            sourceImportRunId: runId,
          },
        ],
        nextCursor: null,
      },
      error: null,
      correlationId,
    });
    expect(result.items[0]?.isOperational).toBe(false);
  });

  it('rejects any detail that attempts to add an operational action', () => {
    expect(() =>
      parseLegacyDetailEnvelope({
        ok: true,
        data: {
          id: saleId,
          sourceSaleNumber: 'HD-GIA-001',
          sourceRowStart: 2,
          soldOn: null,
          staffLabel: '',
          channelLabel: '',
          customerLabel: '',
          customerPhone: '',
          paymentLabel: '',
          paymentMethod: null,
          sourceStatusLabel: '',
          sourceNote: '',
          profileId: null,
          customerId: null,
          salesChannelId: null,
          reportedSubtotal: null,
          reportedDiscountTotal: null,
          reportedNetTotal: null,
          qualityStatus: 'VALID',
          warningCodes: [],
          adapterId: 'LEGACY_Q237_V1',
          sourceFileSha256: 'a'.repeat(64),
          sourceImportRunId: runId,
          mappingVersion: 1,
          lines: [],
          isOperational: false,
          canReturn: true,
        },
        error: null,
        correlationId,
      }),
    ).toThrow('Phản hồi chi tiết dữ liệu cũ không hợp lệ.');
  });

  it('maps stable errors without exposing raw SQL/server messages', () => {
    try {
      parseLegacyListEnvelope({
        ok: false,
        data: null,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'raw SQL detail',
          details: {},
        },
        correlationId,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(LegacySalesApiError);
      expect(error).toMatchObject({ code: 'PERMISSION_DENIED', correlationId });
      expect((error as Error).message).not.toContain('raw SQL');
    }
  });
});
