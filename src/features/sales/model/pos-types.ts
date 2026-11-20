import type { CartLine } from '../api/sales-schemas';

export type PosCartItem = CartLine & {
  id?: string;
  productName: string;
  sku: string;
  unitName: string;
  unitSalePrice: string;
  onHandQty: string;
  primaryImagePath?: string | null;
  /** Discount per unit chosen at the POS; lineDiscountAmount = this × quantity. */
  unitDiscountAmount?: string;
};

export type PosPaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'SPLIT';
