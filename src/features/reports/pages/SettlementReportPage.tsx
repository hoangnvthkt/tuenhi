import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import { useCursorList } from '@/shared/hooks/use-cursor-list';
import { ListPagination } from '@/shared/ui/feedback/ListPagination';
import {
  createSaleSettlementsApi,
  settlementMethodSchema,
  type SettlementCursor,
} from '../api/settlements-api';
import { isIsoDate, presetReportRange } from '../model/report-period';
import { formatReportMoney } from '../model/report-ui';

const methods = {
  ALL: 'Tất cả hóa đơn',
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  DEBT: 'Nợ còn lại',
} as const;
const titles = {
  ALL: 'Thanh toán các đơn bán',
  CASH: 'Tiền mặt từ các đơn bán',
  BANK_TRANSFER: 'Chuyển khoản từ các đơn bán',
  DEBT: 'Nợ còn lại của các đơn bán',
} as const;
export function SettlementReportPage({
  api: apiProp,
}: {
  api?: ReturnType<typeof createSaleSettlementsApi>;
}) {
  const { session } = useSession();
  const privateKey = usePrivateQueryKey();
  const [api] = useState(() => apiProp ?? createSaleSettlementsApi());
  const [params] = useSearchParams();
  const today = presetReportRange('today');
  const requestedFrom = params.get('from'),
    requestedTo = params.get('to');
  const from = isIsoDate(requestedFrom) ? requestedFrom : today.from;
  const to = isIsoDate(requestedTo) ? requestedTo : today.to;
  const period = params.get('period') ?? 'today';
  const scope =
    session?.permissions.includes('report.all_revenue.read') &&
    params.get('scope') !== 'OWN'
      ? 'ALL'
      : 'OWN';
  const parsed = settlementMethodSchema.safeParse(params.get('method'));
  const method = parsed.success ? parsed.data : 'ALL';
  const query = useCursorList({
    queryKey: privateKey('sale-settlements', from, to, scope, method),
    load: (cursor: SettlementCursor | undefined) =>
      api.report(from, to, scope, method, cursor),
    id: (item) => item.id,
  });
  const rangeParams = new URLSearchParams({ period, from, to });
  const summary = query.data?.pages[0]?.summary;
  return (
    <section className="space-y-4">
      <Link
        to={`/?${rangeParams}`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800"
      >
        Về tổng quan
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{titles[method]}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Từ {from} đến {to} ·{' '}
          {scope === 'ALL' ? 'Toàn cửa hàng' : 'Các đơn của tôi'} · Giờ Việt Nam
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Số đã thu hiện tại của các đơn bán trong kỳ, bao gồm tiền trả nợ cho
          các đơn này và trừ tiền hoàn. Không cộng đơn bán ngoài kỳ; đơn hủy
          không còn số thu hay nợ.
        </p>
      </div>
      <nav aria-label="Lọc thanh toán" className="flex flex-wrap gap-2">
        {Object.entries(methods).map(([key, label]) => (
          <Link
            key={key}
            to={`?${rangeParams}&scope=${scope}&method=${key}`}
            aria-current={method === key ? 'page' : undefined}
            className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold ${method === key ? 'border-teal-700 bg-teal-50 text-teal-900' : 'border-slate-300 bg-white'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Tiền mặt', summary.cashAmount],
            ['Chuyển khoản', summary.bankTransferAmount],
            ['Nợ còn lại', summary.outstandingAmount],
          ].map(([label, amount]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="text-sm text-slate-600">{label}</p>
              <p className="mt-2 text-xl font-bold tabular-nums">
                {formatReportMoney(amount!)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              {[
                'Hóa đơn',
                'Khách hàng',
                'Ngày bán',
                'Tiền mặt',
                'Chuyển khoản',
                'Nợ còn lại',
              ].map((label) => (
                <th key={label} className="whitespace-nowrap p-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {query.items.map((item) => (
              <tr key={item.id}>
                <td className="p-3">
                  <Link
                    to={`/sales/${item.id}`}
                    className="inline-flex min-h-11 items-center font-semibold text-teal-800 underline"
                  >
                    {item.saleNumber}
                  </Link>
                  {item.status === 'CANCELLED' ? (
                    <p className="text-xs text-slate-500">Đã hủy</p>
                  ) : null}
                </td>
                <td className="p-3">{item.customerName ?? 'Khách lẻ'}</td>
                <td className="whitespace-nowrap p-3">
                  {new Intl.DateTimeFormat('vi-VN', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'Asia/Ho_Chi_Minh',
                  }).format(new Date(item.completedAt))}
                </td>
                <td className="whitespace-nowrap p-3 tabular-nums">
                  {formatReportMoney(item.cashAmount)}
                </td>
                <td className="whitespace-nowrap p-3 tabular-nums">
                  {formatReportMoney(item.bankTransferAmount)}
                </td>
                <td className="whitespace-nowrap p-3 font-semibold tabular-nums">
                  {formatReportMoney(item.outstandingAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.isLoading ? (
          <p role="status" className="p-5 text-slate-600">
            Đang tải hóa đơn…
          </p>
        ) : null}
        {query.isSuccess && !query.items.length ? (
          <p className="p-5 text-slate-600">
            Không có hóa đơn phù hợp với bộ lọc.
          </p>
        ) : null}
      </div>
      <ListPagination query={query} />
    </section>
  );
}
