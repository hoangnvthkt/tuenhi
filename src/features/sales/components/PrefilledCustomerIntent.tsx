import type { CustomerItem } from '@/features/directories';

export function PrefilledCustomerIntent({
  customer,
  warning,
  currentCustomerId,
  disabled,
  onReplace,
  onKeep,
  onDismiss,
}: {
  customer: CustomerItem | null;
  warning: string | null;
  currentCustomerId: string;
  disabled: boolean;
  onReplace: () => void;
  onKeep: () => void;
  onDismiss: () => void;
}) {
  if (warning) {
    return (
      <div
        role="alert"
        className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      >
        <p>{warning}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 px-3 font-semibold"
        >
          Bỏ qua
        </button>
      </div>
    );
  }
  if (!customer) return null;
  return (
    <div className="mb-5 rounded-lg border border-teal-200 bg-teal-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
        Khách hàng được mở từ liên kết
      </p>
      <p className="mt-1 font-bold text-slate-950">{customer.name}</p>
      <p className="text-xs text-slate-600">
        {customer.code ?? customer.phone ?? 'Chưa có mã'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onReplace}
          className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {currentCustomerId ? 'Đổi khách hàng' : 'Chọn khách hàng này'}
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="min-h-11 px-3 text-sm font-semibold text-slate-700"
        >
          {currentCustomerId ? 'Giữ khách hiện tại' : 'Bỏ qua'}
        </button>
      </div>
    </div>
  );
}
