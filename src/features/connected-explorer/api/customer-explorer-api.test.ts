import { describe, expect, it } from 'vitest';
import {
  ConnectedExplorerApiError,
  parseCustomerDetailEnvelope,
  parseCustomerProductsEnvelope,
  parseCustomerReturnsEnvelope,
  parseCustomerSalesEnvelope,
} from './customer-explorer-api';

const correlationId = '20000000-0000-4000-8000-000000000001';
const customerId = '10000000-0000-4000-8000-000000000001';
const saleId = '10000000-0000-4000-8000-000000000002';
const returnId = '10000000-0000-4000-8000-000000000003';
const productId = '10000000-0000-4000-8000-000000000004';
const lineId = '10000000-0000-4000-8000-000000000005';
const completedAt = '2026-09-03T02:00:00+00:00';

function success(data: unknown) {
  return { ok: true, data, error: null, correlationId };
}

function customerDetail() {
  return {
    id: customerId,
    code: 'KH-01',
    customerType: 'INDIVIDUAL',
    name: 'Khách hàng A',
    phone: '+84912345678',
    email: null,
    address: null,
    companyName: null,
    taxCode: null,
    customerGroup: null,
    notes: null,
    isActive: true,
    version: 1,
    salesScope: 'ALL',
    purchaseSummary: {
      orderCount: 1,
      cancelledOrderCount: 1,
      completedReturnCount: 1,
      completedSalesNet: '100000.00',
      returnedTotal: '30000.00',
      cancelledTotal: '100000.00',
      netSpend: '-30000.00',
      lastPurchaseAt: completedAt,
    },
  };
}

describe('customer explorer API boundary', () => {
  it('accepts a signed net spend while preserving exact decimal strings', () => {
    expect(
      parseCustomerDetailEnvelope(success(customerDetail())),
    ).toMatchObject({
      salesScope: 'ALL',
      purchaseSummary: {
        completedSalesNet: '100000.00',
        netSpend: '-30000.00',
      },
    });
  });

  it('accepts profile-only detail only when summary is null', () => {
    const detail = customerDetail();
    expect(
      parseCustomerDetailEnvelope(
        success({ ...detail, salesScope: 'NONE', purchaseSummary: null }),
      ).purchaseSummary,
    ).toBeNull();
    expect(() =>
      parseCustomerDetailEnvelope(success({ ...detail, salesScope: 'NONE' })),
    ).toThrow('Phản hồi chi tiết khách hàng không hợp lệ.');
  });

  it('parses sale and return keyset pages with exact cursor shapes', () => {
    const sales = parseCustomerSalesEnvelope(
      success({
        items: [
          {
            saleId,
            saleNumber: 'HD000001',
            completedAt,
            status: 'PARTIALLY_RETURNED',
            customerNameSnapshot: 'Khách hàng A',
            channelName: 'Tại quầy',
            createdByName: 'Nhân viên A',
            paymentMethod: 'CASH',
            paymentStatus: 'CAPTURED',
            originalNetTotal: '100000.00',
            returnedTotal: '30000.00',
            effectiveNetTotal: '70000.00',
          },
        ],
        nextCursor: { completedAt, saleId },
      }),
    );
    expect(sales.nextCursor).toEqual({ completedAt, saleId });

    const returns = parseCustomerReturnsEnvelope(
      success({
        items: [
          {
            returnId,
            returnNumber: 'TH000001',
            completedAt,
            reason: 'Đổi hàng',
            refundTotal: '30000.00',
            refundMethod: 'CASH',
            saleId,
            saleNumber: 'HD000001',
            lines: [
              {
                lineId,
                productId,
                sku: 'SP-01',
                productName: 'Sản phẩm A',
                unitName: 'Cái',
                acceptedQty: '1',
                refundAmount: '30000.00',
              },
            ],
          },
        ],
        nextCursor: { completedAt, returnId },
      }),
    );
    expect(returns.items[0]?.lines[0]?.productId).toBe(productId);
  });

  it('rejects negative non-signed metrics and leaked private fields', () => {
    const product = {
      productId,
      sku: 'SP-01',
      productName: 'Sản phẩm A',
      unitName: 'Cái',
      productIsActive: true,
      orderCount: 2,
      grossSoldQty: '3',
      returnedQty: '1',
      netPurchasedQty: '2',
      grossNetAmount: '90000.00',
      refundedAmount: '30000.00',
      netPurchasedAmount: '60000.00',
      lastPurchasedAt: completedAt,
    };
    expect(
      parseCustomerProductsEnvelope(
        success({
          items: [product],
          nextCursor: {
            netPurchasedQty: '2',
            lastPurchasedAt: completedAt,
            productId,
          },
        }),
      ).items,
    ).toHaveLength(1);
    expect(() =>
      parseCustomerProductsEnvelope(
        success({
          items: [{ ...product, returnedQty: '-1' }],
          nextCursor: null,
        }),
      ),
    ).toThrow('Phản hồi sản phẩm khách hàng không hợp lệ.');
    expect(() =>
      parseCustomerProductsEnvelope(
        success({
          items: [{ ...product, cogs: '10000.00' }],
          nextCursor: null,
        }),
      ),
    ).toThrow('Phản hồi sản phẩm khách hàng không hợp lệ.');
  });

  it('maps business failures to a safe error and correlation ID', () => {
    try {
      parseCustomerDetailEnvelope({
        ok: false,
        data: null,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'raw SQL private detail',
          details: { internal: true },
        },
        correlationId,
      });
      throw new Error('expected parsing to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectedExplorerApiError);
      expect(error).toMatchObject({ code: 'PERMISSION_DENIED', correlationId });
      expect(error).not.toHaveProperty('details');
      expect((error as Error).message).not.toContain('raw SQL');
    }
  });
});
