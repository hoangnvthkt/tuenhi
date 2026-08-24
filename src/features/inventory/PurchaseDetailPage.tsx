import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { NumericField } from '@/shared/ui/forms/NumericField';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { createCatalogApi } from '../catalog/catalog-api';
import { createDirectoryApi } from '../directories/directory-api';
import { useSession } from '../auth/use-session';
import { createInventoryApi, type PurchaseReceipt } from './inventory-api';
import { formatMoney, safeInventoryMessage, statusLabel } from './inventory-ui';

type DraftLine = { productId: string; receivedQty: string };

export function PurchaseDetailPage({
  mode,
  api: apiProp,
  catalogApi: catalogApiProp,
  directoryApi: directoryApiProp,
  online: onlineProp,
}: {
  mode?: 'create';
  api?: ReturnType<typeof createInventoryApi>;
  catalogApi?: ReturnType<typeof createCatalogApi>;
  directoryApi?: ReturnType<typeof createDirectoryApi>;
  online?: boolean;
}) {
  const { receiptId } = useParams();
  const navigate = useNavigate();
  const detectedOnline = useOnlineStatus();
  const online = onlineProp ?? detectedOnline;
  const toast = useToast();
  const { session } = useSession();
  const [api] = useState(() => apiProp ?? createInventoryApi());
  const [catalogApi] = useState(() => catalogApiProp ?? createCatalogApi());
  const [directoryApi] = useState(
    () => directoryApiProp ?? createDirectoryApi(),
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
  const [lines, setLines] = useState<DraftLine[]>([
    { productId: '', receivedQty: '1' },
  ]);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [totalCost, setTotalCost] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCreate = mode === 'create';
  const canDraft = session?.permissions.includes('purchase.draft.manage');
  const canPost = session?.permissions.includes('purchase.post');
  const canReadCost = session?.permissions.includes('purchase.cost.read');

  useEffect(() => {
    let active = true;
    catalogApi
      .list({ limit: 100 })
      .then((page) => active && setProducts(page.items))
      .catch(() => undefined);
    directoryApi
      .listSuppliers({ limit: 100 })
      .then((page) => active && setSuppliers(page.items))
      .catch(() => undefined);
    if (!isCreate && receiptId) {
      api
        .getPurchase(receiptId)
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
            })),
          );
        })
        .catch(
          (reason: unknown) => active && setError(safeInventoryMessage(reason)),
        );
      if (canReadCost) {
        api
          .getPurchaseCost(receiptId)
          .then((detail) => {
            if (!active) return;
            const serverCosts = Object.fromEntries(
              detail.lines.map((line) => [line.lineId, line.unitCost ?? '']),
            );
            setCosts((current) => ({ ...serverCosts, ...current }));
            setTotalCost(detail.totalCost);
          })
          .catch(() => undefined);
      }
    }
    return () => {
      active = false;
    };
  }, [api, canReadCost, catalogApi, directoryApi, isCreate, receiptId]);

  const lineProductIds = useMemo(
    () => new Set(lines.map((line) => line.productId).filter(Boolean)),
    [lines],
  );
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
      toast.show({ kind: 'success', title: success, message: success });
      if (redirect) navigate('/more/purchases');
      else if (receiptId) setReceipt(await api.getPurchase(receiptId));
    } catch (reason) {
      const message = safeInventoryMessage(reason);
      setError(message);
      toast.show({
        kind: 'error',
        title: 'Không thể cập nhật phiếu nhập',
        message,
      });
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const validLines = lines.filter(
      (line) => line.productId && Number(line.receivedQty) > 0,
    );
    if (validLines.length === 0 || validLines.length !== lineProductIds.size) {
      setError(
        'Mỗi sản phẩm chỉ được chọn một lần và phải có số lượng lớn hơn 0.',
      );
      return;
    }
    await perform(async () => {
      const result = await api.savePurchase({
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
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Nhà cung cấp
            <select
              disabled={!editable}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
            >
              <option value="">Không chọn</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
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
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold">Sản phẩm nhận</h2>
        {lines.map((line, index) => {
          const persistedLine = receipt?.lines[index];
          return (
            <div
              key={`${index}-${persistedLine?.id ?? 'new'}`}
              className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_11rem_11rem_auto]"
            >
              <select
                aria-label={`Sản phẩm dòng ${index + 1}`}
                disabled={!editable}
                value={line.productId}
                onChange={(e) =>
                  setLines((current) =>
                    current.map((item, i) =>
                      i === index
                        ? { ...item, productId: e.target.value }
                        : item,
                    ),
                  )
                }
                className="min-h-11 rounded-lg border border-slate-300 px-3"
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
              <NumericField
                label="Số lượng nhận"
                disabled={!editable}
                kind="quantity"
                precision={18}
                positive
                value={line.receivedQty}
                onChange={(value) =>
                  setLines((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, receivedQty: value } : item,
                    ),
                  )
                }
              />
              {canPost &&
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
                    setLines((current) => current.filter((_, i) => i !== index))
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
      <div className="sticky bottom-20 z-20 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg lg:static lg:border-0 lg:bg-slate-50 lg:p-0 lg:py-2 lg:shadow-none">
        {editable && canDraft ? (
          <button
            disabled={!online || busy}
            onClick={() => void save()}
            className="min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Lưu nháp
          </button>
        ) : null}
        {receipt?.status === 'DRAFT' && canDraft ? (
          <button
            disabled={!online || busy}
            onClick={() =>
              void perform(
                () =>
                  api.commandPurchase('submit', receipt.id, receipt.version),
                'Đã gửi phiếu chờ nhập giá',
              )
            }
            className="min-h-11 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Gửi owner nhập giá
          </button>
        ) : null}
        {receipt?.status === 'AWAITING_COST' && canPost ? (
          <button
            disabled={
              !online || busy || receipt.lines.some((line) => !costs[line.id])
            }
            onClick={() =>
              void perform(
                () =>
                  api.postPurchase(
                    receipt.id,
                    receipt.version,
                    receipt.lines.map((line) => ({
                      lineId: line.id,
                      unitCost: costs[line.id] ?? '',
                    })),
                  ),
                'Đã ghi sổ phiếu nhập',
              )
            }
            className="min-h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Ghi sổ
          </button>
        ) : null}
        {receipt?.status === 'POSTED' && canPost ? (
          <button
            disabled={!online || busy}
            onClick={() =>
              void perform(
                () =>
                  api.commandPurchase(
                    'reverse',
                    receipt.id,
                    receipt.version,
                    'Owner đảo phiếu',
                  ),
                'Đã đảo phiếu nhập',
              )
            }
            className="min-h-11 rounded-lg border border-red-300 px-5 text-sm font-semibold text-red-800 disabled:opacity-50"
          >
            Đảo phiếu
          </button>
        ) : null}
        {receipt &&
        ['DRAFT', 'AWAITING_COST'].includes(receipt.status) &&
        canDraft ? (
          <button
            disabled={!online || busy}
            onClick={() =>
              void perform(
                () =>
                  api.commandPurchase(
                    'cancel',
                    receipt.id,
                    receipt.version,
                    'Người dùng hủy phiếu',
                  ),
                'Đã hủy phiếu nhập',
                true,
              )
            }
            className="min-h-11 px-5 text-sm font-semibold text-red-700 disabled:opacity-50"
          >
            Hủy phiếu
          </button>
        ) : null}
      </div>
    </section>
  );
}
