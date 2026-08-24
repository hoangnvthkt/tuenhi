import {
  createInventoryRpc,
  inventoryMutationSchema,
  nullable,
} from '../../api/inventory-rpc';
import {
  openingDocumentSchema,
  openingPageSchema,
  openingSuggestionPageSchema,
} from './opening-schemas';

export function createOpeningApi() {
  const rpc = createInventoryRpc();
  return {
    list() {
      return rpc(
        'list_opening_stock_documents',
        { p_cursor_updated_at: null, p_cursor_id: null, p_limit: 100 },
        openingPageSchema,
      );
    },
    detail(id: string) {
      return rpc(
        'get_opening_stock_document',
        { p_count_id: id },
        openingDocumentSchema,
      );
    },
    save(input: {
      id?: string;
      expectedVersion?: number;
      note: string;
      lines: Array<{
        productId: string;
        countedQty: string;
        openingUnitCost: string;
        sourceSuggestionId: string | null;
        confirmedUnverified: boolean;
      }>;
    }) {
      return rpc(
        'save_opening_stock_draft',
        {
          p_count_id: nullable(input.id),
          p_expected_version: nullable(input.expectedVersion),
          p_note: input.note || null,
          p_lines: input.lines,
          p_idempotency_key: crypto.randomUUID(),
        },
        inventoryMutationSchema,
      );
    },
    command(
      command: 'submit' | 'post' | 'cancel',
      id: string,
      version: number,
      reason = '',
    ) {
      const names = {
        submit: 'submit_opening_stock',
        post: 'post_opening_stock',
        cancel: 'cancel_opening_stock',
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
    suggestions() {
      return rpc(
        'list_opening_balance_suggestions',
        { p_cursor_id: null, p_limit: 100 },
        openingSuggestionPageSchema,
      );
    },
  };
}

export type OpeningApi = ReturnType<typeof createOpeningApi>;
