import type { CartLine } from '../api/sales-schemas';

export type PosCartItem = CartLine & {
  productName: string;
  sku: string;
  unitName: string;
  unitSalePrice: string;
  onHandQty: string;
};

export type PosPaymentMethod = 'CASH' | 'BANK_TRANSFER';
