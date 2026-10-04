import { CustomerPicker } from './CustomerPicker';
import type { CustomerItem } from '@/features/directories';
import type { SalesChannelItem } from '@/features/settings';
import { NumericField } from '@/shared/ui/forms/NumericField';
import { formatPosMoney } from '../model/format-money';
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
  return (
    <aside className="rounded-xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4 lg:h-fit">
      <h2 className="text-lg font-semibold">Giỏ hàng</h2>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item.productId} className="border-b border-slate-100 pb-3">
            <div className="flex justify-between gap-2">
              <div>
                <p className="font-medium">{item.productName}</p>
                <p className="text-xs text-slate-500">
                  {item.sku} · {formatPosMoney(item.unitSalePrice)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveLine(item.productId)}
                className="text-sm text-red-700"
              >
                Xóa
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
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
              <NumericField
                label="Giảm dòng"
                value={item.lineDiscountAmount}
                onChange={(value) =>
                  onUpdateLine(item.productId, 'lineDiscountAmount', value)
                }
                kind="money"
                precision={2}
                disabled={!canDiscount}
              />
            </div>
          </div>
        ))}
      </div>
      {!items.length ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Chưa có sản phẩm trong giỏ.
        </p>
      ) : null}
      <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
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
        <CustomerPicker
          value={customerId || null}
          disabled={saving}
          selectedSnapshot={customers.find((item) => item.id === customerId)}
          onChange={(id) => onCustomerChange(id ?? '')}
        />
        <NumericField
          label="Giảm toàn đơn"
          value={orderDiscount}
          onChange={onOrderDiscountChange}
          kind="money"
          precision={2}
          disabled={!canDiscount}
        />
        <textarea
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
          <div className="flex justify-between text-lg font-semibold">
            <dt>Cần thanh toán</dt>
            <dd>{formatPosMoney(total)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !online || !items.length}
          className="min-h-11 w-full rounded-lg border border-teal-700 px-4 font-semibold text-teal-800 disabled:opacity-50"
        >
          Lưu tạm
        </button>
        <button
          type="button"
          onClick={onPrint}
          disabled={saving || !online || !items.length}
          className="min-h-11 w-full rounded-lg border border-teal-700 px-4 font-semibold text-teal-800 disabled:opacity-50"
        >
          In tạm tính
        </button>
        <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg xl:static xl:rounded-none xl:border-0 xl:p-0 xl:shadow-none">
          <div className="min-w-0 flex-1 text-sm xl:hidden">
            <p>Cần thanh toán</p>
            <p className="font-semibold text-teal-900">
              {formatPosMoney(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCheckout}
            disabled={saving || !online || !items.length}
            className="min-h-11 shrink-0 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50 xl:w-full"
          >
            Thanh toán
          </button>
        </div>
        {!online ? (
          <p className="text-sm text-amber-700">
            Đang ngoại tuyến: thanh toán và lưu tạm đã bị khóa.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
