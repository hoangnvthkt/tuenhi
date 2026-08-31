import type { Dispatch, SetStateAction } from 'react';
import { Link } from 'react-router';
import type { ProductCatalogItem } from '@/features/catalog';
import { NumericField } from '@/shared/ui/forms/NumericField';
import type { PurchaseReceipt } from '../api/purchase-schemas';
import type { PurchaseDraftLine } from '../model/purchase-draft';

export function PurchaseLineEditor({
  lines,
  products,
  receipt,
  costs,
  editable,
  canPost,
  lineProductIds,
  setLines,
  setCosts,
  canViewProduct,
}: {
  lines: PurchaseDraftLine[];
  products: ProductCatalogItem[];
  receipt: PurchaseReceipt | null;
  costs: Record<string, string>;
  editable: boolean;
  canPost: boolean;
  lineProductIds: Set<string>;
  setLines: Dispatch<SetStateAction<PurchaseDraftLine[]>>;
  setCosts: Dispatch<SetStateAction<Record<string, string>>>;
  canViewProduct: boolean;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold">Sản phẩm nhận</h2>
      {lines.map((line, index) => {
        const persistedLine = receipt?.lines[index];
        return (
          <div
            key={`${index}-${persistedLine?.id ?? 'new'}`}
            className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_11rem_11rem_auto]"
          >
            <div>
              <select
                aria-label={`Sản phẩm dòng ${index + 1}`}
                disabled={!editable}
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
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
              >
                <option value="">Chọn sản phẩm</option>
                {products.map((product) => (
                  <option
                    disabled={
                      lineProductIds.has(product.id) &&
                      product.id !== line.productId
                    }
                    key={product.id}
                    value={product.id}
                  >
                    {product.sku} — {product.name}
                  </option>
                ))}
              </select>
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
            {canPost && receipt?.status === 'AWAITING_COST' && persistedLine ? (
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
        <button
          type="button"
          onClick={() =>
            setLines((current) => [
              ...current,
              { productId: '', receivedQty: '1' },
            ])
          }
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold"
        >
          Thêm dòng
        </button>
      ) : null}
    </div>
  );
}
