import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { useSession } from '../auth/use-session';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { buildReportWorkbook, downloadReportWorkbook } from './report-workbook';
import { createReportsApi, type ProfitPage } from './reports-api';
import {
  isIsoDate,
  presetReportRange,
  type ReportPeriod,
} from './report-period';
import {
  eventLabel,
  formatReportMoney,
  formatReportNumber,
  paymentLabel,
} from './report-ui';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">
        {value}
      </p>
    </div>
  );
}
function ErrorBox({ error }: { error: unknown }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      {error instanceof Error
        ? error.message
        : 'Không thể tải báo cáo. Vui lòng thử lại.'}
    </p>
  );
}

export function ReportPage() {
  const { session } = useSession();
  const online = useOnlineStatus();
  const [params, setParams] = useSearchParams();
  const [api] = useState(createReportsApi);
  const canAll =
    session?.permissions.includes('report.all_revenue.read') ?? false;
  const canProfit =
    session?.permissions.includes('report.cost_profit.read') ?? false;
  const requestedPeriod = params.get('period');
  const period: ReportPeriod =
    requestedPeriod === 'today' ||
    requestedPeriod === 'week' ||
    requestedPeriod === 'custom'
      ? requestedPeriod
      : 'month';
  const fallback = presetReportRange(period === 'custom' ? 'month' : period);
  const requestedFrom = params.get('from');
  const requestedTo = params.get('to');
  const from = isIsoDate(requestedFrom) ? requestedFrom : fallback.from;
  const to = isIsoDate(requestedTo) ? requestedTo : fallback.to;
  const scope = canAll && params.get('scope') !== 'OWN' ? 'ALL' : 'OWN';
  const queryOptions = {
    refetchInterval: () =>
      online && document.visibilityState === 'visible' ? 60_000 : false,
    refetchOnWindowFocus: true,
  };
  const report = useQuery({
    queryKey: ['reports', from, to, scope],
    queryFn: () => api.revenue(from, to, scope),
    ...queryOptions,
  });
  const owner = useQuery({
    queryKey: ['owner-dashboard', from, to],
    queryFn: () => api.owner(from, to),
    enabled: canProfit,
    gcTime: 0,
    ...queryOptions,
  });
  const profit = useQuery({
    queryKey: ['profit-report', from, to],
    queryFn: () => api.profit(from, to),
    enabled: canProfit,
    gcTime: 0,
    ...queryOptions,
  });
  const [exporting, setExporting] = useState(false);
  const [profitPageState, setProfitPageState] = useState<{
    key: string;
    pages: ProfitPage[];
  }>({ key: '', pages: [] });
  const [loadingMoreProfit, setLoadingMoreProfit] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const setPeriod = (next: ReportPeriod) => {
    const range = presetReportRange(next === 'custom' ? 'month' : next);
    setParams({ period: next, from: range.from, to: range.to, scope });
  };
  const refresh = () => {
    void report.refetch();
    if (canProfit) {
      void owner.refetch();
      void profit.refetch();
    }
  };
  const exportWorkbook = async () => {
    if (!report.data) return;
    setExporting(true);
    setExportError(null);
    try {
      let exportProfit = canProfit ? profit.data : undefined;
      let cursor = exportProfit?.nextCursor ?? null;
      let exportedCount = exportProfit?.items.length ?? 0;
      while (cursor && exportedCount < 10_000) {
        const next = await api.profit(from, to, cursor);
        exportProfit = {
          version: 1,
          items: [...(exportProfit?.items ?? []), ...next.items],
          nextCursor: next.nextCursor,
        };
        exportedCount += next.items.length;
        cursor = next.nextCursor;
      }
      if (cursor) {
        setExportError(
          'Khoảng thời gian có quá nhiều sự kiện. Vui lòng thu hẹp khoảng ngày trước khi xuất.',
        );
        return;
      }
      const blob = await buildReportWorkbook(report.data, exportProfit);
      downloadReportWorkbook(blob, `bao-cao-${from}-${to}.xlsx`);
    } finally {
      setExporting(false);
    }
  };
  useEffect(() => {
    if (!canAll && params.get('scope') === 'ALL')
      setParams({ period, from, to, scope: 'OWN' }, { replace: true });
  }, [canAll, from, params, period, setParams, to]);
  const profitPageKey = `${from}:${to}`;
  const profitPages =
    profitPageState.key === profitPageKey ? profitPageState.pages : [];
  const visibleProfitItems = [
    ...(profit.data?.items ?? []),
    ...profitPages.flatMap((page) => page.items),
  ];
  const profitCursor =
    profitPages.at(-1)?.nextCursor ?? profit.data?.nextCursor ?? null;
  async function loadMoreProfit() {
    if (!profitCursor) return;
    setLoadingMoreProfit(true);
    try {
      const next = await api.profit(from, to, profitCursor);
      setProfitPageState((state) => ({
        key: profitPageKey,
        pages: state.key === profitPageKey ? [...state.pages, next] : [next],
      }));
    } finally {
      setLoadingMoreProfit(false);
    }
  }
  const isLoading =
    report.isLoading || (canProfit && (owner.isLoading || profit.isLoading));
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Báo cáo
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Doanh thu được ghi nhận theo ngày phát sinh sự kiện tại Việt Nam.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={!online || isLoading}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => void exportWorkbook()}
            disabled={!report.data || exporting}
            className="min-h-11 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {exporting ? 'Đang tạo XLSX…' : 'Xuất XLSX'}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Khoảng thời gian">
        {(['today', 'week', 'month', 'custom'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setPeriod(item)}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${period === item ? 'bg-teal-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
          >
            {item === 'today'
              ? 'Hôm nay'
              : item === 'week'
                ? 'Tuần này'
                : item === 'month'
                  ? 'Tháng này'
                  : 'Tùy chọn'}
          </button>
        ))}
      </div>
      {period === 'custom' ? (
        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-sm font-medium">
            Từ ngày
            <input
              type="date"
              value={from}
              onChange={(event) =>
                setParams({ period, from: event.target.value, to, scope })
              }
              className="ml-2 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="text-sm font-medium">
            Đến ngày
            <input
              type="date"
              value={to}
              onChange={(event) =>
                setParams({ period, from, to: event.target.value, scope })
              }
              className="ml-2 rounded border border-slate-300 p-2"
            />
          </label>
        </div>
      ) : null}
      {canAll ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setParams({ period, from, to, scope: 'ALL' })}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${scope === 'ALL' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white'}`}
          >
            Toàn cửa hàng
          </button>
          <button
            type="button"
            onClick={() => setParams({ period, from, to, scope: 'OWN' })}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${scope === 'OWN' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white'}`}
          >
            Của tôi
          </button>
        </div>
      ) : null}
      {!online ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Bạn đang ngoại tuyến. Báo cáo sẽ được làm mới khi có kết nối.
        </p>
      ) : null}
      {report.error ? <ErrorBox error={report.error} /> : null}
      {exportError ? <ErrorBox error={new Error(exportError)} /> : null}
      {owner.error ? <ErrorBox error={owner.error} /> : null}
      {profit.error ? <ErrorBox error={profit.error} /> : null}
      {isLoading ? (
        <div role="status" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl bg-slate-200"
            />
          ))}
        </div>
      ) : null}
      {report.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Đơn hoàn tất"
              value={formatReportNumber(
                String(report.data.summary.completedOrderCount),
                0,
              )}
            />
            <Metric
              label="Doanh thu gộp"
              value={formatReportMoney(report.data.summary.grossSales)}
            />
            <Metric
              label="Doanh thu thuần"
              value={formatReportMoney(report.data.summary.netRevenue)}
            />
            <Metric
              label="Giá trị đơn TB"
              value={
                report.data.summary.averageOrderValue
                  ? formatReportMoney(report.data.summary.averageOrderValue)
                  : '—'
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Giảm dòng"
              value={formatReportMoney(report.data.summary.lineDiscounts)}
            />
            <Metric
              label="Trả hàng"
              value={formatReportMoney(report.data.summary.salesReturns)}
            />
            <Metric
              label="Hủy hóa đơn"
              value={formatReportMoney(report.data.summary.cancellations)}
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Breakdown
              title="Theo kênh bán"
              rows={report.data.channels.map((item) => [
                item.name,
                formatReportMoney(item.netRevenue),
              ])}
            />
            <Breakdown
              title="Theo phương thức thanh toán"
              rows={report.data.paymentMethods.map((item) => [
                paymentLabel(item.method),
                formatReportMoney(item.netRevenue),
              ])}
            />
          </div>
          <Breakdown
            title="Theo ngày"
            rows={report.data.daily.map((item) => [
              item.day,
              formatReportMoney(item.netRevenue),
            ])}
          />
        </>
      ) : null}
      {canProfit && owner.data ? (
        <>
          <h2 className="pt-2 text-xl font-bold text-slate-950">
            Lợi nhuận gộp
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Giá vốn thuần"
              value={formatReportMoney(owner.data.netCogs)}
            />
            <Metric
              label="Lợi nhuận gộp"
              value={formatReportMoney(owner.data.grossProfit)}
            />
            <Metric
              label="Tỷ suất lợi nhuận"
              value={
                owner.data.grossMarginPct
                  ? `${formatReportNumber(owner.data.grossMarginPct, 2)}%`
                  : '—'
              }
            />
            <Metric
              label="Giá trị tồn hiện tại"
              value={formatReportMoney(owner.data.inventoryValue)}
            />
          </div>
          {profit.data ? (
            <>
              <ProfitTable items={visibleProfitItems} />
              {profitCursor ? (
                <button
                  type="button"
                  onClick={() => void loadMoreProfit()}
                  disabled={loadingMoreProfit}
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  {loadingMoreProfit ? 'Đang tải…' : 'Tải thêm sự kiện'}
                </button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
function Breakdown({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <h2 className="border-b border-slate-200 p-4 text-base font-bold text-slate-950">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-slate-600">
          Chưa có dữ liệu trong kỳ đã chọn.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 p-3 text-sm">
              <span className="text-slate-700">{label}</span>
              <strong className="tabular-nums text-slate-950">{value}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function ProfitTable({ items }: { items: ProfitPage['items'] }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <h2 className="p-4 text-base font-bold text-slate-950">
        Sự kiện tài chính
      </h2>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="p-3">Thời điểm</th>
            <th className="p-3">Loại</th>
            <th className="p-3">Chứng từ</th>
            <th className="p-3 text-right">DT thuần</th>
            <th className="p-3 text-right">Giá vốn</th>
            <th className="p-3 text-right">LN gộp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="p-3 whitespace-nowrap">
                {new Intl.DateTimeFormat('vi-VN', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: 'Asia/Ho_Chi_Minh',
                }).format(new Date(item.occurredAt))}
              </td>
              <td className="p-3">{eventLabel(item.eventType)}</td>
              <td className="p-3">{item.returnNumber ?? item.saleNumber}</td>
              <td className="p-3 text-right tabular-nums">
                {formatReportMoney(item.netRevenue)}
              </td>
              <td className="p-3 text-right tabular-nums">
                {formatReportMoney(item.netCogs)}
              </td>
              <td className="p-3 text-right font-semibold tabular-nums">
                {formatReportMoney(item.grossProfit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
