/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { NumericField } from '../../components/forms/NumericField';
import { useToast } from '../../components/feedback/use-toast';
import { useOnlineStatus } from '../../app/use-online-status';
import { createCatalogApi } from '../catalog/catalog-api';
import { createDirectoryApi } from '../directories/directory-api';
import { useSession } from '../auth/use-session';
import { createSalesApi, type CartLine, type Sale } from './sales-api';

type CartItem = CartLine & {
  productName: string;
  sku: string;
  unitName: string;
  unitSalePrice: string;
  onHandQty: string;
};
const money = (value: string | number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value));
const key = 'tuenhi:pos:cart:';
const uuid = () => crypto.randomUUID();

export function PosPage() {
  const { saleId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnlineStatus();
  const { session } = useSession();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CartItem[]>([]);
  const [channelId, setChannelId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [orderDiscount, setOrderDiscount] = useState('0');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Sale | null>(null);
  const [payment, setPayment] = useState<'CASH' | 'BANK_TRANSFER' | null>(null);
  const [saving, setSaving] = useState(false);
  const canDiscount = Boolean(
    session?.permissions.includes('sale.discount.apply'),
  );
  const catalog = useQuery({
    queryKey: ['pos-products', search],
    queryFn: () => createCatalogApi().list({ search, limit: 30 }),
  });
  const channels = useQuery({
    queryKey: ['pos-channels'],
    queryFn: () => createDirectoryApi().listSalesChannels(false),
  });
  const customers = useQuery({
    queryKey: ['pos-customers'],
    queryFn: () => createDirectoryApi().listCustomers({ limit: 100 }),
  });
  const detail = useQuery({
    queryKey: ['sale', saleId],
    queryFn: () => createSalesApi().detail(saleId!),
    enabled: Boolean(saleId),
  });
  useEffect(() => {
    if (!channelId && channels.data) {
      setChannelId(
        channels.data.find((x) => x.code === 'IN_STORE')?.id ??
          channels.data[0]?.id ??
          '',
      );
    }
  }, [channelId, channels.data]);
  useEffect(() => {
    if (!detail.data) return;
    const s = detail.data;
    setDraft(s);
    setChannelId(s.salesChannelId);
    setCustomerId(s.customerId ?? '');
    setOrderDiscount(s.orderDiscountTotal);
    setNote(s.note ?? '');
    setItems(s.lines.map((x) => ({ ...x, onHandQty: '0' })));
  }, [detail.data]);
  useEffect(() => {
    if (!session?.userId || saleId) return;
    const raw = localStorage.getItem(key + session.userId);
    if (raw)
      try {
        const value = JSON.parse(raw) as {
          items: CartItem[];
          channelId: string;
          customerId: string;
          orderDiscount: string;
          note: string;
        };
        setItems(value.items);
        setChannelId(value.channelId || channelId);
        setCustomerId(value.customerId);
        setOrderDiscount(value.orderDiscount);
        setNote(value.note);
      } catch {
        /* ignore damaged local cart */
      }
  }, [channelId, session?.userId, saleId]);
  useEffect(() => {
    if (!session?.userId || saleId) return;
    localStorage.setItem(
      key + session.userId,
      JSON.stringify({ items, channelId, customerId, orderDiscount, note }),
    );
  }, [
    session?.userId,
    saleId,
    items,
    channelId,
    customerId,
    orderDiscount,
    note,
  ]);
  const subtotal = useMemo(
    () =>
      items.reduce(
        (total, x) => total + Number(x.quantity) * Number(x.unitSalePrice),
        0,
      ),
    [items],
  );
  const lineDiscount = useMemo(
    () =>
      items.reduce((total, x) => total + Number(x.lineDiscountAmount || 0), 0),
    [items],
  );
  const total = Math.max(
    0,
    subtotal - lineDiscount - Number(orderDiscount || 0),
  );
  const add = (product: {
    id: string;
    name: string;
    sku: string;
    unitName: string;
    currentSalePrice: string | null;
    onHandQty: string;
  }) => {
    const salePrice = product.currentSalePrice;
    if (!salePrice) return;
    setItems((current) => {
      const found = current.find((x) => x.productId === product.id);
      if (found)
        return current.map((x) =>
          x.productId === product.id
            ? { ...x, quantity: String(Number(x.quantity) + 1) }
            : x,
        );
      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unitName: product.unitName,
          quantity: '1',
          unitSalePrice: salePrice,
          lineDiscountAmount: '0',
          lineOrder: current.length,
          onHandQty: product.onHandQty,
        },
      ];
    });
  };
  const update = (
    id: string,
    field: 'quantity' | 'lineDiscountAmount',
    value: string,
  ) =>
    setItems((current) =>
      current.map((x) => (x.productId === id ? { ...x, [field]: value } : x)),
    );
  const save = async () => {
    if (!online) {
      toast.show({
        kind: 'info',
        title: 'Đang ngoại tuyến',
        message:
          'Giỏ hàng được giữ trên thiết bị. Vui lòng kết nối lại để lưu tạm.',
      });
      return null;
    }
    if (!channelId || !items.length) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể lưu',
        message: 'Vui lòng chọn kênh bán và ít nhất một sản phẩm.',
      });
      return null;
    }
    setSaving(true);
    try {
      const result = await createSalesApi().saveDraft({
        saleId: draft?.id,
        expectedVersion: draft?.version,
        customerId: customerId || undefined,
        channelId,
        lines: items.map((x, index) => ({
          productId: x.productId,
          quantity: x.quantity,
          lineDiscountAmount: canDiscount ? x.lineDiscountAmount : '0',
          lineOrder: index,
        })),
        orderDiscount: canDiscount ? orderDiscount : '0',
        note,
        idempotencyKey: uuid(),
      });
      setDraft(result.sale);
      setItems(
        result.sale.lines.map((x) => ({
          ...x,
          onHandQty:
            items.find((i) => i.productId === x.productId)?.onHandQty ?? '0',
        })),
      );
      if (!saleId) navigate(`/pos/${result.sale.id}`, { replace: true });
      toast.show({
        kind: 'success',
        title: 'Đã lưu tạm',
        message: 'Giỏ hàng đã được lưu an toàn trên máy chủ.',
      });
      return result.sale;
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Không thể lưu tạm',
        message: error instanceof Error ? error.message : 'Vui lòng thử lại.',
      });
      return null;
    } finally {
      setSaving(false);
    }
  };
  const pay = async () => {
    if (!payment) return;
    if (!online) {
      toast.show({
        kind: 'info',
        title: 'Đang ngoại tuyến',
        message: 'Không thể thanh toán khi mất kết nối.',
      });
      return;
    }
    const saved = await save();
    if (!saved) return;
    setSaving(true);
    try {
      const done = await createSalesApi().complete(
        saved.id,
        saved.version,
        payment,
        uuid(),
      );
      if (session?.userId) localStorage.removeItem(key + session.userId);
      toast.show({
        kind: 'success',
        title: 'Thanh toán thành công',
        message: `Đã hoàn tất hóa đơn ${done.saleNumber}.`,
      });
      navigate(`/sales/${done.saleId}`);
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể thanh toán',
        message:
          error instanceof Error
            ? error.message
            : 'Vui lòng kiểm tra lại giỏ hàng.',
      });
    } finally {
      setSaving(false);
      setPayment(null);
    }
  };
  const discard = async () => {
    if (!draft || !online) return;
    try {
      await createSalesApi().discardDraft(draft.id, draft.version, uuid());
      if (session?.userId) localStorage.removeItem(key + session.userId);
      navigate('/pos');
      toast.show({ kind: 'success', title: 'Đã bỏ nháp' });
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Không thể bỏ nháp',
        message: error instanceof Error ? error.message : undefined,
      });
    }
  };
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Bán hàng</h1>
          <p className="text-sm text-slate-600">
            Tìm hàng, lập giỏ và thanh toán.
          </p>
        </div>
        {draft ? (
          <button
            onClick={discard}
            className="min-h-11 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-700"
            disabled={!online || saving}
          >
            Bỏ nháp
          </button>
        ) : null}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="mb-2 block text-sm font-medium">
            Tìm hoặc quét mã vạch
          </label>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && catalog.data?.items[0])
                add(catalog.data.items[0]);
            }}
            placeholder="Tên hàng, SKU hoặc mã vạch rồi nhấn Enter"
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
          />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {catalog.data?.items.map((product) => (
              <button
                key={product.id}
                onClick={() => add(product)}
                disabled={!product.currentSalePrice}
                className="rounded-lg border border-slate-200 p-3 text-left hover:border-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                <p className="font-medium text-slate-950">{product.name}</p>
                <p className="text-xs text-slate-500">
                  {product.sku} · Tồn {product.onHandQty} {product.unitName}
                </p>
                <p className="mt-1 text-sm font-semibold text-teal-800">
                  {product.currentSalePrice
                    ? money(product.currentSalePrice)
                    : 'Chưa có giá'}
                </p>
              </button>
            ))}
          </div>
          {catalog.isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Đang tìm hàng…</p>
          ) : null}
        </section>
        <aside className="rounded-xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4 lg:h-fit">
          <h2 className="text-lg font-semibold">Giỏ hàng</h2>
          <div className="mt-3 space-y-3">
            {items.map((item) => (
              <div
                key={item.productId}
                className="border-b border-slate-100 pb-3"
              >
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-xs text-slate-500">
                      {item.sku} · {money(item.unitSalePrice)}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setItems((x) =>
                        x.filter((line) => line.productId !== item.productId),
                      )
                    }
                    className="text-sm text-red-700"
                  >
                    Xóa
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <NumericField
                    label="Số lượng"
                    value={item.quantity}
                    onChange={(v) => update(item.productId, 'quantity', v)}
                    kind="quantity"
                    precision={3}
                    positive
                  />
                  <NumericField
                    label="Giảm dòng"
                    value={item.lineDiscountAmount}
                    onChange={(v) =>
                      update(item.productId, 'lineDiscountAmount', v)
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
                onChange={(e) => setChannelId(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
              >
                {channels.data?.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Khách hàng
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
              >
                <option value="">Khách lẻ</option>
                {customers.data?.items.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.name}
                    {x.phone ? ` · ${x.phone}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <NumericField
              label="Giảm toàn đơn"
              value={orderDiscount}
              onChange={setOrderDiscount}
              kind="money"
              precision={2}
              disabled={!canDiscount}
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú (nếu có)"
              className="min-h-20 w-full rounded-lg border border-slate-300 p-3"
            />
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Tiền hàng</dt>
                <dd>{money(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Giảm giá</dt>
                <dd>-{money(lineDiscount + Number(orderDiscount || 0))}</dd>
              </div>
              <div className="flex justify-between text-lg font-semibold">
                <dt>Cần thanh toán</dt>
                <dd>{money(total)}</dd>
              </div>
            </dl>
            <button
              onClick={save}
              disabled={saving || !online || !items.length}
              className="min-h-11 w-full rounded-lg border border-teal-700 px-4 font-semibold text-teal-800 disabled:opacity-50"
            >
              Lưu tạm
            </button>
            <button
              onClick={() => setPayment('CASH')}
              disabled={saving || !online || !items.length}
              className="min-h-11 w-full rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
            >
              Thanh toán
            </button>
            {!online ? (
              <p className="text-sm text-amber-700">
                Đang ngoại tuyến: thanh toán và lưu tạm đã bị khóa.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
      {payment ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 grid place-items-center bg-slate-950/40 p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Xác nhận thanh toán</h2>
            <p className="mt-2 text-sm">
              Tổng tiền: <strong>{money(total)}</strong>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setPayment('CASH')}
                className={`min-h-11 rounded-lg border ${payment === 'CASH' ? 'border-teal-700 bg-teal-50' : 'border-slate-300'}`}
              >
                Tiền mặt
              </button>
              <button
                onClick={() => setPayment('BANK_TRANSFER')}
                className={`min-h-11 rounded-lg border ${payment === 'BANK_TRANSFER' ? 'border-teal-700 bg-teal-50' : 'border-slate-300'}`}
              >
                Chuyển khoản
              </button>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setPayment(null)}
                className="min-h-11 flex-1 rounded-lg border border-slate-300"
              >
                Quay lại
              </button>
              <button
                onClick={pay}
                disabled={saving}
                className="min-h-11 flex-1 rounded-lg bg-teal-700 font-semibold text-white"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
