/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { createCatalogApi } from '@/features/catalog';
import { createDirectoryApi } from '@/features/directories';
import { createSettingsApi } from '@/features/settings';
import { useSession } from '@/features/auth';
import { createSalesApi } from '../api/sales-api';
import type { Sale } from '../api/sales-schemas';
import { CartPanel } from '../components/CartPanel';
import { CheckoutDialog } from '../components/CheckoutDialog';
import { ProductPicker } from '../components/ProductPicker';
import type { PosCartItem, PosPaymentMethod } from '../model/pos-types';
import { posCartStorageKey } from '../model/pos-storage';
import { usePosCommands } from '../hooks/use-pos-commands';

export function PosPage() {
  const { saleId } = useParams();
  const online = useOnlineStatus();
  const { session } = useSession();
  const [salesApi] = useState(createSalesApi);
  const [catalogApi] = useState(createCatalogApi);
  const [directoryApi] = useState(createDirectoryApi);
  const [settingsApi] = useState(createSettingsApi);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<PosCartItem[]>([]);
  const [channelId, setChannelId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [orderDiscount, setOrderDiscount] = useState('0');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Sale | null>(null);
  const [payment, setPayment] = useState<PosPaymentMethod | null>(null);
  const canDiscount = Boolean(
    session?.permissions.includes('sale.discount.apply'),
  );
  const catalog = useQuery({
    queryKey: ['pos-products', search],
    queryFn: () => catalogApi.list({ search, limit: 30 }),
  });
  const channels = useQuery({
    queryKey: ['pos-channels'],
    queryFn: () => settingsApi.listSalesChannels(false),
  });
  const customers = useQuery({
    queryKey: ['pos-customers'],
    queryFn: () => directoryApi.listCustomers({ limit: 100 }),
  });
  const detail = useQuery({
    queryKey: ['sale', saleId],
    queryFn: () => salesApi.detail(saleId!),
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
    const raw = localStorage.getItem(posCartStorageKey(session.userId));
    if (raw)
      try {
        const value = JSON.parse(raw) as {
          items: PosCartItem[];
          channelId: string;
          customerId: string;
          orderDiscount: string;
          note: string;
        };
        setItems(value.items);
        if (value.channelId) setChannelId(value.channelId);
        setCustomerId(value.customerId);
        setOrderDiscount(value.orderDiscount);
        setNote(value.note);
      } catch {
        /* ignore damaged local cart */
      }
  }, [session?.userId, saleId]);
  useEffect(() => {
    if (!session?.userId || saleId) return;
    localStorage.setItem(
      posCartStorageKey(session.userId),
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
  const { discard, pay, save, saving } = usePosCommands({
    api: salesApi,
    online,
    userId: session?.userId,
    saleId,
    draft,
    items,
    customerId,
    channelId,
    orderDiscount,
    note,
    canDiscount,
    payment,
    setDraft,
    setItems,
    setPayment,
  });
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
        <ProductPicker
          search={search}
          products={catalog.data?.items ?? []}
          isLoading={catalog.isLoading}
          onSearchChange={setSearch}
          onAdd={add}
        />
        <CartPanel
          items={items}
          channels={channels.data ?? []}
          customers={customers.data?.items ?? []}
          channelId={channelId}
          customerId={customerId}
          orderDiscount={orderDiscount}
          note={note}
          subtotal={subtotal}
          lineDiscount={lineDiscount}
          total={total}
          canDiscount={canDiscount}
          online={online}
          saving={saving}
          onUpdateLine={update}
          onRemoveLine={(id) =>
            setItems((current) =>
              current.filter((line) => line.productId !== id),
            )
          }
          onChannelChange={setChannelId}
          onCustomerChange={setCustomerId}
          onOrderDiscountChange={setOrderDiscount}
          onNoteChange={setNote}
          onSave={() => void save()}
          onCheckout={() => setPayment('CASH')}
        />
      </div>
      {payment ? (
        <CheckoutDialog
          payment={payment}
          total={total}
          saving={saving}
          onPaymentChange={setPayment}
          onCancel={() => setPayment(null)}
          onConfirm={(proofFile) => void pay(proofFile)}
        />
      ) : null}
    </main>
  );
}
