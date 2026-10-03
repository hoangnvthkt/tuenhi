import type { OpeningDocument } from '../api/opening-schemas';
import type { Dispatch, SetStateAction } from 'react';
import { ProductSelect, type ProductCatalogItem } from '@/features/catalog';
import { NumericField } from '@/shared/ui/forms/NumericField';
import type { OpeningSuggestion } from '../api/opening-schemas';
import type { OpeningDraftLine } from '../model/opening-draft';

export function OpeningEditor({
  document,
  editable,
  groupedSuggestions,
  note,
  lines,
  products,
  selectedIds,
  onApplySuggestion,
  setNote,
  setLines,
}: {
  document: OpeningDocument | null;
  editable: boolean;
  groupedSuggestions: OpeningSuggestion[][];
  note: string;
  lines: OpeningDraftLine[];
  products: ProductCatalogItem[];
  selectedIds: Set<string>;
  onApplySuggestion: (suggestion: OpeningSuggestion) => void;
  setNote: (value: string) => void;
  setLines: Dispatch<SetStateAction<OpeningDraftLine[]>>;
}) {
  return (
    <>
      {editable && groupedSuggestions.length > 0 ? (
        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-bold text-amber-950">Gợi ý từ workbook cũ</h2>
          <p className="mt-1 text-sm text-amber-900">
            Các dòng trùng được nhóm theo sản phẩm, không tự cộng. Owner phải
            chọn rồi xác nhận số cuối cùng.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {groupedSuggestions.map((group) =>
              group[0] ? (
                <button
                  key={group[0].productId}
                  type="button"
                  onClick={() => onApplySuggestion(group[0]!)}
                  className="rounded-lg border border-amber-300 bg-white p-3 text-left text-sm"
                >
                  <strong>
                    {group[0].sku} — {group[0].productName}
                  </strong>
                  <span className="mt-1 block text-amber-900">
                    {group.length} gợi ý · cần xác nhận dữ liệu cache
                  </span>
                </button>
              ) : null,
            )}
          </div>
        </aside>
      ) : null}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-semibold">
          Ghi chú
          <textarea
            disabled={!editable}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 p-3"
          />
        </label>
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold">Tồn và giá vốn đầu kỳ</h2>
        {lines.map((line, index) => (
          <div
            key={`${index}-${line.productId}`}
            className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_11rem_11rem_auto]"
          >
            <ProductSelect
              label={`Sản phẩm mở sổ dòng ${index + 1}`}
              value={line.productId}
              readOnly={!editable}
              disabled={line.sourceSuggestionId !== null}
              excludedIds={selectedIds}
              selectedSnapshot={(() => {
                const saved = document?.lines.find(
                  (item) => item.productId === line.productId,
                );
                return saved
                  ? {
                      id: line.productId,
                      name: saved.productName,
                      sku: saved.sku,
                    }
                  : products.find((item) => item.id === line.productId);
              })()}
              onChange={(productId) =>
                setLines((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, productId } : item,
                  ),
                )
              }
            />
            <NumericField
              label="Tồn đầu kỳ"
              disabled={!editable}
              kind="quantity"
              precision={18}
              positive
              value={line.countedQty}
              onChange={(value) =>
                setLines((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, countedQty: value } : item,
                  ),
                )
              }
            />
            <NumericField
              label="Giá vốn đầu kỳ"
              disabled={!editable}
              kind="money"
              precision={20}
              value={line.openingUnitCost}
              onChange={(value) =>
                setLines((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, openingUnitCost: value }
                      : item,
                  ),
                )
              }
            />
            {editable && lines.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  setLines((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                className="min-h-11 px-3 text-sm font-semibold text-red-700"
              >
                Xóa
              </button>
            ) : null}
            {line.sourceSuggestionId ? (
              <p className="md:col-span-4 rounded-md bg-amber-100 p-2 text-xs text-amber-950">
                Nguồn cache chưa kiểm chứng đã được owner chọn; hãy kiểm tra lại
                số lượng và đơn giá trước khi gửi.
              </p>
            ) : null}
          </div>
        ))}
        {editable ? (
          <button
            type="button"
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  productId: '',
                  countedQty: '1',
                  openingUnitCost: '0',
                  sourceSuggestionId: null,
                  confirmedUnverified: false,
                },
              ])
            }
            className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold"
          >
            Thêm dòng
          </button>
        ) : null}
      </div>
    </>
  );
}
