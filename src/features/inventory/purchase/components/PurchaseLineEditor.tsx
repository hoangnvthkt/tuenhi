import { useState, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router';
import { ProductSelect, type ProductCatalogItem } from '@/features/catalog';
import { NumericField } from '@/shared/ui/forms/NumericField';
import type { PurchaseReceipt } from '../api/purchase-schemas';
import type { ResolvedPurchaseProduct } from '../api/purchase-schemas';
import type { PurchaseDraftLine } from '../model/purchase-draft';
import { PurchaseExcelImportDialog } from './PurchaseExcelImportDialog';

export function PurchaseLineEditor({
  lines,
  products,
  receipt,
  costs,
  editable,
  canPost,
  canEnterCost,
  lineProductIds,
  setLines,
  setCosts,
  canViewProduct,
  resolveProducts,
}: {
  lines: PurchaseDraftLine[];
  products: ProductCatalogItem[];
  receipt: PurchaseReceipt | null;
  costs: Record<string, string>;
  editable: boolean;
  canPost: boolean;
  canEnterCost: boolean;
  lineProductIds: Set<string>;
  setLines: Dispatch<SetStateAction<PurchaseDraftLine[]>>;
  setCosts: Dispatch<SetStateAction<Record<string, string>>>;
  canViewProduct: boolean;
  resolveProducts: (skus: string[]) => Promise<ResolvedPurchaseProduct[]>;
}) {
  const [importOpen, setImportOpen] = useState(false);
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold">Sản phẩm nhận</h2>
      {lines.map((line, index) => {
        const persistedLine = receipt?.lines.find(
          (item) => item.productId === line.productId,
        );
        return (
          <div
            key={`${index}-${persistedLine?.id ?? 'new'}`}
            className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_11rem_11rem_auto]"
          >
            <div>
              <ProductSelect
                label={`Sản phẩm dòng ${index + 1}`}
                readOnly={!editable}
                value={line.productId}
                excludedIds={lineProductIds}
                selectedSnapshot={
                  line.selectedSnapshot ??
                  (persistedLine
                    ? {
                        id: line.productId,
                        name: persistedLine.productName,
                        sku: persistedLine.sku,
                      }
                    : products.find((item) => item.id === line.productId))
                }
                onChange={(productId, product) =>
                  setLines((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            productId,
                            selectedSnapshot: product ?? undefined,
                            unitCost:
                              item.productId === productId
                                ? item.unitCost
                                : canEnterCost
                                  ? (product?.defaultCost ?? '')
                                  : '',
                          }
                        : item,
                    ),
                  )
                }
              />
              {canViewProduct && line.productId ? (
                <Link
                  to={`/products/${line.productId}`}
                  aria-label={`Mở ${persistedLine?.productName ?? products.find((product) => product.id === line.productId)?.name ?? 'sản phẩm'}`}
                  className="mt-2 inline-block text-xs font-semibold text-teal-800 hover:underline"
                >
                  Mở chi tiết sản phẩm
                </Link>
              ) : null}
            </div>
            <NumericField
              label="Số lượng nhận"
              disabled={!editable}
              kind="quantity"
              precision={18}
              positive
              value={line.receivedQty}
              onChange={(value) =>
                setLines((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, receivedQty: value }
                      : item,
                  ),
                )
              }
            />
            {editable && canEnterCost ? (
              <NumericField
                label="Đơn giá nhập"
                disabled={!editable}
                kind="money"
                precision={20}
                positive
                value={line.unitCost}
                onChange={(value) =>
                  setLines((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, unitCost: value } : item,
                    ),
                  )
                }
              />
            ) : canPost &&
              receipt?.status === 'AWAITING_COST' &&
              persistedLine ? (
              <NumericField
                label={`Đơn giá ${persistedLine.productName}`}
                kind="money"
                precision={20}
                value={costs[persistedLine.id] ?? ''}
                onChange={(value) =>
                  setCosts((current) => ({
                    ...current,
                    [persistedLine.id]: value,
                  }))
                }
              />
            ) : (
              <span />
            )}
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
          </div>
        );
      })}
      {editable ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              setLines((current) => [
                ...current,
                { productId: '', receivedQty: '1', unitCost: '' },
              ])
            }
            className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold"
          >
            Thêm dòng
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="min-h-11 rounded-lg border border-teal-800 px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50"
          >
            Nhập từ Excel
          </button>
        </div>
      ) : null}
      {importOpen ? (
        <PurchaseExcelImportDialog
          existingProductIds={lineProductIds}
          resolveProducts={resolveProducts}
          onClose={() => setImportOpen(false)}
          onApply={(importedLines) => {
            setLines((current) => [...current, ...importedLines]);
            setImportOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
