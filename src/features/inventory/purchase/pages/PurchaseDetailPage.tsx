/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import {
  FinancialOutcomeUnknownError,
  getFinancialCorrelationId,
} from '@/shared/api/financial-command';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { createCatalogApi } from '@/features/catalog';
import { createDirectoryApi } from '@/features/directories';
import {
  createConnectedExplorerApi,
  type ConnectedExplorerApi,
} from '@/features/connected-explorer';
import { useSession } from '@/features/auth';
import { createPurchaseApi } from '../api/purchase-api';
import type {
  PurchaseReceipt,
  PurchaseReceiptCost,
} from '../api/purchase-schemas';
import { PurchaseActions } from '../components/PurchaseActions';
import { PurchaseLineEditor } from '../components/PurchaseLineEditor';
import { PurchasePrefillIntent } from '../components/PurchasePrefillIntent';
import { PurchaseSupplierPicker } from '../components/PurchaseSupplierPicker';
import type { PurchaseDraftLine } from '../model/purchase-draft';
import { toLocalDateTime } from '../model/local-datetime';
import { validatePurchaseDraftLines } from '../model/purchase-draft-validation';
import {
  formatMoney,
  safeInventoryMessage,
  statusLabel,
} from '../../model/inventory-ui';

export function PurchaseDetailPage({
  mode,
  api: apiProp,
  catalogApi: catalogApiProp,
  directoryApi: directoryApiProp,
  explorerApi: explorerApiProp,
  online: onlineProp,
}: {
  mode?: 'create';
  api?: ReturnType<typeof createPurchaseApi>;
  catalogApi?: ReturnType<typeof createCatalogApi>;
  directoryApi?: ReturnType<typeof createDirectoryApi>;
  explorerApi?: ConnectedExplorerApi;
  online?: boolean;
}) {
  const { receiptId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const detectedOnline = useOnlineStatus();
  const online = onlineProp ?? detectedOnline;
  const toast = useToast();
  const { session } = useSession();
  const [api] = useState(() => apiProp ?? createPurchaseApi());
  const [catalogApi] = useState(() => catalogApiProp ?? createCatalogApi());
  const [directoryApi] = useState(
    () => directoryApiProp ?? createDirectoryApi(),
  );
  const [explorerApi] = useState(
    () => explorerApiProp ?? createConnectedExplorerApi(),
  );
  const [receipt, setReceipt] = useState<PurchaseReceipt | null>(null);
  const [products, setProducts] = useState<
    Awaited<ReturnType<typeof catalogApi.list>>['items']
  >([]);
  const [suppliers, setSuppliers] = useState<
    Awaited<ReturnType<typeof directoryApi.listSuppliers>>['items']
  >([]);
  const [supplierId, setSupplierId] = useState('');
  const [receivedAt, setReceivedAt] = useState(toLocalDateTime(new Date()));
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<PurchaseDraftLine[]>([
    { productId: '', receivedQty: '1', unitCost: '' },
  ]);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [totalCost, setTotalCost] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(mode !== 'create');
  const [loadFailed, setLoadFailed] = useState(false);
  const [supplierEditing, setSupplierEditing] = useState(false);
  const [reload, setReload] = useState(0);
  const [savedDraft, setSavedDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefillWarning, setPrefillWarning] = useState<string | null>(null);
  const prefillHandledRef = useRef<string | null>(null);
  const supplierTouchedRef = useRef(false);
  const linesTouchedRef = useRef(false);
  const isCreate = mode === 'create';
  const canDraft = session?.permissions.includes('purchase.draft.manage');
  const canPost = session?.permissions.includes('purchase.post');
  const canReadCost = session?.permissions.includes('purchase.cost.read');
  const canEnterCost = session?.permissions.includes('purchase.cost.enter');
  const canViewProduct = session?.permissions.includes('catalog.read') ?? false;
  const canViewSupplier = Boolean(
    session?.permissions.some((permission) =>
      ['supplier.read', 'supplier.manage'].includes(permission),
    ),
  );
  const canManageSupplier =
    session?.permissions.includes('supplier.manage') ?? false;

  const loadSnapshot = useCallback(
    async (id: string) => {
      const data = await api.detail(id);
      const cost =
        canReadCost ||
        (data.status === 'DRAFT' &&
          data.createdBy === session?.userId &&
          canDraft &&
          canEnterCost)
          ? await api.cost(id)
          : null;
      return { data, cost };
    },
    [api, canReadCost, canDraft, canEnterCost, session?.userId],
  );

  const hydrate = useCallback(
    ({
      data,
      cost,
    }: {
      data: PurchaseReceipt;
      cost: PurchaseReceiptCost | null;
    }) => {
      const nextCosts = Object.fromEntries(
        cost?.lines.map((line) => [line.lineId, line.unitCost ?? '']) ?? [],
      );
      const nextLines = data.lines.map((line) => ({
        productId: line.productId,
        receivedQty: line.receivedQty,
        unitCost: nextCosts[line.id] ?? '',
      }));
      const nextSupplierId = data.supplierId ?? '';
      const nextReceivedAt = toLocalDateTime(data.receivedAt);
      const nextNote = data.note ?? '';
      setReceipt(data);
      setSupplierId(nextSupplierId);
      setReceivedAt(nextReceivedAt);
      setNote(nextNote);
      setLines(nextLines);
      setCosts(nextCosts);
      setTotalCost(cost?.totalCost ?? null);
      setSavedDraft(
        JSON.stringify([nextSupplierId, nextReceivedAt, nextNote, nextLines]),
      );
    },
    [],
  );

  useEffect(() => {
    let active = true;
    catalogApi
      .list({ limit: 100 })
      .then(
        (page) =>
          active &&
          setProducts((current) => [
            ...current,
            ...page.items.filter(
              (item) => !current.some((existing) => existing.id === item.id),
            ),
          ]),
      )
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [catalogApi]);

  useEffect(() => {
    let active = true;
    if (isCreate) {
      const replacement = location.state?.purchaseReplacement as
        | {
            supplierId: string;
            receivedAt: string;
            note: string;
            lines: PurchaseDraftLine[];
          }
        | undefined;
      setReceipt(null);
      setSupplierId(replacement?.supplierId ?? '');
      setReceivedAt(replacement?.receivedAt ?? toLocalDateTime(new Date()));
      setNote(replacement?.note ?? '');
      setLines(
        replacement?.lines ?? [
          { productId: '', receivedQty: '1', unitCost: '' },
        ],
      );
      setCosts({});
      setTotalCost(null);
      setLoading(false);
      setLoadFailed(false);
      setSavedDraft(null);
      return;
    }
    if (!receiptId) return;
    setLoading(true);
    setLoadFailed(false);
    void loadSnapshot(receiptId)
      .then((snapshot) => {
        if (active) hydrate(snapshot);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setLoadFailed(true);
        setError(safeInventoryMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isCreate, receiptId, loadSnapshot, hydrate, reload, location.state]);

  useEffect(() => {
    if (!isCreate) return;
    const productId = searchParams.get('productId');
    const requestedSupplierId = searchParams.get('supplierId');
    const intentKey = `${productId ?? ''}:${requestedSupplierId ?? ''}`;
    if (prefillHandledRef.current === intentKey || intentKey === ':') return;
    prefillHandledRef.current = intentKey;
    let active = true;
    const validUuid = (value: string | null) =>
      Boolean(
        value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        ),
      );
    const tasks: Promise<void>[] = [];
    const warnings: string[] = [];
    if (productId) {
      if (!validUuid(productId) || !canViewProduct) {
        warnings.push(
          'Sản phẩm trong liên kết không hợp lệ hoặc không được phép xem.',
        );
      } else {
        tasks.push(
          catalogApi
            .detail(productId)
            .then((product) => {
              if (!active) return;
              if (!product.isActive) {
                warnings.push('Sản phẩm trong liên kết đã ngừng hoạt động.');
                return;
              }
              setProducts((current) =>
                current.some((item) => item.id === product.id)
                  ? current
                  : [...current, product],
              );
              if (!linesTouchedRef.current) {
                setLines((current) => {
                  const first = current[0];
                  if (!first || first.productId) return current;
                  return [
                    { ...first, productId: product.id },
                    ...current.slice(1),
                  ];
                });
              }
            })
            .catch(() => {
              warnings.push('Không thể mở sản phẩm từ liên kết.');
            }),
        );
      }
    }
    if (requestedSupplierId) {
      if (!validUuid(requestedSupplierId) || !canViewSupplier) {
        warnings.push(
          'Nhà cung cấp trong liên kết không hợp lệ hoặc không được phép xem.',
        );
      } else {
        tasks.push(
          explorerApi
            .supplierDetail(requestedSupplierId)
            .then((supplier) => {
              if (!active) return;
              if (!supplier.isActive) {
                warnings.push(
                  'Nhà cung cấp trong liên kết đã ngừng hoạt động.',
                );
                return;
              }
              setSuppliers((current) =>
                current.some((item) => item.id === supplier.id)
                  ? current
                  : [
                      ...current,
                      {
                        id: supplier.id,
                        code: supplier.code,
                        name: supplier.name,
                        phone: supplier.phone,
                        email: supplier.email,
                        address: supplier.address,
                        notes: supplier.notes,
                        isActive: supplier.isActive,
                        version: supplier.version,
                      },
                    ],
              );
              if (!supplierTouchedRef.current) setSupplierId(supplier.id);
            })
            .catch(() => {
              warnings.push('Không thể mở Nhà cung cấp từ liên kết.');
            }),
        );
      }
    }
    void Promise.all(tasks).then(() => {
      if (active && warnings.length) setPrefillWarning(warnings.join(' '));
    });
    return () => {
      active = false;
    };
  }, [
    canViewProduct,
    canViewSupplier,
    catalogApi,
    explorerApi,
    isCreate,
    searchParams,
  ]);

  const lineProductIds = useMemo(
    () => new Set(lines.map((line) => line.productId).filter(Boolean)),
    [lines],
  );
  const setLinesFromUser: typeof setLines = (action) => {
    linesTouchedRef.current = true;
    setLines(action);
  };
  async function perform(
    action: () => Promise<unknown>,
    success: string,
    redirect = false,
  ) {
    if (!online || busy || loading || loadFailed || supplierEditing) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await refreshOperationalData(queryClient);
      if (redirect) navigate('/more/purchases');
      else if (receiptId) {
        try {
          hydrate(await loadSnapshot(receiptId));
        } catch (reason) {
          setLoadFailed(true);
          throw reason;
        }
      }
      toast.show({ kind: 'success', title: success, message: success });
    } catch (reason) {
      const message = safeInventoryMessage(reason);
      setError(message);
      toast.show({
        kind: 'error',
        title: 'Không thể cập nhật phiếu nhập',
        message,
        requestId:
          reason instanceof FinancialOutcomeUnknownError
            ? reason.requestId
            : undefined,
        correlationId: getFinancialCorrelationId(reason),
      });
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!online || busy || loading || loadFailed || supplierEditing) return;
    const validated = validatePurchaseDraftLines(lines);
    if (!validated.ok) {
      setError(
        'Mỗi sản phẩm chỉ được chọn một lần, có số lượng và đơn giá nhập lớn hơn 0.',
      );
      return;
    }
    await perform(async () => {
      const result = await api.save({
        id: receipt?.id,
        expectedVersion: receipt?.version,
        supplierId: supplierId || undefined,
        receivedAt: new Date(receivedAt).toISOString(),
        note,
        lines: validated.lines,
        idempotencyKey: crypto.randomUUID(),
      });
      const id = String(result.receiptId);
      if (isCreate) navigate(`/more/purchases/${id}`);
    }, 'Đã lưu phiếu nhập');
  }
  const editable =
    Boolean(canDraft) && (isCreate || !receipt || receipt.status === 'DRAFT');
  const locked = busy || loading || loadFailed;
  const dirty =
    receipt?.status === 'DRAFT' &&
    savedDraft !== JSON.stringify([supplierId, receivedAt, note, lines]);
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            className="text-sm font-semibold text-teal-800"
            to="/more/purchases"
          >
            ← Phiếu nhập
          </Link>
          <h1 className="mt-2 text-2xl font-bold">
            {receipt?.receiptNumber ??
              (isCreate ? 'Lập phiếu nhập' : 'Phiếu nhập')}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {receipt ? statusLabel[receipt.status] : 'Nháp mới'}
          </p>
        </div>
        {totalCost !== null && receipt?.status === 'POSTED' ? (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 font-bold text-emerald-900">
            Tổng giá nhập: {formatMoney(totalCost)}
          </p>
        ) : null}
      </div>
      {!online ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
        >
          Đang ngoại tuyến. Các lệnh lưu, gửi, ghi sổ và đảo phiếu đã bị khóa;
          hệ thống không tự gửi lại.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      <PurchasePrefillIntent warning={prefillWarning} />
      {loading ? (
        <p role="status" className="text-sm text-slate-600">
          Đang tải phiếu nhập và giá nhập…
        </p>
      ) : null}
      {loadFailed ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setReload((value) => value + 1);
          }}
          className="min-h-11 font-semibold text-teal-800"
        >
          Tải lại phiếu nhập
        </button>
      ) : null}
      <fieldset disabled={locked} className="min-w-0 space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <PurchaseSupplierPicker
              api={directoryApi}
              explorerApi={explorerApi}
              supplierId={supplierId}
              supplierName={receipt?.supplierName}
              seeds={suppliers}
              editable={editable && !locked}
              canRead={canViewSupplier}
              canManage={canManageSupplier}
              online={online}
              onEditingChange={setSupplierEditing}
              onChange={(id) => {
                supplierTouchedRef.current = true;
                setSupplierId(id);
              }}
            />
            <label className="text-sm font-semibold">
              Ngày nhận
              <input
                disabled={!editable}
                type="datetime-local"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
              />
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold">
            Ghi chú
            <textarea
              disabled={!editable}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 p-3"
            />
          </label>
        </div>
        <PurchaseLineEditor
          lines={lines}
          products={products}
          receipt={receipt}
          costs={costs}
          editable={editable}
          canPost={Boolean(canPost)}
          canEnterCost={Boolean(canEnterCost)}
          lineProductIds={lineProductIds}
          setLines={setLinesFromUser}
          setCosts={setCosts}
          canViewProduct={canViewProduct}
          resolveProducts={api.resolveProductsBySku}
        />
      </fieldset>
      {dirty ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
        >
          Lưu nháp các thay đổi trước khi ghi sổ.
        </p>
      ) : null}
      <PurchaseActions
        api={api}
        receipt={receipt}
        costs={costs}
        editable={editable}
        canDraft={Boolean(canDraft)}
        canPost={Boolean(canPost)}
        online={online}
        busy={locked || supplierEditing}
        dirty={dirty}
        onSave={save}
        onPerform={perform}
        userId={session?.userId}
      />
      {receipt?.status === 'REVERSED' && canDraft ? (
        <button
          type="button"
          disabled={locked || !online}
          onClick={() =>
            navigate('/more/purchases/new', {
              state: {
                purchaseReplacement: {
                  supplierId,
                  receivedAt: toLocalDateTime(new Date()),
                  note: `Thay thế phiếu ${receipt.receiptNumber ?? receipt.id}${note ? ` — ${note}` : ''}`,
                  lines: lines.map((line) => ({ ...line })),
                },
              },
            })
          }
          className="min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Lập phiếu thay thế
        </button>
      ) : null}
    </section>
  );
}
