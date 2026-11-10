import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import {
  createLotsApi,
  lotStatusSchema,
  type LotStatus,
} from '../api/lots-api';
import { formatDate } from '../model/lot-ui';

const STATUS = {
  EXPIRED: {
    color: '#d03b3b',
    mark: 'M5.5 5.5l5 5M10.5 5.5l-5 5',
    label: 'Đã hết hạn',
    tone: 'text-red-700',
  },
  EXPIRING: {
    color: '#fab219',
    mark: 'M8 4.5v4.2M8 11.2v.3',
    label: 'Sắp hết hạn',
    tone: 'text-amber-800',
  },
  OK: {
    color: '#0ca30c',
    mark: 'M5 8.2 7 10.2 11 6',
    label: 'Còn hạn',
    tone: 'text-emerald-800',
  },
} as const;

function StatusIcon({ status }: { status: LotStatus }) {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill={STATUS[status].color} />
      <path
        d={STATUS[status].mark}
        fill="none"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ExpiryPage() {
  const { session } = useSession();
  const privateKey = usePrivateQueryKey();
  const [api] = useState(createLotsApi);
  const [params, setParams] = useSearchParams();
  const parsed = lotStatusSchema.safeParse(params.get('status'));
  const status = parsed.success ? parsed.data : null;
  const list = useQuery({
    queryKey: privateKey('lot-list', status ?? 'ALL'),
    queryFn: () => api.list(status ?? 'ALL'),
  });
  const data = list.data;
  const canWriteOff =
    session?.permissions.includes('inventory.writeoff.post') ?? false;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Hạn sử dụng
        </h1>
        {canWriteOff ? (
          <Link
            to="/more/write-offs"
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            Xuất hủy
          </Link>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(['EXPIRED', 'EXPIRING', 'OK'] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={status === key}
            onClick={() => setParams(status === key ? {} : { status: key })}
            className={`flex min-h-16 items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm ${status === key ? 'border-teal-700 ring-1 ring-teal-700' : 'border-slate-200'}`}
          >
            <StatusIcon status={key} />
            <span>
              <span className="block text-sm text-slate-600">
                {STATUS[key].label}
                {key === 'EXPIRING' && data
                  ? ` (≤ ${data.warningDays} ngày)`
                  : ''}
              </span>
              {data ? (
                <span className="text-xl font-bold tabular-nums">
                  {
                    data.summary[
                      key === 'OK'
                        ? 'ok'
                        : key === 'EXPIRED'
                          ? 'expired'
                          : 'expiring'
                    ]
                  }{' '}
                  lô
                </span>
              ) : (
                <span
                  role="status"
                  aria-label={`Đang tải ${STATUS[key].label.toLowerCase()}`}
                  className="block h-7 w-16 animate-pulse rounded bg-slate-200"
                />
              )}
            </span>
          </button>
        ))}
      </div>
      {list.isError ? (
        <p role="alert" className="text-sm text-red-800">
          Không tải được danh sách lô.
        </p>
      ) : null}
      {data ? (
        data.items.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Chưa có lô nào còn hàng.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="p-3 font-semibold">Sản phẩm</th>
                  <th className="hidden p-3 font-semibold sm:table-cell">
                    Số lô
                  </th>
                  <th className="hidden p-3 font-semibold sm:table-cell">
                    Hạn dùng
                  </th>
                  <th className="p-3 font-semibold">Trạng thái</th>
                  <th className="p-3 text-right font-semibold">Còn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((lot) => (
                  <tr key={lot.lotId}>
                    <td className="p-3">
                      <Link
                        to={`/products/${lot.productId}`}
                        className="font-semibold text-teal-800 underline"
                      >
                        {lot.productName}
                      </Link>
                      <p className="text-xs text-slate-600 sm:hidden">
                        {lot.lotNumber ?? 'Không số lô'} ·{' '}
                        {formatDate(lot.expiryDate)}
                      </p>
                    </td>
                    <td className="hidden p-3 sm:table-cell">
                      {lot.lotNumber ?? '—'}
                    </td>
                    <td className="hidden p-3 tabular-nums sm:table-cell">
                      {formatDate(lot.expiryDate)}
                    </td>
                    <td
                      className={`p-3 font-semibold ${STATUS[lot.status].tone}`}
                    >
                      {lot.daysLeft < 0
                        ? `Hết hạn ${-lot.daysLeft} ngày`
                        : `Còn ${lot.daysLeft} ngày`}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {lot.quantity} {lot.unitName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : list.isPending ? (
        <div
          role="status"
          aria-label="Đang tải danh sách lô"
          className="h-24 animate-pulse rounded-2xl bg-slate-200"
        />
      ) : null}
      {data && data.unassigned.length ? (
        <section aria-label="Chưa có lô" className="space-y-2">
          <h2 className="text-base font-semibold text-slate-950">Chưa có lô</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {data.unassigned.map((item) => (
              <li
                key={item.productId}
                className="flex min-h-12 items-center justify-between gap-3 px-3 text-sm"
              >
                <Link
                  to={`/products/${item.productId}`}
                  className="font-semibold text-teal-800 underline"
                >
                  {item.productName}
                </Link>
                <span className="tabular-nums">
                  {item.quantity} {item.unitName}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
