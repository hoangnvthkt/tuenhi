export type ImportTarget =
  | 'CATEGORIES'
  | 'PRODUCTS'
  | 'SUPPLIERS'
  | 'CUSTOMERS'
  | 'OPENING_BALANCES'
  | 'PURCHASE_RECEIPT';

export type ImportMode = 'CREATE_ONLY' | 'UPDATE_EXISTING';
