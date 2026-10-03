import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSession } from '@/features/auth';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import {
  buildReportWorkbook,
  downloadReportWorkbook,
} from '../export/report-workbook';
import {
  ProfitEventTable,
  ReportBreakdown,
  ReportErrorBox,
  ReportMetric,
} from '../components/report-sections';
import { ReportFilters, ReportHeader } from '../components/report-controls';
import { useReportData } from '../hooks/use-report-data';
import {
  isIsoDate,
  presetReportRange,
  type ReportPeriod,
} from '../model/report-period';
import {
  formatReportMoney,
  formatReportNumber,
  paymentLabel,
} from '../model/report-ui';

export function ReportPage() {
  const { session } = useSession();
  const online = useOnlineStatus();
  const [params, setParams] = useSearchParams();
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
  const { report, owner, profit, ownerApi } = useReportData({
    from,
    to,
    scope,
    canProfit,
    online,
  });
  const [exporting, setExporting] = useState(false);
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
        const next = await ownerApi.profit(from, to, cursor);
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
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : 'Không thể xuất báo cáo. Vui lòng thử lại.',
      );
    } finally {
      setExporting(false);
    }
  };
  useEffect(() => {
    if (!canAll && params.get('scope') === 'ALL')
      setParams({ period, from, to, scope: 'OWN' }, { replace: true });
  }, [canAll, from, params, period, setParams, to]);
  const isLoading =
    report.isLoading || (canProfit && (owner.isLoading || profit.isLoading));
  return (
    <section className="space-y-5">
      <ReportHeader
        online={online}
        loading={isLoading}
        exporting={exporting}
        canExport={Boolean(report.data)}
        onRefresh={refresh}
        onExport={() => void exportWorkbook()}
      />
      <ReportFilters
        period={period}
        from={from}
        to={to}
        scope={scope}
        canAll={canAll}
        onPeriodChange={setPeriod}
        onFromChange={(next) => setParams({ period, from: next, to, scope })}
        onToChange={(next) => setParams({ period, from, to: next, scope })}
        onScopeChange={(next) => setParams({ period, from, to, scope: next })}
      />
      {!online ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Bạn đang ngoại tuyến. Báo cáo sẽ được làm mới khi có kết nối.
        </p>
      ) : null}
      {report.error ? <ReportErrorBox error={report.error} /> : null}
      {exportError ? <ReportErrorBox error={new Error(exportError)} /> : null}
      {owner.error ? <ReportErrorBox error={owner.error} /> : null}
      {profit.error ? <ReportErrorBox error={profit.error} /> : null}
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
            <ReportMetric
              label="Đơn hoàn tất"
              value={formatReportNumber(
                String(report.data.summary.completedOrderCount),
                0,
              )}
            />
            <ReportMetric
              label="Doanh thu gộp"
              value={formatReportMoney(report.data.summary.grossSales)}
            />
            <ReportMetric
              label="Doanh thu thuần"
              value={formatReportMoney(report.data.summary.netRevenue)}
            />
            <ReportMetric
              label="Giá trị đơn TB"
              value={
                report.data.summary.averageOrderValue
                  ? formatReportMoney(report.data.summary.averageOrderValue)
                  : '—'
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <ReportMetric
              label="Giảm dòng"
              value={formatReportMoney(report.data.summary.lineDiscounts)}
            />
            <ReportMetric
              label="Trả hàng"
              value={formatReportMoney(report.data.summary.salesReturns)}
            />
            <ReportMetric
              label="Hủy hóa đơn"
              value={formatReportMoney(report.data.summary.cancellations)}
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <ReportBreakdown
              title="Theo kênh bán"
              rows={report.data.channels.map((item) => [
                item.name,
                formatReportMoney(item.netRevenue),
              ])}
            />
            <ReportBreakdown
              title="Theo phương thức thanh toán"
              rows={report.data.paymentMethods.map((item) => [
                paymentLabel(item.method),
                formatReportMoney(item.netRevenue),
              ])}
            />
          </div>
          <ReportBreakdown
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
            <ReportMetric
              label="Giá vốn thuần"
              value={formatReportMoney(owner.data.netCogs)}
            />
            <ReportMetric
              label="Lợi nhuận gộp"
              value={formatReportMoney(owner.data.grossProfit)}
            />
            <ReportMetric
              label="Tỷ suất lợi nhuận"
              value={
                owner.data.grossMarginPct
                  ? `${formatReportNumber(owner.data.grossMarginPct, 2)}%`
                  : '—'
              }
            />
            <ReportMetric
              label="Giá trị tồn hiện tại"
              value={formatReportMoney(owner.data.inventoryValue)}
            />
          </div>
          {profit.data ? (
            <>
              <ProfitEventTable items={profit.items} />
              {profit.hasNextPage ? (
                <button
                  type="button"
                  onClick={() => void profit.fetchNextPage()}
                  disabled={profit.isFetching}
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  {profit.isFetching ? 'Đang tải…' : 'Tải thêm sự kiện'}
                </button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
