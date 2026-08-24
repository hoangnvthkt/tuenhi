import type { ReportPeriod } from '../model/report-period';

type ReportScope = 'OWN' | 'ALL';

export function ReportHeader({
  online,
  loading,
  exporting,
  canExport,
  onRefresh,
  onExport,
}: {
  online: boolean;
  loading: boolean;
  exporting: boolean;
  canExport: boolean;
  onRefresh: () => void;
  onExport: () => void;
}) {
  return (
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
          onClick={onRefresh}
          disabled={!online || loading}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Làm mới
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={!canExport || exporting}
          className="min-h-11 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {exporting ? 'Đang tạo XLSX…' : 'Xuất XLSX'}
        </button>
      </div>
    </div>
  );
}

export function ReportFilters({
  period,
  from,
  to,
  scope,
  canAll,
  onPeriodChange,
  onFromChange,
  onToChange,
  onScopeChange,
}: {
  period: ReportPeriod;
  from: string;
  to: string;
  scope: ReportScope;
  canAll: boolean;
  onPeriodChange: (period: ReportPeriod) => void;
  onFromChange: (from: string) => void;
  onToChange: (to: string) => void;
  onScopeChange: (scope: ReportScope) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2" aria-label="Khoảng thời gian">
        {(['today', 'week', 'month', 'custom'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPeriodChange(item)}
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
              onChange={(event) => onFromChange(event.target.value)}
              className="ml-2 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="text-sm font-medium">
            Đến ngày
            <input
              type="date"
              value={to}
              onChange={(event) => onToChange(event.target.value)}
              className="ml-2 rounded border border-slate-300 p-2"
            />
          </label>
        </div>
      ) : null}
      {canAll ? (
        <div className="flex gap-2">
          {(['ALL', 'OWN'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onScopeChange(item)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${scope === item ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white'}`}
            >
              {item === 'ALL' ? 'Toàn cửa hàng' : 'Của tôi'}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
