import type { ProfitPage } from '../api/reports-api';
import { eventLabel, formatReportMoney } from '../model/report-ui';

export function ReportMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-950">
        {value}
      </p>
    </div>
  );
}

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

export function ReportBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: string[][];
}) {
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

export function ProfitEventTable({ items }: { items: ProfitPage['items'] }) {
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
