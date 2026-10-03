import type { Dispatch, SetStateAction } from 'react';
import type { ProductCatalogItem } from '@/features/catalog';
import { NumericField } from '@/shared/ui/forms/NumericField';
import { formatNumber } from '../../model/inventory-ui';
import type { PeriodicStockCount } from '../api/stock-count-schemas';
import type { StockCountDraftLine } from '../model/stock-count-draft';

export function StockCountEditor({
  document,
  editable,
  lines,
  products,
  selectedIds,
  note,
  online,
  busy,
  setNote,
  setLines,
  onSave,
}: {
  document: PeriodicStockCount | null;
  editable: boolean;
  lines: StockCountDraftLine[];
  products: ProductCatalogItem[];
  selectedIds: Set<string>;
  note: string;
  online: boolean;
  busy: boolean;
  setNote: (value: string) => void;
  setLines: Dispatch<SetStateAction<StockCountDraftLine[]>>;
  onSave: () => Promise<void>;
}) {
  const productFor = (id: string) =>
    products.find((product) => product.id === id);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      {editable ? (
        <label className="block text-sm font-medium">
          Ghi chú
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 p-3"
          />
        </label>
      ) : null}
      {lines.map((line, index) => {
        const selected = productFor(line.productId);
        const detail = document?.lines.find(
          (item) => item.productId === line.productId,
        );
        return (
          <div
            key={`${line.productId}-${index}`}
            className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_190px_auto]"
          >
            {editable ? (
              <select
                value={line.productId}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, productId: event.target.value }
                        : item,
                    ),
                  )
                }
                className="min-h-11 rounded-lg border border-slate-300 px-3"
              >
                <option value="">Chọn sản phẩm</option>
                {products.map((product) => (
                  <option
                    key={product.id}
                    value={product.id}
                    disabled={
                      selectedIds.has(product.id) &&
                      product.id !== line.productId
                    }
                  >
                    {product.sku} — {product.name}
                    {product.isActive ? '' : ' (ngừng kinh doanh)'}
                  </option>
                ))}
              </select>
            ) : (
              <p>
                <strong>{detail?.productName ?? selected?.name}</strong>
                <span className="mt-1 block text-sm text-slate-600">
                  Tồn chụp:{' '}
                  {detail ? formatNumber(detail.systemQtySnapshot) : '—'} ·
                  Chênh lệch:{' '}
                  {detail?.differenceQty === null
                    ? '—'
                    : formatNumber(detail?.differenceQty ?? '0')}
                </span>
              </p>
            )}
            {editable ? (
              <NumericField
                label="Số đếm thực tế"
                kind="quantity"
                precision={18}
                value={line.countedQty ?? ''}
                onChange={(value) =>
                  setLines((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, countedQty: value === '' ? null : value }
                        : item,
                    ),
                  )
                }
                disabled={!online || busy}
                helperText="Có thể để trống khi chưa đếm"
              />
            ) : (
              <p className="text-sm">
                Đếm:{' '}
                {detail?.countedQty === null
                  ? 'Chưa nhập'
                  : formatNumber(detail?.countedQty ?? '0')}
              </p>
            )}
            {editable ? (
              <button
                type="button"
                onClick={() =>
                  setLines((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                disabled={lines.length === 1}
              >
                Bỏ
              </button>
            ) : null}
          </div>
        );
      })}
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setLines((current) => [
                ...current,
                { productId: '', countedQty: null },
              ])
            }
            className="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold"
          >
            Thêm sản phẩm
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={!online || busy}
            className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
          >
            Lưu phiếu
          </button>
        </div>
      ) : null}
    </section>
  );
}
