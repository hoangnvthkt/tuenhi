import { Link, useSearchParams } from 'react-router';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useSession } from '@/features/auth';
import {
  isIsoDate,
  presetReportRange,
  type ReportPeriod,
} from '@/features/reports';
import { useDashboardData } from '../hooks/use-dashboard-data';
import {
  DonutCard,
  formatReportMoney,
  formatReportNumber,
  sumDecimals,
  type DonutPart,
} from '@/features/reports';
import { ChartBar } from '@phosphor-icons/react';

// Validated categorical slots (dataviz palette) and reserved status colours.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'] as const;
const OTHER = '#94a3b8';
const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;
// Tiny status glyphs (filled circle + mark) so state is never colour-only.
const STATUS_MARKS = {
  good: 'M5 8.2 7 10.2 11 6',
  warning: 'M8 4.5v4.2M8 11.2v.3',
  serious: 'M5 8h6',
  critical: 'M5.5 5.5l5 5M10.5 5.5l-5 5',
} as const;
function StatusIcon({ tone }: { tone: keyof typeof STATUS }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-[18px] shrink-0"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="8" fill={STATUS[tone]} />
      <path
        d={STATUS_MARKS[tone]}
        fill="none"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
const count = (value: number) => formatReportNumber(String(value), 0);
const chartStatus = (query: { data?: unknown; error: unknown }) =>
  query.data ? 'ready' : query.error ? 'error' : 'loading';

function Card({
  label,
  value,
  sub,
  to,
}: {
  label: string;
  /** null while loading: never show a placeholder 0. */
  value: string | null;
  sub?: string | null;
  to: string;
}) {
  return (
    <article
      aria-label={label}
      className="metric-card min-w-0 rounded-2xl border bg-white shadow-sm"
    >
      <Link
        to={to}
        aria-label={label}
        className="block h-full rounded-2xl p-4 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-6 text-slate-600">
            {label}
          </p>
          <span className="metric-icon">
            <ChartBar size={20} aria-hidden="true" />
          </span>
        </div>
        {value === null ? (
          <p
            role="status"
            aria-label={`Đang tải ${label.toLowerCase()}`}
            className="h-7 w-28 animate-pulse rounded bg-slate-200"
          />
        ) : (
          <p className="metric-value text-xl font-bold tabular-nums text-slate-950">
            {value}
          </p>
        )}
        {sub ? (
          <p className="mt-1 text-sm tabular-nums text-slate-600">{sub}</p>
        ) : null}
      </Link>
    </article>
  );
}
export function DashboardPage() {
  const { session } = useSession();
  const online = useOnlineStatus();
  const [params, setParams] = useSearchParams();
  const requestedPeriod = params.get('period');
  const period: ReportPeriod =
    requestedPeriod === 'week' ||
    requestedPeriod === 'month' ||
    requestedPeriod === 'custom'
      ? requestedPeriod
      : 'today';
  const fallback = presetReportRange(period === 'custom' ? 'month' : period);
  const requestedFrom = params.get('from');
  const requestedTo = params.get('to');
  const from = isIsoDate(requestedFrom) ? requestedFrom : fallback.from;
  const to = isIsoDate(requestedTo) ? requestedTo : fallback.to;
  const canAll =
    session?.permissions.includes('report.all_revenue.read') ?? false;
  const canOwn =
    session?.permissions.includes('report.own_revenue.read') ?? false;
  const canRevenue = canAll || canOwn;
  const canProfit =
    session?.permissions.includes('report.cost_profit.read') ?? false;
  const { operational, revenue, owner, settlements, productRevenue, refresh } =
    useDashboardData({
      period,
      from,
      to,
      canAll,
      canOwn,
      canProfit,
      online,
    });
  const reportParams = new URLSearchParams({
    period,
    from,
    to,
    scope: canAll ? 'ALL' : 'OWN',
  });
  const reportLink = `/reports?${reportParams}`;
  const settlementLink = (method: string) =>
    `/reports/settlements?${reportParams}&method=${method}`;
  const setPeriod = (next: ReportPeriod) => {
    const range = presetReportRange(next === 'custom' ? 'month' : next);
    setParams({ period: next, from: range.from, to: range.to });
  };
  const lastUpdatedAt = Math.max(
    operational.dataUpdatedAt,
    revenue.dataUpdatedAt,
    settlements.dataUpdatedAt,
    canProfit ? owner.dataUpdatedAt : 0,
  );
  const isLoading =
    operational.isLoading ||
    revenue.isLoading ||
    settlements.isLoading ||
    (canProfit && owner.isLoading);
  const error =
    operational.error ??
    revenue.error ??
    settlements.error ??
    productRevenue.error ??
    owner.error;
  const rangeParams = new URLSearchParams({ period, from, to });
  const productLink = (productId: string) =>
    `${settlementLink('ALL')}&product=${productId}`;
  const stock = operational.data?.catalog.stockStates;
  const stockParts: DonutPart[] = stock
    ? [
        {
          key: 'in',
          label: 'Đủ hàng',
          value: String(stock.inStock),
          display: count(stock.inStock),
          color: STATUS.good,
          to: '/products?stock=IN_STOCK',
          icon: <StatusIcon tone="good" />,
        },
        {
          key: 'low',
          label: 'Sắp hết',
          value: String(stock.runningLow),
          display: count(stock.runningLow),
          color: STATUS.warning,
          to: '/products?stock=RUNNING_LOW',
          icon: <StatusIcon tone="warning" />,
        },
        {
          key: 'negative',
          label: 'Âm kho',
          value: String(stock.negativeStock),
          display: count(stock.negativeStock),
          color: STATUS.critical,
          to: '/products?stock=NEGATIVE_STOCK',
          icon: <StatusIcon tone="critical" />,
        },
        {
          key: 'zero',
          label: 'Hết hàng',
          value: String(stock.zeroStock),
          display: count(stock.zeroStock),
          color: STATUS.serious,
          to: '/products?stock=ZERO_STOCK',
          icon: <StatusIcon tone="serious" />,
        },
      ]
    : [];
  const pay = settlements.data?.summary;
  const payParts: DonutPart[] = pay
    ? [
        ['CASH', 'Tiền mặt', pay.cashAmount],
        ['BANK_TRANSFER', 'Chuyển khoản', pay.bankTransferAmount],
        ['DEBT', 'Còn nợ', pay.outstandingAmount],
      ].map(([method, label, value], index) => ({
        key: method!,
        label: label!,
        value: value!,
        display: formatReportMoney(value!),
        color: SERIES[index]!,
        to: settlementLink(method!),
      }))
    : [];
  const products = productRevenue.data;
  const productParts: DonutPart[] = products
    ? [
        ...products.items.map((item, index) => ({
          key: item.productId,
          label: item.productName,
          value: item.netRevenue,
          display: formatReportMoney(item.netRevenue),
          color: SERIES[index]!,
          to: productLink(item.productId),
        })),
        ...(products.otherProductCount
          ? [
              {
                key: 'other',
                label: `Khác (${count(products.otherProductCount)} sản phẩm)`,
                value: products.otherNetRevenue,
                display: formatReportMoney(products.otherNetRevenue),
                color: OTHER,
                to: settlementLink('ALL'),
              },
            ]
          : []),
      ]
    : [];
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Tổng quan
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastUpdatedAt ? (
            <p className="text-xs text-slate-500">
              Cập nhật lúc{' '}
              {new Intl.DateTimeFormat('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
              }).format(lastUpdatedAt)}
            </p>
          ) : null}
          <button
            type="button"
            onClick={refresh}
            disabled={!online || isLoading}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Làm mới
          </button>
          {canRevenue ? (
            <Link
              to={reportLink}
              className="min-h-11 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white"
            >
              Xem báo cáo
            </Link>
          ) : null}
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
                setParams({ period, from: event.target.value, to })
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
                setParams({ period, from, to: event.target.value })
              }
              className="ml-2 rounded border border-slate-300 p-2"
            />
          </label>
        </div>
      ) : null}
      {!online ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Bạn đang ngoại tuyến. Dữ liệu có thể chưa được cập nhật.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error instanceof Error ? error.message : 'Không thể tải tổng quan.'}
        </p>
      ) : null}
      {canRevenue || canProfit ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {canRevenue ? (
            <Card
              to={settlementLink('ALL')}
              label="Doanh thu thuần"
              value={
                revenue.data
                  ? formatReportMoney(revenue.data.summary.netRevenue)
                  : null
              }
              sub={
                revenue.data
                  ? `${count(revenue.data.summary.completedOrderCount)} đơn`
                  : null
              }
            />
          ) : null}
          {canProfit ? (
            <Card
              to={`${reportLink}#profit`}
              label="Lợi nhuận gộp"
              value={
                owner.data ? formatReportMoney(owner.data.grossProfit) : null
              }
              sub={
                owner.data
                  ? `Giá vốn ${formatReportMoney(owner.data.netCogs)}`
                  : null
              }
            />
          ) : null}
          {canRevenue ? (
            <Card
              to={`/returns?status=COMPLETED&${rangeParams}`}
              label="Trả hàng"
              value={
                revenue.data
                  ? formatReportMoney(revenue.data.summary.salesReturns)
                  : null
              }
            />
          ) : null}
          {canProfit ? (
            <Card
              to="/more/inventory/valuation"
              label="Giá trị tồn"
              value={
                owner.data ? formatReportMoney(owner.data.inventoryValue) : null
              }
              sub={
                operational.data
                  ? `${formatReportNumber(operational.data.catalog.totalOnHandQty)} đơn vị`
                  : null
              }
            />
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {canRevenue ? (
          <DonutCard
            title="Thu tiền các đơn"
            centerLabel="Tổng"
            centerValue={
              pay
                ? formatReportMoney(
                    sumDecimals([
                      pay.cashAmount,
                      pay.bankTransferAmount,
                      pay.outstandingAmount,
                    ]),
                  )
                : ''
            }
            parts={payParts}
            status={chartStatus(settlements)}
            emptyText="Chưa có đơn trong kỳ."
          />
        ) : null}
        <DonutCard
          title="Tình trạng hàng"
          centerLabel="Sản phẩm"
          centerValue={
            operational.data
              ? count(operational.data.catalog.activeProductCount)
              : ''
          }
          parts={stockParts}
          status={chartStatus(operational)}
          emptyText="Chưa có sản phẩm."
        />
        {canRevenue ? (
          <DonutCard
            title="Doanh thu theo sản phẩm"
            centerLabel="Tổng"
            centerValue={
              products ? formatReportMoney(products.totalNetRevenue) : ''
            }
            parts={productParts}
            status={chartStatus(productRevenue)}
            emptyText="Chưa có doanh thu trong kỳ."
          />
        ) : null}
      </div>
      <section aria-label="Chờ xử lý" className="space-y-3">
        <h2 className="text-base font-semibold text-slate-950">Chờ xử lý</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card
            to="/more/purchases?status=AWAITING_COST"
            label="Phiếu nhập chờ xử lý"
            value={
              operational.data
                ? count(operational.data.pending.purchaseReceipts)
                : null
            }
          />
          <Card
            to="/stock-counts?status=COUNTED"
            label="Kiểm kho chờ xử lý"
            value={
              operational.data
                ? count(operational.data.pending.stockCounts)
                : null
            }
          />
          <Card
            to="/returns?status=REQUESTED"
            label="Trả hàng chờ xử lý"
            value={
              operational.data
                ? count(operational.data.pending.saleReturns)
                : null
            }
          />
        </div>
      </section>
    </section>
  );
}
