import type { PosPaymentMethod } from '../model/pos-types';
import { formatPosMoney } from '../model/format-money';

export function CheckoutDialog({
  payment,
  total,
  saving,
  onPaymentChange,
  onCancel,
  onConfirm,
}: {
  payment: PosPaymentMethod;
  total: number;
  saving: boolean;
  onPaymentChange: (method: PosPaymentMethod) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 grid place-items-center bg-slate-950/40 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Xác nhận thanh toán</h2>
        <p className="mt-2 text-sm">
          Tổng tiền: <strong>{formatPosMoney(total)}</strong>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(['CASH', 'BANK_TRANSFER'] as const).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => onPaymentChange(method)}
              className={`min-h-11 rounded-lg border ${payment === method ? 'border-teal-700 bg-teal-50' : 'border-slate-300'}`}
            >
              {method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-lg border border-slate-300"
          >
            Quay lại
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="min-h-11 flex-1 rounded-lg bg-teal-700 font-semibold text-white"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}
