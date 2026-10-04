import { useState } from 'react';
import { Link } from 'react-router';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import { createCatalogApi, type CatalogCursor } from '@/features/catalog';
import { useCursorList } from '@/shared/hooks/use-cursor-list';
import { ListPagination } from '@/shared/ui/feedback/ListPagination';
import {
  INTEGER_FINAL,
  SIGNED_INTEGER_FINAL,
} from '@/shared/lib/numeric/canonical-number';
export function ReplenishmentPage() {
  const [api] = useState(createCatalogApi);
  const privateKey = usePrivateQueryKey();
  const { session } = useSession();
  const permissions = session?.permissions ?? [];
  const canRead =
    permissions.includes('catalog.read') &&
    permissions.includes('inventory.read');
  const canCreate = permissions.includes('purchase.draft.manage');
  const query = useCursorList({
    queryKey: privateKey('catalog', 'replenishment'),
    enabled: canRead,
    load: (cursor: CatalogCursor | undefined) =>
      api.list({
        stockState: 'LOW_STOCK',
        includeInactive: false,
        cursor,
        limit: 30,
      }),
    id: (item) => item.id,
  });
  if (!canRead) return <p role="alert">Bạn chưa có quyền xem tồn kho.</p>;
  const items = query.items.filter(
    (item) =>
      item.isActive &&
      (item.effectiveMinStockQty === undefined ||
        !INTEGER_FINAL.test(item.effectiveMinStockQty) ||
        !SIGNED_INTEGER_FINAL.test(item.onHandQty) ||
        BigInt(item.onHandQty) < BigInt(item.effectiveMinStockQty)),
  );
  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Cần nhập</h1>
        <p className="mt-1 text-sm text-slate-600">
          Hàng có tồn thấp hơn ngưỡng cảnh báo hiện tại. Số thiếu chỉ để tham
          khảo khi lập phiếu.
        </p>
      </header>
      <button
        type="button"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
        className="min-h-11 rounded-lg border border-slate-300 px-4"
      >
        Làm mới tồn kho
      </button>
      {query.isLoading ? <p role="status">Đang tải tồn kho…</p> : null}
      <ul className="space-y-3">
        {items.map((item) => {
          const threshold = item.effectiveMinStockQty;
          const known =
            threshold !== undefined &&
            INTEGER_FINAL.test(threshold) &&
            SIGNED_INTEGER_FINAL.test(item.onHandQty);
          const shortfall = known
            ? (BigInt(threshold) - BigInt(item.onHandQty)).toString()
            : null;
          return (
            <li
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <Link
                to={`/products/${item.id}`}
                className="font-semibold text-teal-800"
              >
                {item.name}
              </Link>
              <p className="text-sm text-slate-500">
                {item.sku} · {item.unitName}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <p>
                  Tồn: {item.onHandQty} {item.unitName}
                </p>
                <p>Ngưỡng: {known ? threshold : 'Chưa xác định'}</p>
                <p className="font-medium">
                  Thiếu tới ngưỡng:{' '}
                  {shortfall !== null
                    ? `${shortfall} ${item.unitName}`
                    : 'Chưa xác định'}
                </p>
              </div>
              {canCreate ? (
                <Link
                  to={`/more/purchases/new?productId=${encodeURIComponent(item.id)}`}
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-teal-700 px-3 text-sm font-medium text-teal-800"
                >
                  Lập phiếu nhập
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      {query.isSuccess && !items.length ? (
        <p>Không có mặt hàng thấp tồn trong dữ liệu đã tải.</p>
      ) : null}
      <ListPagination
        query={query}
        errorMessage="Không thể tải hàng cần nhập."
      />
    </section>
  );
}
