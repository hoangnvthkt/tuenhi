/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { createCatalogApi, type ProductCatalogItem } from '@/features/catalog';
import { createDirectoryApi } from '@/features/directories';
import { createSettingsApi } from '@/features/settings';
import { useSession } from '@/features/auth';
import { createSalesApi } from '../api/sales-api';
import type { Sale } from '../api/sales-schemas';
import { CartPanel } from '../components/CartPanel';
import { CheckoutDialog } from '../components/CheckoutDialog';
import { ProductPicker } from '../components/ProductPicker';
import { PrefilledProductIntent } from '../components/PrefilledProductIntent';
import type { PosCartItem, PosPaymentMethod } from '../model/pos-types';
import {
  acquirePosEditorLease,
  migrateLegacyPosCart,
  ownsPosEditorLease,
  posCartSnapshotStorageKey,
  posEditorLeaseStorageKey,
  readPosCartSnapshot,
  refreshPosEditorLease,
  releasePosEditorLease,
  resolvePosCartSnapshot,
  writeOwnedPosCartSnapshot,
  type PosCartIdentity,
  type PosCartSnapshotV2,
} from '../model/pos-storage';
import { calculatePosTotals } from '../model/pos-totals';
import { usePosCommands } from '../hooks/use-pos-commands';
import {
  INTEGER_FINAL,
  incrementCanonicalInteger,
} from '@/shared/lib/numeric/canonical-number';

const POS_TAB_ID_KEY = 'tuenhi:pos:tab-id';

