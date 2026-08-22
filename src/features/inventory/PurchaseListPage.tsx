import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../auth/use-session';
import { createInventoryApi } from './inventory-api';
import {
  formatNumber,
  safeInventoryMessage,
  statusLabel,
} from './inventory-ui';

export function PurchaseListPage() {
  const [api] = useState(createInventoryApi);
  const { session } = useSession();
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof api.listPurchases>>['items']
  >([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api
      .listPurchases()
      .then((page) => active && setItems(page.items))
      .catch(
        (reason: unknown) => active && setError(safeInventoryMessage(reason)),
      );
    return () => {
      active = false;
    };
  }, [api]);
  const canCreate = session?.permissions.includes('purchase.draft.manage');
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Phiếu nhập hàng</h1>
          <p className="mt-1 text-sm text-slate-600">
            Theo dõi số lượng nhập; giá vốn chỉ hiển thị cho chủ cửa hàng.
          </p>
        </div>
        {canCreate ? (
          <Link
            className="rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white"
            to="/more/purchases/new"
          >
            Lập phiếu nhập
          </Link>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {items.length === 0 && !error ? (
          <p className="p-5 text-sm text-slate-600">Chưa có phiếu nhập nào.</p>
        ) : null}
        <ul className="divide-y divide-slate-200">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/more/purchases/${item.id}`}
                className="grid gap-2 p-4 hover:bg-slate-50 md:grid-cols-[1fr_auto_auto] md:items-center"
              >
                <div>
                  <p className="font-bold text-slate-950">
                    {item.receiptNumber ?? 'Phiếu nháp'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {item.supplierName ?? 'Không chọn nhà cung cấp'} ·{' '}
                    {item.createdByName}
                  </p>
                </div>
                <p className="text-sm tabular-nums text-slate-700">
                  {item.lineCount} mặt hàng · {formatNumber(item.totalQuantity)}
                </p>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                  {statusLabel[item.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
