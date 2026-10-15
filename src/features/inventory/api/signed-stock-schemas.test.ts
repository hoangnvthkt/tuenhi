import { describe, expect, it } from 'vitest';
import { openingDocumentSchema } from '../opening/api/opening-schemas';
import { purchaseReceiptSchema } from '../purchase/api/purchase-schemas';
import { stockCountSchema } from '../stock-count/api/stock-count-schemas';
import { valuationPageSchema } from '../valuation/api/valuation-schemas';

const productLine = {
  id: '10000000-0000-4000-8000-000000000001',
  productId: '20000000-0000-4000-8000-000000000002',
  productName: 'Sản phẩm mẫu',
  sku: 'SP-001',
  unitName: 'Hộp',
  lineOrder: 0,
};

const stockCountLine = {
  ...productLine,
  systemQtySnapshot: '-2',
  inventoryVersionSnapshot: 1,
  countedQty: '3',
  differenceQty: '5',
  requiresEstimatedCost: true,
};

const openingLine = {
  ...productLine,
  systemQtySnapshot: '-2',
  inventoryVersionSnapshot: 1,
  countedQty: '3',
  openingUnitCost: '25000',
  openingValue: '75000',
  sourceSuggestionId: null,
  unverifiedSourceConfirmed: true,
};

const valuationPage = {
  version: 2,
  items: [
    {
      productId: productLine.productId,
      sku: 'SP-001',
      name: 'Sản phẩm mẫu',
      unitName: 'Hộp',
      onHandQty: '-2',
      avgUnitCost: '25000',
      inventoryValue: '-50000',
    },
  ],
  nextCursor: null,
  totalInventoryValue: '-50000',
};

describe('signed inventory read models', () => {
  it('reads negative inventory in the valuation report', () => {
    expect(valuationPageSchema.parse(valuationPage).items[0]).toMatchObject({
      onHandQty: '-2',
      inventoryValue: '-50000',
    });
  });

  it('reads a negative system snapshot in a periodic stock count', () => {
    expect(
      stockCountSchema.shape.lines.element.parse(stockCountLine),
    ).toMatchObject({
      systemQtySnapshot: '-2',
      countedQty: '3',
      differenceQty: '5',
    });
  });

  it('reads a negative system snapshot in an opening count', () => {
    expect(
      openingDocumentSchema.shape.lines.element.parse(openingLine),
    ).toMatchObject({ systemQtySnapshot: '-2', countedQty: '3' });
  });

  it.each(['-0', '-01', '+1', '1.0', '-1.5', '01', ' 1', '1e3'])(
    'rejects malformed signed stock %j in every inventory read model',
    (quantity) => {
      expect(
        valuationPageSchema.safeParse({
          ...valuationPage,
          items: [{ ...valuationPage.items[0], onHandQty: quantity }],
        }).success,
      ).toBe(false);
      expect(
        stockCountSchema.shape.lines.element.safeParse({
          ...stockCountLine,
          systemQtySnapshot: quantity,
        }).success,
      ).toBe(false);
      expect(
        openingDocumentSchema.shape.lines.element.safeParse({
          ...openingLine,
          systemQtySnapshot: quantity,
        }).success,
      ).toBe(false);
    },
  );
});

describe('transaction quantities remain nonnegative integers', () => {
  it('accepts a canonical purchase quantity', () => {
    expect(
      purchaseReceiptSchema.shape.lines.element.parse({
        ...productLine,
        receivedQty: '3',
      }),
    ).toMatchObject({ receivedQty: '3' });
  });

  it.each(['-1', '+1', '1.5', '01'])(
    'rejects invalid purchase and counted quantity %j',
    (quantity) => {
      expect(
        purchaseReceiptSchema.shape.lines.element.safeParse({
          ...productLine,
          receivedQty: quantity,
        }).success,
      ).toBe(false);
      expect(
        stockCountSchema.shape.lines.element.safeParse({
          ...stockCountLine,
          systemQtySnapshot: '0',
          countedQty: quantity,
        }).success,
      ).toBe(false);
      expect(
        openingDocumentSchema.shape.lines.element.safeParse({
          ...openingLine,
          systemQtySnapshot: '0',
          countedQty: quantity,
        }).success,
      ).toBe(false);
    },
  );
});
