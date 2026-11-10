import { useState } from 'react';
import {
  CaretRight,
  Tag,
  Minus,
  Plus,
  ImageSquare,
} from '@phosphor-icons/react';
import { ProductImageThumbnail } from '@/features/catalog';
import {
  formatViDecimal,
  INTEGER_FINAL,
} from '@/shared/lib/numeric/canonical-number';
import { CustomerPicker } from './CustomerPicker';
import type { CustomerItem } from '@/features/directories';
import type { SalesChannelItem } from '@/features/settings';
import { NumericField } from '@/shared/ui/forms/NumericField';
import { formatPosMoney } from '../model/format-money';
import {
  isPositiveMoney,
  lineGrossAmount,
  lineNetAmount,
} from '../model/pos-totals';
import { DiscountDialog } from './DiscountDialog';
import type { PosCartItem } from '../model/pos-types';

export function CartPanel({
  items,
  channels,
  customers,
  channelId,
  customerId,
  orderDiscount,
  note,
  subtotal,
  itemsTotal,
  discountTotal,
  total,
  canDiscount,
  online,
  saving,
  onUpdateLine,
  onRemoveLine,
  onChannelChange,
  onCustomerChange,
  onOrderDiscountChange,
  onNoteChange,
  onSave,
  onCheckout,
  onPrint,
}: {
  items: PosCartItem[];
  channels: SalesChannelItem[];
  customers: CustomerItem[];
  channelId: string;
  customerId: string;
  orderDiscount: string;
  note: string;
  subtotal: string;
  itemsTotal: string;
  discountTotal: string;
  total: string;
  canDiscount: boolean;
  online: boolean;
  saving: boolean;
  onUpdateLine: (
    id: string,
    field: 'quantity' | 'lineDiscountAmount',
    value: string,
  ) => void;
  onRemoveLine: (id: string) => void;
  onChannelChange: (id: string) => void;
  onCustomerChange: (id: string) => void;
  onOrderDiscountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onCheckout: () => void;
  onPrint: () => void;
}) {
  const [showOptions, setShowOptions] = useState(false);
  const [discountTarget, setDiscountTarget] = useState<string | null>(null);
  const discountLine =
    discountTarget && discountTarget !== 'ORDER'
      ? items.find((item) => item.productId === discountTarget)
      : undefined;
  const customer = customers.find((item) => item.id === customerId);
  const quantityCount = items.reduce(
    (sum, item) =>
      sum + (INTEGER_FINAL.test(item.quantity) ? BigInt(item.quantity) : 0n),
    0n,
  );
  return (
    <aside className={`pos-cart ${showOptions ? 'pos-show-options' : ''}`}>
      <h2 className="sr-only">Giỏ hàng</h2>
      <div className="pos-sale-context">
        <CustomerPicker
          compact
          value={customerId || null}
          disabled={saving}
          selectedSnapshot={customer}
          onChange={(id) => onCustomerChange(id ?? '')}
        />
        <button
          type="button"
          className="pos-context-row"
          aria-expanded={showOptions}
          onClick={() => setShowOptions((current) => !current)}
        >
          <Tag size={19} aria-hidden="true" />
          <span>Bảng giá chung</span>
          <CaretRight size={20} aria-hidden="true" />
        </button>
        <div className="pos-order-options pos-extra">
          <label className="block text-sm font-medium">
            Kênh bán
            <select
              value={channelId}
              onChange={(event) => onChannelChange(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
            >
              {channels.map((channel) => (
                <option value={channel.id} key={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </label>
          <textarea
            aria-label="Ghi chú đơn hàng"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Ghi chú (nếu có)"
            className="min-h-20 w-full rounded-lg border border-slate-300 p-3"
          />
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Tiền hàng</dt>
              <dd>{formatPosMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Giảm giá</dt>
              <dd>-{formatPosMoney(discountTotal)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Cần thanh toán</dt>
              <dd>{formatPosMoney(total)}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="pos-cart-items">
        {items.map((item) => {
          const validQuantity =
            INTEGER_FINAL.test(item.quantity) && item.quantity.length <= 18;
          const quantity = validQuantity ? BigInt(item.quantity) : 0n;
          return (
            <div key={item.productId} className="pos-cart-item">
              <div className="pos-item-image">
                {item.primaryImagePath || item.id ? (
                  <ProductImageThumbnail
                    objectPath={item.primaryImagePath}
                    productId={item.productId}
                    alt={item.productName}
                    className="h-full w-full"
                  />
                ) : (
                  <ImageSquare
                    size={38}
                    weight="duotone"
                    aria-label="Chưa có ảnh"
                  />
                )}
              </div>
              <div className="pos-item-content">
                <div className="pos-item-heading">
                  <p className="pos-item-name">{item.productName}</p>
                  <button
                    type="button"
                    aria-label={`Xóa ${item.productName} khỏi đơn`}
                    title="Xóa khỏi đơn"
                    onClick={() => onRemoveLine(item.productId)}
                    className="pos-item-remove"
                  >
                    Xóa
                  </button>
                </div>
                <div className="pos-item-bottom">
                  {canDiscount ? (
                    <button
                      type="button"
                      className="pos-item-price"
                      aria-label={`Giảm giá ${item.productName}, đơn giá ${formatPosMoney(item.unitSalePrice)}`}
                      onClick={() => setDiscountTarget(item.productId)}
                    >
                      {formatPosMoney(item.unitSalePrice)}
                    </button>
                  ) : (
                    <p className="pos-item-price">
                      {formatPosMoney(item.unitSalePrice)}
                    </p>
                  )}
                  <div
                    className="pos-quantity"
                    role="group"
                    aria-label={`Số lượng ${item.productName}`}
                  >
                    <button
                      type="button"
                      aria-label={
                        quantity <= 1n
                          ? `Xóa ${item.productName} khỏi đơn`
                          : `Giảm số lượng ${item.productName}`
                      }
                      disabled={!validQuantity || quantity <= 0n}
                      onClick={() =>
                        quantity <= 1n
                          ? onRemoveLine(item.productId)
                          : onUpdateLine(
                              item.productId,
                              'quantity',
                              (quantity - 1n).toString(),
                            )
                      }
                    >
                      <Minus size={17} />
                    </button>
                    <NumericField
                      label="Số lượng"
                      value={item.quantity}
                      onChange={(value) =>
                        onUpdateLine(item.productId, 'quantity', value)
                      }
                      kind="quantity"
                      precision={18}
                      positive
                    />
                    <button
                      type="button"
                      aria-label={`Tăng số lượng ${item.productName}`}
                      disabled={
                        !validQuantity || quantity >= 999999999999999999n
                      }
                      onClick={() =>
                        onUpdateLine(
                          item.productId,
                          'quantity',
                          (quantity + 1n).toString(),
                        )
                      }
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                </div>
                {quantity !== 1n || isPositiveMoney(item.lineDiscountAmount) ? (
                  <p className="pos-line-net">
                    <span>
                      {isPositiveMoney(item.lineDiscountAmount) ? (
                        <span className="pos-line-discount">
                          Giảm -{formatPosMoney(item.lineDiscountAmount)}
                        </span>
                      ) : null}
                    </span>
                    <span>
                      Thành tiền{' '}
                      <strong>{formatPosMoney(lineNetAmount(item))}</strong>
                    </span>
                  </p>
                ) : null}
                {item.onHandQty.startsWith('-') ? (
                  <p className="mt-1 text-xs text-amber-800">
                    Tồn {formatViDecimal(item.onHandQty, 0)} {item.unitName}
                  </p>
                ) : null}
                <div className="pos-line-options pos-extra">
                  <p className="text-xs text-slate-500">
                    {item.sku} · {item.unitName}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {!items.length ? (
          <p className="py-16 text-center text-sm text-slate-500">
            Chưa có sản phẩm trong giỏ.
          </p>
        ) : null}
      </div>
      <div className="pos-tools">
        <button
          type="button"
          onClick={() => setShowOptions((current) => !current)}
          aria-expanded={showOptions}
        >
          Tùy chọn đơn hàng
        </button>
      </div>
      {!online ? (
        <p role="status" className="px-4 py-2 text-sm text-amber-800">
          Đang ngoại tuyến: thanh toán và lưu tạm đã bị khóa.
        </p>
      ) : null}
      <div className="pos-checkout-bar">
        <div className="pos-checkout-total">
          <span>
            Tổng tiền hàng{' '}
            <span className="pos-item-count" aria-label="Tổng số lượng">
              {quantityCount.toString()}
            </span>
          </span>
          <strong>{formatPosMoney(itemsTotal)}</strong>
        </div>
        <button
          type="button"
          className="pos-checkout-row"
          disabled={!canDiscount || !items.length}
          onClick={() => setDiscountTarget('ORDER')}
        >
          <span>Giảm giá đơn</span>
          <span>
            {!canDiscount
              ? 'Không có quyền'
              : isPositiveMoney(orderDiscount)
                ? `-${formatPosMoney(orderDiscount)}`
                : formatPosMoney('0')}
            <CaretRight size={16} aria-hidden="true" />
          </span>
        </button>
        {isPositiveMoney(orderDiscount) ? (
          <p className="pos-checkout-row pos-checkout-due">
            <span>Khách cần trả</span>
            <strong>{formatPosMoney(total)}</strong>
          </p>
        ) : null}
        <div className="pos-checkout-actions">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !online || !items.length}
            className="pos-save"
          >
            Lưu tạm
          </button>
          <button
            type="button"
            onClick={onCheckout}
            disabled={saving || !online || !items.length}
            className="pos-pay"
          >
            Thanh toán
          </button>
        </div>
        <button
          type="button"
          className="pos-print-action"
          onClick={onPrint}
          disabled={saving || !online || !items.length}
        >
          In tạm tính
        </button>
      </div>
      {discountTarget === 'ORDER' ? (
        <DiscountDialog
          title="Giảm giá đơn"
          base={itemsTotal}
          value={orderDiscount}
          onCancel={() => setDiscountTarget(null)}
          onApply={(amount) => {
            onOrderDiscountChange(amount);
            setDiscountTarget(null);
          }}
        />
      ) : discountLine ? (
        <DiscountDialog
          title={discountLine.productName}
          base={lineGrossAmount(discountLine)}
          value={discountLine.lineDiscountAmount}
          onCancel={() => setDiscountTarget(null)}
          onApply={(amount) => {
            onUpdateLine(discountLine.productId, 'lineDiscountAmount', amount);
            setDiscountTarget(null);
          }}
        />
      ) : null}
    </aside>
  );
}
