import { describe, expect, it } from 'vitest';
import {
  ConnectedExplorerApiError,
  parsePostedPurchaseHistoryEnvelope,
  parseProductRelationshipContextEnvelope,
  parseProductSuppliersEnvelope,
  parseSupplierDetailEnvelope,
  parseSupplierProductsEnvelope,
} from './connected-explorer-api';

const correlationId = '20000000-0000-4000-8000-000000000001';
const productId = '10000000-0000-4000-8000-000000000001';
const supplierId = '10000000-0000-4000-8000-000000000002';
const receiptId = '10000000-0000-4000-8000-000000000003';
const lineId = '10000000-0000-4000-8000-000000000004';

function success(data: unknown) {
  return { ok: true, data, error: null, correlationId };
}

describe('connected explorer API boundary', () => {
  it('parses product context without coercing exact numeric strings', () => {
    expect(
      parseProductRelationshipContextEnvelope(
        success({
          productId,
          supplierCount: 1,
          postedReceiptCount: 2,
          totalReceivedQty: '3.500',
          lastReceivedAt: '2026-08-31T10:00:00+00:00',
          latestUnitCost: '12500.00',
          canReadCost: true,
        }),
      ),
    ).toMatchObject({ totalReceivedQty: '3.500', latestUnitCost: '12500.00' });
  });

  it('accepts cost-null list contracts and exact cursor shapes', () => {
    const productSuppliers = parseProductSuppliersEnvelope(
      success({
        items: [
          {
            supplierId,
            supplierCode: 'NCC-01',
            supplierName: 'Nhà cung cấp A',
            supplierIsActive: true,
            postedReceiptCount: 2,
            totalReceivedQty: '5',
            lastReceivedAt: '2026-08-31T10:00:00+00:00',
            latestReceiptId: receiptId,
            latestReceiptNumber: 'PN000001',
            latestUnitCost: null,
            canReadCost: false,
          },
        ],
        nextCursor: {
          lastReceivedAt: '2026-08-31T10:00:00+00:00',
          supplierId,
        },
      }),
    );
    expect(productSuppliers.nextCursor?.supplierId).toBe(supplierId);

    const supplierProducts = parseSupplierProductsEnvelope(
      success({
        items: [
          {
            productId,
            sku: 'SP-01',
            productName: 'Sản phẩm A',
            unitName: 'Hộp',
            isActive: true,
            postedReceiptCount: 2,
            totalReceivedQty: '5',
            lastReceivedAt: '2026-08-31T10:00:00+00:00',
            latestReceiptId: receiptId,
            latestReceiptNumber: 'PN000001',
            latestUnitCost: null,
            canReadCost: false,
          },
        ],
        nextCursor: null,
      }),
    );
    expect(supplierProducts.items[0]?.latestUnitCost).toBeNull();
  });

  it('parses supplier master data independently from purchase access', () => {
    expect(
      parseSupplierDetailEnvelope(
        success({
          id: supplierId,
          code: null,
          name: 'Nhà cung cấp A',
          phone: null,
          email: null,
          address: null,
          notes: null,
          isActive: true,
          version: 1,
          canReadPurchases: false,
          canReadCost: false,
          distinctProductCount: null,
          postedReceiptCount: null,
          totalReceivedQty: null,
          lastReceivedAt: null,
          totalPostedCost: null,
        }),
      ),
    ).toMatchObject({ name: 'Nhà cung cấp A', canReadPurchases: false });
  });

  it('parses posted history and rejects leaked cost when permission flag is false', () => {
    const valid = {
      items: [
        {
          lineId,
          receiptId,
          receiptNumber: 'PN000001',
          receivedAt: '2026-08-31T10:00:00+00:00',
          supplierId: null,
          supplierName: null,
          productId,
          sku: 'SP-01',
          productName: 'Sản phẩm A',
          unitName: 'Hộp',
          receivedQty: '2',
          unitCost: null,
          lineCost: null,
          canReadCost: false,
        },
      ],
      nextCursor: {
        receivedAt: '2026-08-31T10:00:00+00:00',
        receiptId,
        lineId,
      },
    };
    expect(
      parsePostedPurchaseHistoryEnvelope(success(valid)).items,
    ).toHaveLength(1);
    expect(() =>
      parsePostedPurchaseHistoryEnvelope(
        success({
          ...valid,
          items: [{ ...valid.items[0], unitCost: '10.00' }],
        }),
      ),
    ).toThrow('Phản hồi lịch sử nhập hàng không hợp lệ.');
  });

  it('turns business failures into a safe error with correlation ID', () => {
    expect(() =>
      parseProductRelationshipContextEnvelope({
        ok: false,
        data: null,
        error: {
          code: 'PERMISSION_DENIED',
          message: 'raw SQL must not be shown',
          details: {},
        },
        correlationId,
      }),
    ).toThrow(ConnectedExplorerApiError);
    try {
      parseProductRelationshipContextEnvelope({
        ok: false,
        data: null,
        error: { code: 'PERMISSION_DENIED', message: 'raw SQL', details: {} },
        correlationId,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: 'PERMISSION_DENIED', correlationId });
      expect(error).not.toHaveProperty('details');
      expect((error as Error).message).not.toContain('raw SQL');
    }
  });

  it('rejects extra private fields in strict DTOs', () => {
    expect(() =>
      parseProductRelationshipContextEnvelope(
        success({
          productId,
          supplierCount: 0,
          postedReceiptCount: 0,
          totalReceivedQty: '0',
          lastReceivedAt: null,
          latestUnitCost: null,
          canReadCost: false,
          privateLedger: [],
        }),
      ),
    ).toThrow('Phản hồi liên kết sản phẩm không hợp lệ.');
  });
});
