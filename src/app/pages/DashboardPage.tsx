import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useOnlineStatus } from '../use-online-status';
import { useSession } from '../../features/auth/use-session';
import { createReportsApi } from '../../features/reports/reports-api';
import {
  formatReportMoney,
  formatReportNumber,
} from '../../features/reports/report-ui';

function today() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts();
  const get = (name: string) =>
    parts.find((part) => part.type === name)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">
        {value}
      </p>
    </div>
  );
}
export function DashboardPage() {
  const { session } = useSession();
  const online = useOnlineStatus();
  const [api] = useState(createReportsApi);
  const day = today();
  const canAll =
    session?.permissions.includes('report.all_revenue.read') ?? false;
  const canProfit =
    session?.permissions.includes('report.cost_profit.read') ?? false;
  const refresh = {
    refetchInterval: () =>
      online && document.visibilityState === 'visible' ? 60_000 : false,
    refetchOnWindowFocus: true,
  };
  const operational = useQuery({
    queryKey: ['operational-dashboard', day],
    queryFn: () => api.operational(day, day),
    ...refresh,
  });
  const revenue = useQuery({
    queryKey: ['dashboard-revenue', day, canAll],
    queryFn: () =>
      canAll ? api.revenue(day, day, 'ALL') : api.mySummary(day, day),
    ...refresh,
  });
  const owner = useQuery({
    queryKey: ['dashboard-owner', day],
    queryFn: () => api.owner(day, day),
    enabled: canProfit,
    gcTime: 0,
    ...refresh,
  });
  const error = operational.error ?? revenue.error ?? owner.error;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Tổng quan
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Số liệu hôm nay theo múi giờ Việt Nam.
          </p>
        </div>
        <Link
          to="/reports"
          className="min-h-11 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white"
        >
          Xem báo cáo
        </Link>
      </div>
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
              label="Sản phẩm hoạt động"
              value={formatReportNumber(
                String(operational.data.catalog.activeProductCount),
                0,
              )}
            />
            <Card
              label="Sắp hết hàng"
              value={formatReportNumber(
                String(operational.data.catalog.lowStockCount),
                0,
              )}
            />
            <Card
              label="Hết hàng"
              value={formatReportNumber(
                String(operational.data.catalog.outOfStockCount),
                0,
              )}
            />
            <Card
              label="Tổng tồn tham khảo"
              value={formatReportNumber(
                operational.data.catalog.totalOnHandQty,
              )}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card
              label="Phiếu nhập chờ xử lý"
              value={formatReportNumber(
                String(operational.data.pending.purchaseReceipts),
                0,
              )}
            />
            <Card
              label="Kiểm kho chờ xử lý"
              value={formatReportNumber(
                String(operational.data.pending.stockCounts),
                0,
              )}
            />
            <Card
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
      {revenue.data ? (
        <>
          <h2 className="pt-2 text-xl font-bold text-slate-950">
            Doanh thu hôm nay
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card
              label={canAll ? 'Đơn toàn cửa hàng' : 'Đơn của tôi'}
              value={formatReportNumber(
                String(revenue.data.summary.completedOrderCount),
                0,
              )}
            />
            <Card
              label="Doanh thu gộp"
              value={formatReportMoney(revenue.data.summary.grossSales)}
            />
            <Card
              label="Trả hàng"
              value={formatReportMoney(revenue.data.summary.salesReturns)}
            />
            <Card
              label="Doanh thu thuần"
              value={formatReportMoney(revenue.data.summary.netRevenue)}
            />
          </div>
        </>
      ) : null}
      {owner.data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card
            label="Giá vốn thuần"
            value={formatReportMoney(owner.data.netCogs)}
          />
          <Card
            label="Lợi nhuận gộp"
            value={formatReportMoney(owner.data.grossProfit)}
          />
          <Card
            label="Giá trị tồn hiện tại"
            value={formatReportMoney(owner.data.inventoryValue)}
          />
        </div>
      ) : null}
    </section>
  );
}
