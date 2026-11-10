import { Link } from 'react-router';
import type { ProfitPage } from '../api/reports-api';
import { eventLabel, formatReportMoney } from '../model/report-ui';

export function ReportErrorBox({ error }: { error: unknown }) {
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

export function ProfitEventTable({ items }: { items: ProfitPage['items'] }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table aria-label="Chi tiết từng đơn" className="min-w-full text-sm">
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
              <td className="p-3">
                <Link
                  className="font-semibold text-teal-800 underline"
                  to={
                    item.returnId
                      ? `/returns/${item.returnId}`
                      : `/sales/${item.saleId}`
                  }
                >
                  {item.returnNumber ?? item.saleNumber}
                </Link>
              </td>
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
