import { useEffect, useState } from 'react';
import { createInventoryApi, type ValuationPage } from './inventory-api';
import {
  formatMoney,
  formatNumber,
  safeInventoryMessage,
} from './inventory-ui';

export function InventoryValuationPage() {
  const [api] = useState(createInventoryApi);
  const [page, setPage] = useState<ValuationPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .valuation(search)
      .then((data) => active && setPage(data))
      .catch(
        (reason: unknown) => active && setError(safeInventoryMessage(reason)),
      );
    return () => {
      active = false;
    };
  }, [api, search]);
  async function loadMore() {
    if (!page?.nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await api.valuation(search, page.nextCursor);
      setPage((current) =>
        current ? { ...next, items: [...current.items, ...next.items] } : next,
      );
    } catch (reason) {
      setError(safeInventoryMessage(reason));
    } finally {
      setLoadingMore(false);
    }
  }
  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Định giá tồn kho</h1>
        <p className="mt-1 text-sm text-slate-600">
          Số liệu giá vốn bình quân chỉ dành cho chủ cửa hàng.
        </p>
      </div>
      <label className="block max-w-md text-sm font-medium text-slate-700">
        Tìm theo tên hoặc SKU
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
          placeholder="Nhập tên hoặc SKU"
        />
      </label>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {page ? (
        <>
          <div className="rounded-xl bg-slate-950 p-5 text-white">
            <p className="text-sm text-slate-300">Tổng giá trị tồn kho</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {formatMoney(page.totalInventoryValue)}
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Sản phẩm</th>
                  <th className="p-3 text-right">Tồn</th>
                  <th className="p-3 text-right">Giá vốn bình quân</th>
                  <th className="p-3 text-right">Giá trị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {page.items.map((item) => (
                  <tr key={item.productId}>
                    <td className="p-3">
                      <strong>{item.name}</strong>
                      <span className="block text-xs text-slate-500">
                        {item.sku} · {item.unitName}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatNumber(item.onHandQty)}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatMoney(item.avgUnitCost)}
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums">
                      {formatMoney(item.inventoryValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.nextCursor ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              {loadingMore ? 'Đang tải…' : 'Tải thêm'}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
