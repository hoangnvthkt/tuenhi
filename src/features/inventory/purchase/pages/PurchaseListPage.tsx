import { usePrivateQueryKey } from '@/features/auth';
import { useCursorList } from '@/shared/hooks/use-cursor-list';
import { ListPagination } from '@/shared/ui/feedback/ListPagination';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSession } from '@/features/auth';
import { createPurchaseApi } from '../api/purchase-api';
import { formatNumber, statusLabel } from '../../model/inventory-ui';
import { formatDay, groupByDay, purchasePeriod } from '../model/purchase-days';

function daySummary(items: { totalQuantity: string }[]) {
  const quantity = items.reduce(
    (sum, item) =>
      sum +
      (/^\d+$/.test(item.totalQuantity) ? BigInt(item.totalQuantity) : 0n),
    0n,
  );
  return `${items.length} phiếu · SL ${formatNumber(quantity.toString())}`;
}

export function PurchaseListPage() {
  const [api] = useState(createPurchaseApi);
  const { session } = useSession();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const month = params.get('month') ?? '';
  const day = params.get('day') ?? '';
  const period = purchasePeriod(month, day);
  const privateKey = usePrivateQueryKey();
  const query = useCursorList({
    queryKey: privateKey('purchase-receipts', status, period?.from, period?.to),
    load: (cursor: { updatedAt: string; id: string } | undefined) =>
      period
        ? api.list(status || undefined, cursor, period)
        : api.list(status || undefined, cursor),
    id: (item) => item.id,
  });
  const items = query.items;
  const days = groupByDay(items);
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'status' && key !== 'day') next.delete('day');
    setParams(next);
  };

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
      <label className="block text-sm font-medium">
        Trạng thái phiếu nhập
        <select
          aria-label="Trạng thái phiếu nhập"
          value={status}
          onChange={(event) => setParam('status', event.target.value)}
          className="ml-2 min-h-11 rounded-lg border border-slate-300 px-3"
        >
          <option value="">Tất cả trạng thái</option>
          {['DRAFT', 'AWAITING_COST', 'POSTED', 'REVERSED', 'CANCELLED'].map(
            (value) => (
              <option key={value} value={value}>
                {statusLabel[value]}
              </option>
            ),
          )}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <label htmlFor="purchase-month">Tháng nhập</label>
        <input
          id="purchase-month"
          type="month"
          value={month}
          onChange={(event) => setParam('month', event.target.value)}
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        />
        {month ? (
          <button
            type="button"
            onClick={() => setParam('month', '')}
            className="min-h-11 rounded-lg border border-slate-300 px-3"
          >
            Tất cả thời gian
          </button>
        ) : null}
        {day ? (
          <button
            type="button"
            onClick={() => setParam('day', '')}
            className="min-h-11 rounded-lg bg-teal-50 px-3 font-semibold text-teal-800"
            aria-label={`Bỏ lọc ngày ${formatDay(day)}`}
          >
            Ngày {formatDay(day)} ✕
          </button>
        ) : null}
      </div>
      {query.isSuccess && items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          {period
            ? 'Không có phiếu nhập trong thời gian này.'
            : 'Chưa có phiếu nhập nào.'}
        </p>
      ) : null}
      {days.map((group) => (
        <div
          key={group.day}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          {group.day && group.day !== day ? (
            <button
              type="button"
              onClick={() => setParam('day', group.day)}
              className="flex w-full flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 text-left font-semibold text-teal-800 hover:bg-slate-100"
            >
              <span>Ngày {formatDay(group.day)}</span>
              <span className="text-sm font-normal text-slate-600">
                {daySummary(group.items)}
              </span>
            </button>
          ) : (
            <p className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 font-semibold text-slate-950">
              <span>Ngày {formatDay(group.day)}</span>
              <span className="text-sm font-normal text-slate-600">
                {daySummary(group.items)}
              </span>
            </p>
          )}
          <ul className="divide-y divide-slate-200">
            {group.items.map((item) => (
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
                    {item.lineCount} mặt hàng ·{' '}
                    {formatNumber(item.totalQuantity)}
                  </p>
                  <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                    {statusLabel[item.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ListPagination query={query} />
    </section>
  );
}
