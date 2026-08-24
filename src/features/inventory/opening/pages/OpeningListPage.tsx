import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { createOpeningApi } from '../api/opening-api';
import {
  formatMoney,
  formatNumber,
  safeInventoryMessage,
  statusLabel,
} from '../../model/inventory-ui';

export function OpeningListPage() {
  const [api] = useState(createOpeningApi);
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof api.list>>['items']
  >([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api
      .list()
      .then((page) => active && setItems(page.items))
      .catch(
        (reason: unknown) => active && setError(safeInventoryMessage(reason)),
      );
    return () => {
      active = false;
    };
  }, [api]);
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mở sổ tồn đầu kỳ</h1>
          <p className="mt-1 text-sm text-slate-600">
            Mỗi sản phẩm chỉ được ghi sổ tồn đầu kỳ một lần.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/imports?target=OPENING_BALANCES"
            className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold"
          >
            Nhập từ Excel
          </Link>
          <Link
            to="/more/inventory/opening/new"
            className="rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white"
          >
            Tạo phiếu
          </Link>
        </div>
      </div>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
        Phiếu Excel và gợi ý dữ liệu cũ luôn bắt đầu ở trạng thái nháp. Chỉ nút
        “Ghi sổ” mới thay đổi tồn kho.
      </p>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-200">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/more/inventory/opening/${item.id}`}
                className="grid gap-2 p-4 hover:bg-slate-50 md:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="font-bold">
                    {item.countNumber ?? 'Phiếu mở sổ nháp'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {item.createdByName} · {item.lineCount} sản phẩm
                  </p>
                </div>
                <p className="text-sm tabular-nums">
                  {formatNumber(item.totalQuantity)} ·{' '}
                  {formatMoney(item.totalValue)}
                </p>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                  {statusLabel[item.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {items.length === 0 && !error ? (
          <p className="p-5 text-sm text-slate-600">Chưa có phiếu mở sổ.</p>
        ) : null}
      </div>
    </section>
  );
}
