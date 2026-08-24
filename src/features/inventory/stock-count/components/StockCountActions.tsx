import { NumericField } from '@/shared/ui/forms/NumericField';
import type { PeriodicStockCount } from '../api/stock-count-schemas';

export function StockCountActions({
  document,
  estimates,
  reason,
  online,
  busy,
  setEstimates,
  setReason,
  onAction,
  onPost,
}: {
  document: PeriodicStockCount | null;
  estimates: Record<string, string>;
  reason: string;
  online: boolean;
  busy: boolean;
  setEstimates: (value: Record<string, string>) => void;
  setReason: (value: string) => void;
  onAction: (command: 'submit' | 'refresh' | 'cancel') => Promise<void>;
  onPost: () => Promise<void>;
}) {
  return (
    <>
      {document?.status === 'DRAFT' ? (
        <button
          type="button"
          disabled={!online || busy}
          onClick={() => void onAction('submit')}
          className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
        >
          Gửi phiếu để ghi sổ
        </button>
      ) : null}
      {document?.status === 'COUNTED' ? (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          {document.canPost ? (
            <>
              {document.lines
                .filter((line) => line.requiresEstimatedCost)
                .map((line) => (
                  <NumericField
                    key={line.id}
                    label={`Đơn giá vốn ước tính: ${line.productName}`}
                    kind="money"
                    precision={18}
                    value={estimates[line.id] ?? ''}
                    onChange={(value) =>
                      setEstimates({ ...estimates, [line.id]: value })
                    }
                    disabled={!online || busy}
                  />
                ))}
              <button
                type="button"
                disabled={!online || busy}
                onClick={() => void onPost()}
                className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
              >
                Ghi sổ chênh lệch
              </button>
            </>
          ) : null}
          <button
            type="button"
            disabled={!online || busy}
            onClick={() => void onAction('refresh')}
            className="min-h-11 rounded-lg border border-amber-700 px-4 font-semibold text-amber-900 disabled:opacity-50"
          >
            Cập nhật tồn &amp; đếm lại
          </button>
        </section>
      ) : null}
      {document && ['DRAFT', 'COUNTED'].includes(document.status) ? (
        <section className="space-y-2">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Lý do hủy phiếu"
            maxLength={500}
            className="min-h-20 w-full rounded-lg border border-slate-300 p-3"
          />
          <button
            type="button"
            disabled={!online || busy || reason.trim().length === 0}
            onClick={() => void onAction('cancel')}
            className="min-h-11 rounded-lg border border-red-700 px-4 font-semibold text-red-800 disabled:opacity-50"
          >
            Hủy phiếu kiểm kho
          </button>
        </section>
      ) : null}
    </>
  );
}
