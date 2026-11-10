import { useEffect, useId, useRef, useState } from 'react';
import { MONEY_FINAL } from '@/shared/lib/numeric/canonical-number';
import { ViNumberInput } from '@/shared/ui/forms/ViNumberInput';
import { formatPosMoney } from '../model/format-money';
import {
  discountFromPercent,
  exceedsMoney,
  subtractMoney,
} from '../model/pos-totals';
import './discount-dialog.css';

type Mode = 'AMOUNT' | 'PERCENT';

/** Discount in dong or percent of `base`; always applies a dong amount. */
export function DiscountDialog({
  title,
  base,
  value,
  onApply,
  onCancel,
}: {
  title: string;
  base: string;
  value: string;
  onApply: (amount: string) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inputId = useId();
  const [mode, setMode] = useState<Mode>('AMOUNT');
  const [input, setInput] = useState(value === '0' ? '' : value);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal?.();
    return () => {
      element?.close?.();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  const raw = input === '' ? '0' : input;
  const valid = MONEY_FINAL.test(raw);
  const amount = !valid
    ? '0'
    : mode === 'PERCENT'
      ? discountFromPercent(base, raw)
      : raw;
  const error = !valid
    ? 'Số chưa hợp lệ.'
    : mode === 'PERCENT' && exceedsMoney(raw, '100')
      ? 'Tối đa 100%.'
      : mode === 'AMOUNT' && exceedsMoney(raw, base)
        ? 'Không vượt quá tiền hàng.'
        : null;
  const apply = () => {
    if (!error) onApply(amount);
  };

  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      aria-labelledby={`${inputId}-title`}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl bg-white p-0 shadow-xl backdrop:bg-slate-950/40"
    >
      <form
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <h2 id={`${inputId}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="pos-discount-row">
          <span>Tiền hàng</span>
          <span>{formatPosMoney(base)}</span>
        </p>
        <div className="pos-discount-input">
          <label htmlFor={inputId}>Giảm giá</label>
          <ViNumberInput
            id={inputId}
            autoFocus
            maxFractionDigits={2}
            value={input}
            onChange={setInput}
            aria-invalid={Boolean(error)}
            placeholder="0"
          />
          <div
            className="pos-discount-mode"
            role="group"
            aria-label="Kiểu giảm giá"
          >
            {(
              [
                ['AMOUNT', 'VND'],
                ['PERCENT', '%'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => {
                  if (mode === key) return;
                  setMode(key);
                  setInput('');
                  document.getElementById(inputId)?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {mode === 'PERCENT' && !error ? (
          <p className="pos-discount-row">
            <span>Số tiền giảm</span>
            <span>-{formatPosMoney(amount)}</span>
          </p>
        ) : null}
        <p className="pos-discount-row pos-discount-total">
          <span>Còn lại</span>
          <span>
            {formatPosMoney(error ? base : subtractMoney(base, amount))}
          </span>
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-lg border border-slate-300"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={Boolean(error)}
            className="min-h-11 flex-1 rounded-lg bg-teal-700 font-semibold text-white"
          >
            Áp dụng
          </button>
        </div>
      </form>
    </dialog>
  );
}
