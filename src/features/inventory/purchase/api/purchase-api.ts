import {
  inventoryMutationSchema,
  createInventoryRpc,
  nullable,
} from '../../api/inventory-rpc';
import {
  purchaseCostSchema,
  purchasePageSchema,
  purchaseReceiptSchema,
} from './purchase-schemas';

export function createPurchaseApi() {
  const rpc = createInventoryRpc();
  return {
    list(status?: string) {
      return rpc(
        'list_purchase_receipts',
        {
          p_filters: status ? { status } : {},
          p_cursor_updated_at: null,
          p_cursor_id: null,
          p_limit: 100,
        },
        purchasePageSchema,
      );
    },
    detail(id: string) {
      return rpc(
        'get_purchase_receipt_operational',
        { p_receipt_id: id },
        purchaseReceiptSchema,
      );
    },
    cost(id: string) {
      return rpc(
        'get_purchase_receipt_cost_detail',
        { p_receipt_id: id },
        purchaseCostSchema,
      );
    },
    save(input: {
      id?: string;
      expectedVersion?: number;
      supplierId?: string;
      receivedAt: string;
      note: string;
      lines: Array<{ productId: string; receivedQty: string }>;
      idempotencyKey: string;
    }) {
      return rpc(
        'save_purchase_receipt_draft',
        {
          p_receipt_id: nullable(input.id),
          p_expected_version: nullable(input.expectedVersion),
          p_supplier_id: nullable(input.supplierId),
          p_received_at: input.receivedAt,
          p_note: input.note || null,
          p_lines: input.lines,
          p_idempotency_key: input.idempotencyKey,
        },
        inventoryMutationSchema,
      );
    },
    command(
      command: 'submit' | 'cancel' | 'reverse',
      id: string,
      version: number,
      reason = '',
    ) {
      const names = {
        submit: 'submit_purchase_receipt',
        cancel: 'cancel_purchase_receipt',
        reverse: 'reverse_purchase_receipt',
      } as const;
      const args =
        command === 'submit'
          ? {
              p_receipt_id: id,
              p_expected_version: version,
              p_idempotency_key: crypto.randomUUID(),
            }
          : command === 'cancel'
            ? {
                p_receipt_id: id,
                p_expected_version: version,
                p_reason: reason,
                p_idempotency_key: crypto.randomUUID(),
              }
            : {
                p_receipt_id: id,
                p_reason: reason,
                p_idempotency_key: crypto.randomUUID(),
              };
      return rpc(names[command], args, inventoryMutationSchema);
    },
    post(
      id: string,
      version: number,
      costs: Array<{ lineId: string; unitCost: string }>,
    ) {
      return rpc(
        'post_purchase_receipt',
        {
          p_receipt_id: id,
          p_expected_version: version,
          p_cost_lines: costs,
          p_idempotency_key: crypto.randomUUID(),
        },
        inventoryMutationSchema,
      );
    },
  };
}

export type PurchaseApi = ReturnType<typeof createPurchaseApi>;
