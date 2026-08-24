import {
  createInventoryRpc,
  inventoryMutationSchema,
  nullable,
} from '../../api/inventory-rpc';
import { stockCountPageSchema, stockCountSchema } from './stock-count-schemas';

export function createStockCountApi() {
  const rpc = createInventoryRpc();
  return {
    list(status?: string) {
      return rpc(
        'list_stock_counts',
        {
          p_filters: status ? { status } : {},
          p_cursor_updated_at: null,
          p_cursor_id: null,
          p_limit: 100,
        },
        stockCountPageSchema,
      );
    },
    detail(id: string) {
      return rpc('get_stock_count', { p_count_id: id }, stockCountSchema);
    },
    save(input: {
      id?: string;
      expectedVersion?: number;
      note: string;
      lines: Array<{ productId: string; countedQty: string | null }>;
      idempotencyKey: string;
    }) {
      return rpc(
        'save_stock_count',
        {
          p_count_id: nullable(input.id),
          p_expected_version: nullable(input.expectedVersion),
          p_note: input.note || null,
          p_lines: input.lines.map((line) => ({
            productId: line.productId,
            countedQty: line.countedQty,
          })),
          p_idempotency_key: input.idempotencyKey,
        },
        inventoryMutationSchema,
      );
    },
    command(
      command: 'submit' | 'refresh' | 'cancel',
      id: string,
      version: number,
      reason = '',
    ) {
      const names = {
        submit: 'submit_stock_count',
        refresh: 'refresh_stock_count_snapshot',
        cancel: 'cancel_stock_count',
      } as const;
      const args =
        command === 'cancel'
          ? {
              p_count_id: id,
              p_expected_version: version,
              p_reason: reason,
              p_idempotency_key: crypto.randomUUID(),
            }
          : {
              p_count_id: id,
              p_expected_version: version,
              p_idempotency_key: crypto.randomUUID(),
            };
      return rpc(names[command], args, inventoryMutationSchema);
    },
    post(
      id: string,
      version: number,
      estimates: Array<{
        stockCountLineId: string;
        estimatedUnitCost: string;
      }>,
    ) {
      return rpc(
        'post_stock_count',
        {
          p_count_id: id,
          p_expected_version: version,
          p_estimated_costs: estimates,
          p_idempotency_key: crypto.randomUUID(),
        },
        inventoryMutationSchema,
      );
    },
  };
}

export type StockCountApi = ReturnType<typeof createStockCountApi>;
