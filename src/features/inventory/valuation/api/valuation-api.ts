import { createInventoryRpc } from '../../api/inventory-rpc';
import { valuationPageSchema } from './valuation-schemas';

export function createValuationApi() {
  const rpc = createInventoryRpc();
  return {
    list(search = '', cursor?: { name: string; id: string } | null) {
      return rpc(
        'get_inventory_valuation',
        {
          p_search: search || null,
          p_cursor_name: cursor?.name ?? null,
          p_cursor_id: cursor?.id ?? null,
          p_limit: 50,
        },
        valuationPageSchema,
      );
    },
  };
}

export type ValuationApi = ReturnType<typeof createValuationApi>;
