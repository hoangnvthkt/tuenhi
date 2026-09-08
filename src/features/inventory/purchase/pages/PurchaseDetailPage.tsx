import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
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
import { validateCanonicalNumber } from '@/shared/lib/numeric/canonical-number';
import { createPurchaseApi } from '../api/purchase-api';
import type { PurchaseReceipt } from '../api/purchase-schemas';
import { PurchaseActions } from '../components/PurchaseActions';
import { PurchaseLineEditor } from '../components/PurchaseLineEditor';
import { PurchasePrefillIntent } from '../components/PurchasePrefillIntent';
import type { PurchaseDraftLine } from '../model/purchase-draft';
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
  const [receivedAt, setReceivedAt] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<PurchaseDraftLine[]>([
    { productId: '', receivedQty: '1', unitCost: '' },
  ]);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [totalCost, setTotalCost] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    directoryApi
      .listSuppliers({ limit: 100 })
      .then(
        (page) =>
          active &&
          setSuppliers((current) => [
            ...current,
            ...page.items.filter(
              (item) => !current.some((existing) => existing.id === item.id),
            ),
          ]),
      )
      .catch(() => undefined);
    if (!isCreate && receiptId) {
      api
        .detail(receiptId)
        .then((data) => {
          if (!active) return;
          setReceipt(data);
          setSupplierId(data.supplierId ?? '');
          setReceivedAt(data.receivedAt.slice(0, 16));
          setNote(data.note ?? '');
          setLines(
            data.lines.map((line) => ({
              productId: line.productId,
              receivedQty: line.receivedQty,
              unitCost: '',
            })),
          );
          if (
            canReadCost ||
            (data.createdBy === session?.userId && canDraft && canEnterCost)
          ) {
            api
              .cost(receiptId)
              .then((detail) => {
                if (!active) return;
                const draftCosts = new Map(
                  detail.lines.map((line) => [line.lineId, line.unitCost ?? '']),
                );
                setLines((current) =>
                  current.map((line, index) => ({
                    ...line,
                    unitCost: draftCosts.get(data.lines[index]?.id ?? '') ?? '',
                  })),
                );
                setCosts(
                  Object.fromEntries(
                    detail.lines.map((line) => [line.lineId, line.unitCost ?? '']),
                  ),
                );
                setTotalCost(detail.totalCost);
              })
              .catch(() => undefined);
          }
        })
        .catch(
          (reason: unknown) => active && setError(safeInventoryMessage(reason)),
        );
    }
    return () => {
      active = false;
    };
  }, [api, canDraft, canEnterCost, canReadCost, catalogApi, directoryApi, isCreate, receiptId, session?.userId]);

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
    if (!online || busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await refreshOperationalData(queryClient);
      toast.show({ kind: 'success', title: success, message: success });
      if (redirect) navigate('/more/purchases');
      else if (receiptId) setReceipt(await api.detail(receiptId));
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
    const validLines = lines.filter(
      (line) =>
        line.productId &&
        validateCanonicalNumber(line.receivedQty, {
          kind: 'quantity',
          precision: 18,
          positive: true,
        }).ok &&
        validateCanonicalNumber(line.unitCost, {
          kind: 'money',
          precision: 20,
          positive: true,
        }).ok,
    );
    if (validLines.length === 0 || validLines.length !== lineProductIds.size) {
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
        lines: validLines,
        idempotencyKey: crypto.randomUUID(),
      });
      const id = String(result.receiptId);
      if (isCreate) navigate(`/more/purchases/${id}`);
    }, 'Đã lưu phiếu nhập');
  }
  const editable = isCreate || receipt?.status === 'DRAFT';
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
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Nhà cung cấp
            <select
              aria-label="Nhà cung cấp"
              disabled={!editable}
              value={supplierId}
              onChange={(e) => {
                supplierTouchedRef.current = true;
                setSupplierId(e.target.value);
              }}
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
            >
              <option value="">Không chọn</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            {canViewSupplier && supplierId ? (
              <Link
                to={`/more/suppliers/${supplierId}`}
                className="mt-2 inline-block text-xs font-semibold text-teal-800 hover:underline"
              >
                Mở chi tiết Nhà cung cấp
              </Link>
            ) : null}
          </label>
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
      />
      <PurchaseActions
        api={api}
        receipt={receipt}
        costs={costs}
        editable={editable}
        canDraft={Boolean(canDraft)}
        canPost={Boolean(canPost)}
        online={online}
        busy={busy}
        onSave={save}
        onPerform={perform}
        userId={session?.userId}
      />
    </section>
  );
}
