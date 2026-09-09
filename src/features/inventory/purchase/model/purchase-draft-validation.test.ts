import { describe, expect, it } from 'vitest';
import { validatePurchaseDraftLines } from './purchase-draft-validation';

describe('validatePurchaseDraftLines', () => {
  it('rejects a draft when any editor row is empty, invalid or duplicated', () => {
    expect(
      validatePurchaseDraftLines([
        {
          productId: '10000000-0000-4000-8000-000000000001',
          receivedQty: '2',
          unitCost: '12500',
        },
        { productId: '', receivedQty: '1', unitCost: '' },
      ]),
    ).toEqual({ ok: false, lines: [] });
    expect(
      validatePurchaseDraftLines([
        {
          productId: '10000000-0000-4000-8000-000000000001',
          receivedQty: '2',
          unitCost: '12500',
        },
        {
          productId: '10000000-0000-4000-8000-000000000001',
          receivedQty: '3',
          unitCost: '12500',
        },
      ]),
    ).toEqual({ ok: false, lines: [] });
  });
});
