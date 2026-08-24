import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatViNumber } from '@/shared/lib/numeric/canonical-number';
import {
  createLegacySalesApi,
  type LegacySalesApi,
} from '../api/legacy-sales-api';

function money(value: string | null) {
  return value === null ? 'Không có dữ liệu' : `${formatViNumber(value)} ₫`;
}

export function LegacySalesPage({ api: apiProp }: { api?: LegacySalesApi }) {
  const [api] = useState(() => apiProp ?? createLegacySalesApi());
  const [searchParams] = useSearchParams();
  const importRunId = searchParams.get('importRunId') ?? undefined;
  const [draft, setDraft] = useState({
    search: '',
    from: '',
    to: '',
    quality: '',
  });
  const [filters, setFilters] = useState(draft);
  const [cursor, setCursor] = useState<{ soldOn: string; id: string }>();
  const query = useQuery({
    queryKey: ['legacy-sales', filters, importRunId, cursor],
    queryFn: () =>
      api.list({
        ...filters,
        quality:
          filters.quality === 'VALID' || filters.quality === 'WARNING'
            ? filters.quality
            : undefined,
        importRunId,
        cursor,
        limit: 30,
      }),
  });

  function search(event: FormEvent) {
    event.preventDefault();
    setCursor(undefined);
    setFilters({ ...draft, search: draft.search.trim() });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Dữ liệu cũ
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Tra cứu hóa đơn đã lưu từ workbook trước khi vận hành hệ thống.
          </p>
        </div>
        <span className="rounded-md bg-amber-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white">
          Chỉ để tra cứu
        </span>
      </div>
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        Dữ liệu này không tham gia doanh thu, lợi nhuận, thanh toán, tồn kho,
        trả hàng hoặc hủy hóa đơn.
      </p>

      <form
        onSubmit={search}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_10rem_10rem_11rem_auto] lg:items-end"
      >
        <div>
          <label
            htmlFor="legacy-search"
            className="mb-2 block text-sm font-semibold"
          >
            Tìm dữ liệu cũ
          </label>
          <input
            id="legacy-search"
            value={draft.search}
            onChange={(event) =>
              setDraft((value) => ({ ...value, search: event.target.value }))
            }
            placeholder="Mã đơn hoặc tên khách"
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>
        <div>
          <label
            htmlFor="legacy-from"
            className="mb-2 block text-sm font-semibold"
          >
            Từ ngày
          </label>
          <input
            id="legacy-from"
            type="date"
            value={draft.from}
            onChange={(event) =>
              setDraft((value) => ({ ...value, from: event.target.value }))
            }
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>
        <div>
          <label
            htmlFor="legacy-to"
            className="mb-2 block text-sm font-semibold"
          >
            Đến ngày
          </label>
          <input
            id="legacy-to"
            type="date"
            value={draft.to}
            onChange={(event) =>
              setDraft((value) => ({ ...value, to: event.target.value }))
            }
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>
        <div>
          <label
            htmlFor="legacy-quality"
            className="mb-2 block text-sm font-semibold"
          >
            Chất lượng
          </label>
          <select
            id="legacy-quality"
            value={draft.quality}
            onChange={(event) =>
              setDraft((value) => ({ ...value, quality: event.target.value }))
            }
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
          >
            <option value="">Tất cả</option>
            <option value="VALID">Hợp lệ</option>
            <option value="WARNING">Có cảnh báo</option>
          </select>
        </div>
        <button className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">
          Tìm kiếm
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {query.isPending ? (
          <p role="status" className="p-5 text-sm text-slate-600">
            Đang tải dữ liệu cũ…
          </p>
        ) : null}
        {query.isError ? (
          <div role="alert" className="p-5 text-sm text-red-800">
            <p>Không thể tải dữ liệu cũ. Vui lòng thử lại.</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold"
            >
              Thử lại
            </button>
          </div>
        ) : null}
        {query.data?.items.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">
            Không tìm thấy dữ liệu cũ phù hợp.
          </p>
        ) : null}
        <ul className="divide-y divide-slate-200">
          {query.data?.items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/legacy-sales/${item.id}`}
                className="grid gap-3 p-4 hover:bg-slate-50 md:grid-cols-[minmax(10rem,1fr)_9rem_10rem_10rem] md:items-center"
              >
                <div>
                  <p className="font-semibold text-slate-950">
                    {item.sourceSaleNumber}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.customerLabel || 'Không có tên khách'} ·{' '}
                    {item.channelLabel || 'Không có kênh'}
                  </p>
                </div>
                <p className="text-sm">
                  {item.soldOn
                    ? new Intl.DateTimeFormat('vi-VN').format(
                        new Date(`${item.soldOn}T00:00:00Z`),
                      )
                    : 'Ngày không xác định'}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {money(item.reportedNetTotal)}
                </p>
                <p>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${item.qualityStatus === 'WARNING' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}
                  >
                    {item.warningCount > 0
                      ? `${item.warningCount} cảnh báo`
                      : 'Hợp lệ'}
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {query.data?.nextCursor ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCursor(query.data?.nextCursor ?? undefined)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold"
          >
            Trang tiếp
          </button>
        </div>
      ) : null}
    </section>
  );
}
