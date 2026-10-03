import { expect, it, vi } from 'vitest';
import { createSalesApi } from '@/features/sales/api/sales-api';
import { createReturnsApi } from '@/features/returns/api/returns-api';
import { createStockCountApi } from '@/features/inventory/stock-count/api/stock-count-api';
import { createPurchaseApi } from '@/features/inventory/purchase/api/purchase-api';
import { createOpeningApi } from '@/features/inventory/opening/api/opening-api';
import { createNotificationApi } from '@/features/notifications/api/notification-api';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/shared/supabase/client', () => ({
  getSupabaseClient: () => ({ rpc }),
}));
const id = '10000000-0000-4000-8000-000000000001';
const at = '2026-10-01T00:00:00Z';
const cases = [
  {
    name: 'list_sales_v2',
    cursor: { sortAt: at, id },
    call: () => createSalesApi().list({ status: 'DRAFT' }, { sortAt: at, id }),
    args: { p_cursor_sort_at: at, p_cursor_id: id },
  },
  {
    name: 'list_sale_returns_v2',
    cursor: { updatedAt: at, id },
    call: () =>
      createReturnsApi().list({ status: 'DRAFT' }, { updatedAt: at, id }),
    args: { p_cursor_updated_at: at, p_cursor_id: id },
  },
  {
    name: 'list_stock_counts_v2',
    cursor: { updatedAt: at, id },
    call: () => createStockCountApi().list('DRAFT', { updatedAt: at, id }),
    args: { p_cursor_updated_at: at, p_cursor_id: id },
  },
  {
    name: 'list_purchase_receipts',
    cursor: { updatedAt: at, id },
    call: () => createPurchaseApi().list('DRAFT', { updatedAt: at, id }),
    args: { p_cursor_updated_at: at, p_cursor_id: id },
  },
  {
    name: 'list_opening_stock_documents',
    cursor: { updatedAt: at, id },
    call: () => createOpeningApi().list({ updatedAt: at, id }),
    args: { p_cursor_updated_at: at, p_cursor_id: id },
  },
  {
    name: 'get_my_notifications',
    cursor: { createdAt: at, id },
    call: () =>
      createNotificationApi().list({
        unreadOnly: true,
        cursor: { createdAt: at, id },
      }),
    args: { p_cursor_created_at: at, p_cursor_id: id, p_unread_only: true },
  },
];
for (const item of cases)
  it(`${item.name} sends and parses a page cursor`, async () => {
    rpc.mockResolvedValueOnce({
      error: null,
      data: {
        ok: true,
        data: { items: [], nextCursor: item.cursor, unreadCount: 0 },
        error: null,
        correlationId: id,
      },
    });
    expect((await item.call()).nextCursor).toEqual(item.cursor);
    expect(rpc).toHaveBeenLastCalledWith(
      item.name,
      expect.objectContaining(item.args),
    );
  });
