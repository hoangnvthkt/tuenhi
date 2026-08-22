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
  useEffect(() => {
    let active = true;
    api
      .valuation()
      .then((data) => active && setPage(data))
      .catch(
        (reason: unknown) => active && setError(safeInventoryMessage(reason)),
      );
    return () => {
      active = false;
    };
  }, [api]);
  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Định giá tồn kho</h1>
        <p className="mt-1 text-sm text-slate-600">
          Số liệu giá vốn bình quân chỉ dành cho chủ cửa hàng.
        </p>
      </div>
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
        </>
      ) : null}
    </section>
  );
}