function getPosTabId() {
  try {
    const current = sessionStorage.getItem(POS_TAB_ID_KEY);
    if (current) return current;
    const created = crypto.randomUUID();
    sessionStorage.setItem(POS_TAB_ID_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function PosPage() {
  const { saleId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const online = useOnlineStatus();
  const { session } = useSession();
  const [salesApi] = useState(createSalesApi);
  const [catalogApi] = useState(createCatalogApi);
  const [directoryApi] = useState(createDirectoryApi);
  const [settingsApi] = useState(createSettingsApi);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState<PosCartItem[]>([]);
  const [channelId, setChannelId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [orderDiscount, setOrderDiscount] = useState('0');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Sale | null>(null);
  const [payment, setPayment] = useState<PosPaymentMethod | null>(null);
  const [cartWarning, setCartWarning] = useState<
    'INVALID_PAYLOAD' | 'DISCARDED_LINES' | null
  >(null);
  const [staleCartWarning, setStaleCartWarning] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [focusedProduct, setFocusedProduct] =
    useState<ProductCatalogItem | null>(null);
  const [focusWarning, setFocusWarning] = useState<string | null>(null);
  const [tabId] = useState(getPosTabId);
  const revisionRef = useRef(0);
  const draftVersionRef = useRef<number | null>(null);
  const identity = useMemo<PosCartIdentity>(
    () => (saleId ? { kind: 'DRAFT', saleId } : { kind: 'NEW' }),
    [saleId],
  );
  const focusProductId = searchParams.get('focusProduct');
  const clearFocusProduct = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('focusProduct');
    setSearchParams(next, { replace: true });
    setFocusedProduct(null);
  }, [searchParams, setSearchParams]);
  useEffect(() => {
    let active = true;
    if (!focusProductId || saleId) return;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        focusProductId,
      )
    ) {
      setFocusWarning('Liên kết sản phẩm không hợp lệ và đã được bỏ qua.');
      return;
    }
    setFocusWarning(null);
    catalogApi
      .detail(focusProductId)
      .then((product) => {
        if (!active) return;
        if (!product.isActive) {
          setFocusWarning('Sản phẩm trong liên kết đã ngừng hoạt động.');
          return;
        }
        setFocusedProduct(product);
        setSearch(product.sku);
      })
      .catch(() => {
        if (active)
          setFocusWarning(
            'Không thể mở sản phẩm từ liên kết. Vui lòng thử lại.',
          );
      });
    return () => {
      active = false;
    };
  }, [catalogApi, focusProductId, saleId]);
  const canDiscount = Boolean(
    session?.permissions.includes('sale.discount.apply'),
  );
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 225);
    return () => window.clearTimeout(timer);
  }, [search]);
  const catalog = useQuery({
    queryKey: ['pos-products', debouncedSearch],
    queryFn: () => catalogApi.list({ search: debouncedSearch, limit: 30 }),
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
  const restoreSnapshot = useCallback((snapshot: PosCartSnapshotV2) => {
    revisionRef.current = snapshot.revision;
    setItems(snapshot.items);
    if (snapshot.channelId) setChannelId(snapshot.channelId);
    setCustomerId(snapshot.customerId);
    setOrderDiscount(snapshot.orderDiscount);
    setNote(snapshot.note);
  }, []);

  useEffect(() => {
    const userId = session?.userId;
    if (!userId) return;
    setWorkspaceReady(false);
    setItems([]);
    setChannelId('');
    setCustomerId('');
    setOrderDiscount('0');
    setNote('');
    setDraft(null);
    setCartWarning(null);
    setStaleCartWarning(false);
    revisionRef.current = 0;
    draftVersionRef.current = null;
    const acquired = acquirePosEditorLease({
      userId,
      identity,
      tabId,
      now: new Date(),
    });
    setCanEdit(acquired);

    if (identity.kind === 'NEW') {
      const migrated = acquired
        ? migrateLegacyPosCart({ userId, tabId, now: new Date() })
        : undefined;
      const snapshot =
        migrated && !migrated.invalidPayload
          ? migrated.snapshot
          : readPosCartSnapshot(userId, identity);
      if (snapshot) restoreSnapshot(snapshot);
      setCartWarning(
        migrated?.invalidPayload
          ? 'INVALID_PAYLOAD'
          : migrated?.discardedLineCount
            ? 'DISCARDED_LINES'
            : null,
      );
      setWorkspaceReady(true);
    }

    const leaseKey = posEditorLeaseStorageKey(userId, identity);
    const snapshotKey = posCartSnapshotStorageKey(userId, identity);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== leaseKey && event.key !== snapshotKey) return;
      const ownsLease = ownsPosEditorLease({ userId, identity, tabId });
      setCanEdit(ownsLease);
      if (ownsLease) return;
      const snapshot = readPosCartSnapshot(userId, identity);
      const resolved = resolvePosCartSnapshot(
        snapshot,
        identity.kind === 'DRAFT' ? draftVersionRef.current : null,
      );
      if (resolved.status === 'RESTORE') restoreSnapshot(resolved.snapshot);
    };
    window.addEventListener('storage', onStorage);
    const heartbeat = window.setInterval(() => {
      const refreshed = refreshPosEditorLease({
        userId,
        identity,
        tabId,
        now: new Date(),
      });
      if (!refreshed) setCanEdit(false);
    }, 10_000);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(heartbeat);
      releasePosEditorLease({ userId, identity, tabId });
    };
  }, [identity, restoreSnapshot, session?.userId, tabId]);

  useEffect(() => {
    if (!detail.data || identity.kind !== 'DRAFT' || !session?.userId) return;
    const serverDraft = detail.data;
    draftVersionRef.current = serverDraft.version;
    setDraft(serverDraft);
    const local = resolvePosCartSnapshot(
      readPosCartSnapshot(session.userId, identity),
      serverDraft.version,
    );
    if (local.status === 'RESTORE') {
      restoreSnapshot(local.snapshot);
      setStaleCartWarning(false);
    } else {
      setChannelId(serverDraft.salesChannelId);
      setCustomerId(serverDraft.customerId ?? '');
      setOrderDiscount(serverDraft.orderDiscountTotal);
      setNote(serverDraft.note ?? '');
      setItems(serverDraft.lines.map((line) => ({ ...line, onHandQty: '0' })));
      setStaleCartWarning(local.status === 'STALE');
    }
    setWorkspaceReady(true);
  }, [detail.data, identity, restoreSnapshot, session?.userId]);

  useEffect(() => {
    const userId = session?.userId;
    if (!userId || !workspaceReady || !canEdit) return;
    const nextRevision = revisionRef.current + 1;
    const saved = writeOwnedPosCartSnapshot({
      snapshot: {
        version: 2,
        userId,
        identity,
        serverVersion: draft?.version ?? null,
        revision: nextRevision,
        updatedAt: new Date().toISOString(),
        lastWriterTabId: tabId,
        items,
        channelId,
        customerId,
        orderDiscount,
        note,
      },
      tabId,
      now: new Date(),
    });
    if (saved) revisionRef.current = nextRevision;
    else setCanEdit(false);
  }, [
    canEdit,
    channelId,
    customerId,
    draft?.version,
    identity,
    items,
    note,
    orderDiscount,
    session?.userId,
    tabId,
    workspaceReady,
  ]);

  const takeOver = () => {
    const userId = session?.userId;
    if (!userId) return;
    const acquired = acquirePosEditorLease({
      userId,
      identity,
      tabId,
      now: new Date(),
      force: true,
    });
    if (!acquired) return;
    const snapshot = resolvePosCartSnapshot(
      readPosCartSnapshot(userId, identity),
      identity.kind === 'DRAFT' ? draftVersionRef.current : null,
    );
    if (snapshot.status === 'RESTORE') restoreSnapshot(snapshot.snapshot);
    setCanEdit(true);
  };
  const totals = useMemo(
    () => calculatePosTotals(items, orderDiscount),
    [items, orderDiscount],
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
            ? {
                ...x,
                quantity: INTEGER_FINAL.test(x.quantity)
                  ? incrementCanonicalInteger(x.quantity)
                  : '1',
              }
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
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const target = event.target;
      const targetIsEditable =
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select') || target.isContentEditable);
      if ((event.key === '/' || event.key === 'F2') && !targetIsEditable) {
        event.preventDefault();
        document.getElementById('pos-product-search')?.focus();
        return;
      }
      if (
        event.key === 'Enter' &&
        (event.ctrlKey || event.metaKey) &&
        !payment &&
        workspaceReady &&
        canEdit &&
        online &&
        !saving &&
        items.length > 0
      ) {
        event.preventDefault();
        setPayment('CASH');
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [canEdit, items.length, online, payment, saving, workspaceReady]);
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
            disabled={!online || saving || !canEdit}
          >
            Bỏ nháp
          </button>
        ) : null}
      </div>
      {cartWarning ? (
        <p
          role="alert"
          className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
        >
          {cartWarning === 'INVALID_PAYLOAD'
            ? 'Không thể phục hồi giỏ cũ trên thiết bị. Dữ liệu lỗi đã được bỏ qua.'
            : 'Một số dòng trong giỏ cũ có số lượng lẻ nên đã được bỏ.'}
        </p>
      ) : null}
      {staleCartWarning ? (
        <p
          role="alert"
          className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
        >
          Giỏ lưu trên thiết bị đã cũ. Hệ thống đang dùng bản nháp mới nhất từ
          máy chủ.
        </p>
      ) : null}
      {workspaceReady && !canEdit ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p>Giỏ hàng đang được chỉnh sửa ở tab khác.</p>
          <button
            type="button"
            onClick={takeOver}
            className="min-h-11 rounded-lg border border-amber-700 px-3 font-semibold"
          >
            Tiếp tục ở tab này
          </button>
        </div>
      ) : null}
      <fieldset
        disabled={!workspaceReady || !canEdit}
        className="grid min-w-0 gap-5 disabled:opacity-75 lg:grid-cols-[1fr_420px]"
      >
        <div className="space-y-3">
          <PrefilledProductIntent
            product={focusedProduct}
            warning={focusWarning}
            disabled={!canEdit}
            onDismiss={clearFocusProduct}
            onAdd={(product) => {
              add(product);
              clearFocusProduct();
            }}
          />
          <ProductPicker
            search={search}
            resolvedSearch={debouncedSearch}
            products={catalog.data?.items ?? []}
            isLoading={catalog.isLoading}
            onSearchChange={(value) => {
              if (focusedProduct && value !== focusedProduct.sku) {
                clearFocusProduct();
              }
              setSearch(value);
            }}
            onExactLookup={async (value) =>
              (await catalogApi.list({ search: value, limit: 30 })).items
            }
            onAdd={(product) => {
              add(product);
              if (focusedProduct?.id === product.id) clearFocusProduct();
            }}
          />
        </div>
        <CartPanel
          items={items}
          channels={channels.data ?? []}
          customers={customers.data?.items ?? []}
          channelId={channelId}
          customerId={customerId}
          orderDiscount={orderDiscount}
          note={note}
          subtotal={totals.subtotal}
          discountTotal={totals.discountTotal}
          total={totals.total}
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
      </fieldset>
      {payment ? (
        <CheckoutDialog
          payment={payment}
          total={totals.total}
          saving={saving}
          onPaymentChange={setPayment}
          onCancel={() => setPayment(null)}
          onConfirm={(proofFile) => void pay(proofFile)}
        />
      ) : null}
    </main>
  );
}
