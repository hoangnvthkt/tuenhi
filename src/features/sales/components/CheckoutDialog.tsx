import type { PosPaymentMethod } from '../model/pos-types';
import { formatPosMoney } from '../model/format-money';
import { useState } from 'react';

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
  onConfirm: (proofFile?: File) => void;
}) {
  const [proofFile, setProofFile] = useState<File | null>(null);
  const requiresProof = payment === 'BANK_TRANSFER';

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
              onClick={() => {
                setProofFile(null);
                onPaymentChange(method);
              }}
              className={`min-h-11 rounded-lg border ${payment === method ? 'border-teal-700 bg-teal-50' : 'border-slate-300'}`}
            >
              {method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}
            </button>
          ))}
        </div>
        {requiresProof ? (
          <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50 p-3">
            <p className="text-sm font-semibold text-teal-950">
              Ảnh chứng từ chuyển khoản
            </p>
            <p className="mt-1 text-sm text-teal-900">
              Bắt buộc cho mọi giao dịch chuyển khoản mới.
            </p>
            <label className="mt-3 block text-sm font-medium text-slate-900">
              Tải ảnh chứng từ chuyển khoản
              <input
                aria-label="Tải ảnh chứng từ chuyển khoản"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  setProofFile(event.target.files?.[0] ?? null)
                }
                disabled={saving}
                className="mt-2 block w-full text-sm"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-900">
              Chụp ảnh chứng từ chuyển khoản
              <input
                aria-label="Chụp ảnh chứng từ chuyển khoản"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(event) =>
                  setProofFile(event.target.files?.[0] ?? null)
                }
                disabled={saving}
                className="mt-2 block w-full text-sm"
              />
            </label>
            {proofFile ? (
              <p className="mt-2 text-sm text-teal-950">
                Đã chọn: {proofFile.name}
              </p>
            ) : (
              <p className="mt-2 text-sm font-medium text-red-800">
                Cần ảnh chứng từ chuyển khoản để xác nhận.
              </p>
            )}
          </div>
        ) : null}
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
            onClick={() => onConfirm(proofFile ?? undefined)}
            disabled={saving || (requiresProof && !proofFile)}
            className="min-h-11 flex-1 rounded-lg bg-teal-700 font-semibold text-white"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
}
