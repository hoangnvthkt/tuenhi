import {
  calculatePaymentAllocation,
  type PaymentAllocation,
} from '@/shared/lib/numeric/payment-allocation';
import type { PosPaymentMethod } from '../model/pos-types';
import { useEffect, useRef, useState } from 'react';
import { calculateCashChange, formatCashAmount } from '../model/cash-change';

export function CheckoutDialog({
  payment,
  total,
  customerId,
  saving,
  onPaymentChange,
  onCancel,
  onConfirm,
}: {
  payment: PosPaymentMethod;
  total: string;
  customerId?: string;
  saving: boolean;
  onPaymentChange: (method: PosPaymentMethod) => void;
  onCancel: () => void;
  onConfirm: (proofFile?: File, allocation?: PaymentAllocation) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal?.();
    return () => {
      element?.close?.();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const isSplit = payment === 'SPLIT';
  const [cashAmount, setCashAmount] = useState('');
  const [bankAmount, setBankAmount] = useState('');
  const allocation = calculatePaymentAllocation(total, cashAmount, bankAmount);
  const isBankTransfer =
    payment === 'BANK_TRANSFER' ||
    (isSplit &&
      allocation.ok &&
      allocation.allocation.bankTransferAmount !== '0');
  const splitBlocked =
    isSplit && (!allocation.ok || (!customerId && allocation.debt !== '0'));

  const [tendered, setTendered] = useState('');
  const cash = calculateCashChange(total, tendered);
  const cashBlocked =
    payment === 'CASH' &&
    (cash.status === 'INVALID' || cash.status === 'INSUFFICIENT');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        onCancel();
      } else if (
        event.key === 'Enter' &&
        (event.ctrlKey || event.metaKey) &&
        !saving &&
        !cashBlocked &&
        !splitBlocked
      ) {
        event.preventDefault();
        if (isSplit && allocation.ok)
          onConfirm(
            isBankTransfer ? (proofFile ?? undefined) : undefined,
            allocation.allocation,
          );
        else onConfirm(proofFile ?? undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    onCancel,
    onConfirm,
    proofFile,
    saving,
    cashBlocked,
    splitBlocked,
    isSplit,
    isBankTransfer,
    allocation,
  ]);

  return (
    <dialog
      ref={dialog}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
          ),
        ).filter((el) => el.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-dialog-title"
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl bg-white p-0 shadow-xl backdrop:bg-slate-950/40"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 id="checkout-dialog-title" className="text-lg font-semibold">
          Xác nhận thanh toán
        </h2>
        <p className="mt-2 text-sm">
          Tổng tiền: <strong>{formatCashAmount(total)}</strong>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(['CASH', 'BANK_TRANSFER', 'SPLIT'] as const).map((method) => (
            <button
              key={method}
              disabled={saving}
              type="button"
              onClick={() => {
                setProofFile(null);
                setTendered('');
                setCashAmount('');
                setBankAmount('');
                onPaymentChange(method);
              }}
              className={`min-h-11 rounded-lg border ${payment === method ? 'border-teal-700 bg-teal-50' : 'border-slate-300'}`}
            >
              {method === 'CASH'
                ? 'Tiền mặt'
                : method === 'BANK_TRANSFER'
                  ? 'Chuyển khoản'
                  : 'Kết hợp / Ghi nợ'}
            </button>
          ))}
        </div>
        {payment === 'CASH' ? (
          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium">
              Khách đưa (tùy chọn)
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={tendered}
                onChange={(event) => setTendered(event.target.value)}
                disabled={saving}
                aria-invalid={cashBlocked}
                aria-describedby="cash-change-result"
                maxLength={40}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
              />
            </label>
            <div id="cash-change-result" aria-live="polite">
              {cash.change !== null ? (
                <p className="font-semibold text-teal-800">
                  Tiền thừa: {formatCashAmount(cash.change)}
                </p>
              ) : null}
              {cash.shortfall !== null ? (
                <p className="text-red-800">
                  Còn thiếu: {formatCashAmount(cash.shortfall)}
                </p>
              ) : null}
              {cash.status === 'INVALID' ? (
                <p className="text-red-800">
                  Nhập số tiền hợp lệ, dùng dấu chấm cho phần thập phân.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
        {isSplit ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium">
              Tiền mặt thanh toán
              <input
                type="text"
                inputMode="decimal"
                value={cashAmount}
                onChange={(event) => setCashAmount(event.target.value)}
                disabled={saving}
                maxLength={21}
                placeholder="0"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
              />
            </label>
            <label className="block text-sm font-medium">
              Chuyển khoản thanh toán
              <input
                type="text"
                inputMode="decimal"
                value={bankAmount}
                onChange={(event) => setBankAmount(event.target.value)}
                disabled={saving}
                maxLength={21}
                placeholder="0"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
              />
            </label>
            <div
              aria-live="polite"
              className="rounded-lg bg-slate-50 p-3 text-sm"
            >
              {allocation.ok ? (
                <>
                  <p>Đã trả: {formatCashAmount(allocation.paid)}</p>
                  <p className="mt-1 font-semibold">
                    Còn nợ: {formatCashAmount(allocation.debt)}
                  </p>
                  {!customerId && allocation.debt !== '0' ? (
                    <p className="mt-2 text-red-800">
                      Chọn khách hàng có mã để ghi nợ.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-red-800">{allocation.message}</p>
              )}
            </div>
          </div>
        ) : null}
        {isBankTransfer ? (
          <div
            key={payment}
            className="mt-4 rounded-lg border border-teal-100 bg-teal-50 p-3"
          >
            <p className="text-sm font-semibold text-teal-950">
              Ảnh chứng từ chuyển khoản
            </p>
            <p className="mt-1 text-sm text-teal-900">
              Tùy chọn. Có thể xác nhận chuyển khoản khi chưa có ảnh.
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
            ) : null}
          </div>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-11 flex-1 rounded-lg border border-slate-300"
          >
            Quay lại
          </button>
          <button
            type="button"
            onClick={() => {
              if (saving || cashBlocked || splitBlocked) return;
              if (isSplit && allocation.ok)
                onConfirm(
                  isBankTransfer ? (proofFile ?? undefined) : undefined,
                  allocation.allocation,
                );
              else onConfirm(proofFile ?? undefined);
            }}
            disabled={saving || cashBlocked || splitBlocked}
            className="min-h-11 flex-1 rounded-lg bg-teal-700 font-semibold text-white"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </dialog>
  );
}
