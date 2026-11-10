import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useSession } from '@/features/auth';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import {
  buildReportWorkbook,
  downloadReportWorkbook,
} from '../export/report-workbook';
import {
  ProfitEventTable,
  ReportErrorBox,
} from '../components/report-sections';
import {
  ReportKpis,
  RevenueByDayChart,
  RevenueFlowCard,
  TopProductsCard,
} from '../components/report-charts';
import { ReportFilters, ReportHeader } from '../components/report-controls';
import { useReportData } from '../hooks/use-report-data';
import { DonutCard } from '../components/DonutCard';
import { sumDecimals } from '../model/donut';
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

// Validated categorical slots (dataviz palette), same as the dashboard.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#94a3b8'] as const;
const PROFIT = '#12845c';
const COST = '#94a3b8';
const PAYMENT_FILTER: Record<string, string> = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CREDIT: 'DEBT',
};

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
  const { report, topProducts, owner, profit, ownerApi } = useReportData({
    from,
    to,
    scope,
    canProfit,
    online,
  });
  const location = useLocation();
  // Opened by a #profit link; a manual toggle wins until the next navigation.
  const [toggled, setToggled] = useState<{ key: string; open: boolean }>();
  const showDetails =
    toggled?.key === location.key ? toggled.open : location.hash === '#profit';
  const settlementLink = (method: string) =>
    `/reports/settlements?${new URLSearchParams({ period, from, to, scope })}&method=${method}`;
  const scrolledLocation = useRef('');
  useEffect(() => {
    if (!['#returns', '#profit'].includes(location.hash)) return;
    const key = location.key + location.hash;
    if (scrolledLocation.current === key) return;
    const section = document.getElementById(location.hash.slice(1));
    if (section) {
      section.scrollIntoView?.({ block: 'start' });
      scrolledLocation.current = key;
    }
  }, [location.key, location.hash, report.data, owner.data, profit.data]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const setPeriod = (next: ReportPeriod) => {
    const range = presetReportRange(next === 'custom' ? 'month' : next);
    setParams({ period: next, from: range.from, to: range.to, scope });
  };
  const refresh = () => {
    void report.refetch();
    void topProducts.refetch();
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
          <ReportKpis
            items={[
              {
                label: 'Doanh thu',
                value: formatReportMoney(report.data.summary.netRevenue),
                tone: 'revenue',
              },
              {
                label: 'Số đơn',
                value: formatReportNumber(
                  String(report.data.summary.completedOrderCount),
                  0,
                ),
              },
              ...(canProfit && owner.data
                ? [
                    {
                      label: 'Tiền lời',
                      value: formatReportMoney(owner.data.grossProfit),
                      tone: 'profit' as const,
                    },
                  ]
                : []),
            ]}
          />
          <RevenueByDayChart
            daily={report.data.daily}
            from={from}
            to={to}
            linkFor={(dayFrom, dayTo) =>
              `/reports/settlements?${new URLSearchParams({ period: 'custom', from: dayFrom, to: dayTo, scope })}&method=ALL`
            }
          />
          <div className="rpt-grid">
            <RevenueFlowCard
              summary={report.data.summary}
              returnsLink={`/returns?status=COMPLETED&${new URLSearchParams({ period, from, to })}`}
            />
            <TopProductsCard
              status={
                topProducts.isLoading
                  ? 'loading'
                  : topProducts.error
                    ? 'error'
                    : 'ready'
              }
              data={topProducts.data}
              linkFor={(productId) =>
                `${settlementLink('ALL')}&product=${productId}`
              }
            />
          </div>
          <div className="rpt-grid">
            <DonutCard
              title="Khách trả bằng"
              centerLabel="Tổng"
              centerValue={formatReportMoney(
                sumDecimals(
                  report.data.paymentMethods.map((item) => item.netRevenue),
                ),
              )}
              parts={report.data.paymentMethods.map((item, index) => ({
                key: item.method,
                label: paymentLabel(item.method),
                value: item.netRevenue,
                display: formatReportMoney(item.netRevenue),
                color: SERIES[index % SERIES.length]!,
                to: settlementLink(PAYMENT_FILTER[item.method] ?? 'ALL'),
              }))}
              status="ready"
              emptyText="Chưa có doanh thu trong kỳ."
            />
            {canProfit && owner.data ? (
              <DonutCard
                title="Lời lãi"
                centerLabel="Lời"
                centerValue={
                  owner.data.grossMarginPct
                    ? `${formatReportNumber(owner.data.grossMarginPct, 0)}%`
                    : '—'
                }
                parts={[
                  {
                    key: 'profit',
                    label: 'Tiền lời',
                    value: owner.data.grossProfit,
                    display: formatReportMoney(owner.data.grossProfit),
                    color: PROFIT,
                    to: '#profit',
                  },
                  {
                    key: 'cogs',
                    label: 'Tiền vốn',
                    value: owner.data.netCogs,
                    display: formatReportMoney(owner.data.netCogs),
                    color: COST,
                    to: '#profit',
                  },
                ]}
                status="ready"
                emptyText="Chưa có doanh thu trong kỳ."
                footer={
                  <p className="flex justify-between gap-4 p-3 text-sm">
                    <span className="text-slate-700">
                      Hàng trong kho (giá vốn)
                    </span>
                    <strong className="tabular-nums text-slate-950">
                      {formatReportMoney(owner.data.inventoryValue)}
                    </strong>
                  </p>
                }
              />
            ) : null}
            {report.data.channels.length > 1 ? (
              <DonutCard
                title="Kênh bán"
                centerLabel="Tổng"
                centerValue={formatReportMoney(report.data.summary.netRevenue)}
                parts={report.data.channels.map((item, index) => ({
                  key: item.code,
                  label: item.name,
                  value: item.netRevenue,
                  display: formatReportMoney(item.netRevenue),
                  color: SERIES[index % SERIES.length]!,
                  to: settlementLink('ALL'),
                }))}
                status="ready"
                emptyText="Chưa có doanh thu trong kỳ."
              />
            ) : null}
          </div>
        </>
      ) : null}
      {canProfit && profit.data ? (
        <div id="profit" className="rpt-card">
          <button
            type="button"
            className="rpt-details-toggle"
            aria-expanded={showDetails}
            onClick={() =>
              setToggled({ key: location.key, open: !showDetails })
            }
          >
            Chi tiết từng đơn (
            {formatReportNumber(String(profit.items.length), 0)}
            {profit.hasNextPage ? '+' : ''})
            <span>{showDetails ? 'Thu gọn' : 'Xem'}</span>
          </button>
          {showDetails ? (
            <div className="mt-3 space-y-3">
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
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
