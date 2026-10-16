import { Link, useSearchParams } from 'react-router';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useSession } from '@/features/auth';
import {
  isIsoDate,
  presetReportRange,
  type ReportPeriod,
} from '@/features/reports';
import { useDashboardData } from '../hooks/use-dashboard-data';
import { formatReportMoney, formatReportNumber } from '@/features/reports';
import { ChartBar } from '@phosphor-icons/react';

function Card({
  label,
  value,
  to,
}: {
  label: string;
  value: string;
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
        <p className="metric-value text-xl font-bold tabular-nums text-slate-950">
          {value}
        </p>
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
  const { operational, revenue, owner, settlements, refresh } =
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
    operational.error ?? revenue.error ?? settlements.error ?? owner.error;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Tổng quan
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Số liệu theo khoảng ngày tại Việt Nam.
          </p>
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
      {operational.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card
              to="/products"
              label="Sản phẩm hoạt động"
              value={formatReportNumber(
                String(operational.data.catalog.activeProductCount),
                0,
              )}
            />
            <Card
              to="/products?stock=LOW_STOCK"
              label="Sắp hết hàng"
              value={formatReportNumber(
                String(operational.data.catalog.lowStockCount),
                0,
              )}
            />
            <Card
              to="/products?stock=OUT_OF_STOCK"
              label="Hết hàng"
              value={formatReportNumber(
                String(operational.data.catalog.outOfStockCount),
                0,
              )}
            />
            <Card
              to="/products"
              label="Tổng tồn tham khảo"
              value={formatReportNumber(
                operational.data.catalog.totalOnHandQty,
              )}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card
              to="/more/purchases?status=AWAITING_COST"
              label="Phiếu nhập chờ xử lý"
              value={formatReportNumber(
                String(operational.data.pending.purchaseReceipts),
                0,
              )}
            />
            <Card
              to="/stock-counts?status=COUNTED"
              label="Kiểm kho chờ xử lý"
              value={formatReportNumber(
                String(operational.data.pending.stockCounts),
                0,
              )}
            />
            <Card
              to="/returns?status=REQUESTED"
              label="Trả hàng chờ xử lý"
              value={formatReportNumber(
                String(operational.data.pending.saleReturns),
                0,
              )}
            />
          </div>
        </>
      ) : (
        <div className="h-28 animate-pulse rounded-xl bg-slate-200" />
      )}
      {canRevenue && revenue.data ? (
        <>
          <h2 className="pt-2 text-xl font-bold text-slate-950">
            {period === 'today' ? 'Doanh thu trong ngày' : 'Doanh thu trong kỳ'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card
              to={settlementLink('ALL')}
              label={canAll ? 'Đơn toàn cửa hàng' : 'Đơn của tôi'}
              value={formatReportNumber(
                String(revenue.data.summary.completedOrderCount),
                0,
              )}
            />
            <Card
              to={reportLink}
              label="Doanh thu gộp"
              value={formatReportMoney(revenue.data.summary.grossSales)}
            />
            <Card
              to={`${reportLink}#returns`}
              label="Trả hàng"
              value={formatReportMoney(revenue.data.summary.salesReturns)}
            />
            <Card
              to={reportLink}
              label="Doanh thu thuần"
              value={formatReportMoney(revenue.data.summary.netRevenue)}
            />
          </div>
        </>
      ) : null}
      {canRevenue && settlements.data ? (
        <section aria-label="Thanh toán các đơn trong kỳ" className="space-y-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card
              label="Tiền mặt"
              value={formatReportMoney(settlements.data.summary.cashAmount)}
              to={settlementLink('CASH')}
            />
            <Card
              label="Chuyển khoản"
              value={formatReportMoney(
                settlements.data.summary.bankTransferAmount,
              )}
              to={settlementLink('BANK_TRANSFER')}
            />
            <Card
              label="Nợ còn lại"
              value={formatReportMoney(
                settlements.data.summary.outstandingAmount,
              )}
              to={settlementLink('DEBT')}
            />
          </div>
          <p className="text-xs text-slate-500">
            Theo các đơn bán trong khoảng ngày đã chọn, cập nhật tiền khách đã
            trả và trừ tiền hoàn. Bấm vào từng ô để xem chi tiết.
          </p>
        </section>
      ) : null}
      {owner.data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card
            to={`${reportLink}#profit`}
            label="Giá vốn thuần"
            value={formatReportMoney(owner.data.netCogs)}
          />
          <Card
            to={`${reportLink}#profit`}
            label="Lợi nhuận gộp"
            value={formatReportMoney(owner.data.grossProfit)}
          />
          <Card
            to="/more/inventory/valuation"
            label="Giá trị tồn hiện tại"
            value={formatReportMoney(owner.data.inventoryValue)}
          />
        </div>
      ) : null}
    </section>
  );
}
