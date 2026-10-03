export type PurchaseDraftLine = {
  productId: string;
  selectedSnapshot?: { id: string; name: string; sku: string };
  receivedQty: string;
  unitCost: string;
};
