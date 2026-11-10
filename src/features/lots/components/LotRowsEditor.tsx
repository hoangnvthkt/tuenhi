import { ViNumberInput } from '@/shared/ui/forms/ViNumberInput';
import type { TrackingMode } from '../api/lots-api';
import { emptyLot, type EditableLot } from '../model/lot-ui';

/** Lot number / expiry / quantity rows; lot number only required in LOT mode. */
export function LotRowsEditor({
  rows,
  mode,
  disabled,
  label,
  onChange,
}: {
  rows: EditableLot[];
  mode: TrackingMode;
  disabled?: boolean;
  label: string;
  onChange: (rows: EditableLot[]) => void;
}) {
  const set = (index: number, patch: Partial<EditableLot>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <fieldset
          key={index}
          aria-label={`${label} lô ${index + 1}`}
          className="grid grid-cols-2 gap-2 lg:grid-cols-4"
        >
          <label className="text-xs font-semibold text-slate-700">
            Số lô{mode === 'LOT' ? '' : ' (không bắt buộc)'}
            <input
              value={row.lotNumber}
              onChange={(event) =>
                set(index, { lotNumber: event.target.value })
              }
              maxLength={60}
              disabled={disabled}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Hạn dùng
            <input
              type="date"
              value={row.expiryDate}
              onChange={(event) =>
                set(index, { expiryDate: event.target.value })
              }
              disabled={disabled}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Số lượng
            <ViNumberInput
              maxFractionDigits={0}
              value={row.quantity}
              onChange={(quantity) => set(index, { quantity })}
              disabled={disabled}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-right text-base font-normal tabular-nums"
            />
          </label>
          <button
            type="button"
            disabled={disabled || rows.length === 1}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            className="min-h-11 self-end px-2 text-sm font-semibold text-slate-600 disabled:opacity-40"
          >
            Bỏ
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...rows, emptyLot()])}
        className="min-h-11 rounded-lg border border-dashed border-slate-300 px-3 text-sm text-slate-700 disabled:opacity-50"
      >
        Thêm lô
      </button>
    </div>
  );
}
