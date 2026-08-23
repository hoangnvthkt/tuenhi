import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useOnlineStatus } from '../../app/use-online-status';
import { NumericField } from '../../components/forms/NumericField';
import { useToast } from '../../components/feedback/use-toast';
import { validateCanonicalNumber } from '../../lib/numeric/canonical-number';
import { createCatalogApi } from '../catalog/catalog-api';
import { createInventoryApi, type PeriodicStockCount } from './inventory-api';
import {
  formatNumber,
  safeInventoryMessage,
  statusLabel,
} from './inventory-ui';

type CountLine = { productId: string; countedQty: string | null };

export function StockCountDetailPage({ mode }: { mode?: 'create' }) {
  const { countId } = useParams();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const toast = useToast();
  const [api] = useState(createInventoryApi);
  const [catalogApi] = useState(createCatalogApi);
  const [document, setDocument] = useState<PeriodicStockCount | null>(null);
  const [products, setProducts] = useState<
    Awaited<ReturnType<typeof catalogApi.list>>['items']
  >([]);
  const [lines, setLines] = useState<CountLine[]>([
    { productId: '', countedQty: null },
  ]);
  const [note, setNote] = useState('');
  const [estimates, setEstimates] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCreate = mode === 'create';

  useEffect(() => {
    let active = true;
    catalogApi
      .list({ limit: 100, includeInactive: true })
      .then((page) => active && setProducts(page.items))
      .catch(() => undefined);
    if (!isCreate && countId) {
      api
        .getStockCount(countId)
        .then((value) => {
          if (!active) return;
          setDocument(value);
          setNote(value.note ?? '');
          setLines(
            value.lines.map((line) => ({
              productId: line.productId,
              countedQty: line.countedQty,
            })),
          );
        })
        .catch(
          (reason: unknown) => active && setError(safeInventoryMessage(reason)),
        );
    }
    return () => {
      active = false;
    };
  }, [api, catalogApi, countId, isCreate]);

  const editable = isCreate || document?.status === 'DRAFT';
  const selectedIds = useMemo(
    () => new Set(lines.map((line) => line.productId).filter(Boolean)),
    [lines],
  );
  const productFor = (id: string) =>
    products.find((product) => product.id === id);

  async function reload() {
    if (countId) setDocument(await api.getStockCount(countId));
  }
  async function perform(
    action: () => Promise<unknown>,
    title: string,
    redirect = false,
  ) {
    if (!online || busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      toast.show({ kind: 'success', title });
      if (redirect) navigate('/stock-counts');
      else await reload();
    } catch (reason) {
      const message = safeInventoryMessage(reason);
      setError(message);
      toast.show({
        kind: 'error',
        title: 'Không thể cập nhật phiếu kiểm kho',
        message,
      });
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const valid = lines.filter((line) => line.productId);
    if (valid.length === 0 || valid.length !== selectedIds.size) {
      setError('Mỗi sản phẩm chỉ được chọn một lần.');
      return;
    }
    const invalid = valid.some(
      (line) =>
        line.countedQty !== null &&
        !validateCanonicalNumber(line.countedQty, {
          kind: 'quantity',
          precision: 18,
        }).ok,
    );
    if (invalid) {
      setError(
        'Số đếm phải là số canonical không âm, tối đa ba chữ số thập phân.',
      );
      return;
    }
    await perform(async () => {
      const result = await api.saveStockCount({
        id: document?.id,
        expectedVersion: document?.version,
        note,
        lines: valid,
        idempotencyKey: crypto.randomUUID(),
      });
      if (isCreate) navigate(`/stock-counts/${String(result.countId)}`);
    }, 'Đã lưu phiếu kiểm kho');
  }
  async function action(command: 'submit' | 'refresh' | 'cancel') {
    if (!document) return;
    if (command === 'cancel' && reason.trim().length === 0) {
      setError('Vui lòng nhập lý do hủy phiếu kiểm kho.');
      return;
    }
    await perform(
      () =>
        api.commandStockCount(
          command,
          document.id,
          document.version,
          reason.trim(),
        ),
      command === 'submit'
        ? 'Đã gửi phiếu kiểm kho'
        : command === 'refresh'
          ? 'Đã cập nhật tồn hệ thống, vui lòng đếm lại'
          : 'Đã hủy phiếu kiểm kho',
      command === 'cancel',
    );
  }
  async function post() {
    if (!document) return;
    const required = document.lines.filter(
      (line) => line.requiresEstimatedCost,
    );
    const values = required.map((line) => ({
      stockCountLineId: line.id,
      estimatedUnitCost: estimates[line.id] ?? '',
    }));
    if (
      values.some(
        (item) =>
          !validateCanonicalNumber(item.estimatedUnitCost, {
            kind: 'money',
            precision: 18,
          }).ok,
      )
    ) {
      setError(
        'Vui lòng nhập đơn giá vốn ước tính canonical cho mọi dòng tồn tăng từ 0.',
      );
      return;
    }
    if (
      !window.confirm(
        'Xác nhận ghi sổ chênh lệch kiểm kho? Thao tác này sẽ cập nhật tồn kho.',
      )
    )
      return;
    await perform(
      () => api.postStockCount(document.id, document.version, values),
      'Đã ghi sổ phiếu kiểm kho',
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div>
        <Link
          to="/stock-counts"
          className="text-sm font-semibold text-teal-800"
        >
          ← Kiểm kho
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {document?.countNumber ??
            (isCreate ? 'Tạo phiếu kiểm kho' : 'Phiếu kiểm kho')}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {document ? statusLabel[document.status] : 'Nháp mới'}
        </p>
      </div>
      {!online ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          Đang ngoại tuyến. Hệ thống khóa thao tác và không tự gửi lại.
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
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        {editable ? (
          <label className="block text-sm font-medium">
            Ghi chú
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              className="mt-2 min-h-20 w-full rounded-lg border border-slate-300 p-3"
            />
          </label>
        ) : null}
        {lines.map((line, index) => {
          const selected = productFor(line.productId);
          const detail = document?.lines.find(
            (item) => item.productId === line.productId,
          );
          return (
            <div
              key={`${line.productId}-${index}`}
              className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_190px_auto]"
            >
              {editable ? (
                <select
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
                  className="min-h-11 rounded-lg border border-slate-300 px-3"
                >
                  <option value="">Chọn sản phẩm</option>
                  {products.map((product) => (
                    <option
                      key={product.id}
                      value={product.id}
                      disabled={
                        selectedIds.has(product.id) &&
                        product.id !== line.productId
                      }
                    >
                      {product.sku} — {product.name}
                      {product.isActive ? '' : ' (ngừng kinh doanh)'}
                    </option>
                  ))}
                </select>
              ) : (
                <p>
                  <strong>{detail?.productName ?? selected?.name}</strong>
                  <span className="mt-1 block text-sm text-slate-600">
                    Tồn chụp:{' '}
                    {detail ? formatNumber(detail.systemQtySnapshot) : '—'} ·
                    Chênh lệch:{' '}
                    {detail?.differenceQty === null
                      ? '—'
                      : formatNumber(detail?.differenceQty ?? '0')}
                  </span>
                </p>
              )}
              {editable ? (
                <NumericField
                  label="Số đếm thực tế"
                  kind="quantity"
                  precision={18}
                  value={line.countedQty ?? ''}
                  onChange={(value) =>
                    setLines((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, countedQty: value }
                          : item,
                      ),
                    )
                  }
                  disabled={!online || busy}
                  helperText="Có thể để trống khi chưa đếm"
                />
              ) : (
                <p className="text-sm">
                  Đếm:{' '}
                  {detail?.countedQty === null
                    ? 'Chưa nhập'
                    : formatNumber(detail?.countedQty ?? '0')}
                </p>
              )}
              {editable ? (
                <button
                  type="button"
                  onClick={() =>
                    setLines((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm"
                  disabled={lines.length === 1}
                >
                  Bỏ
                </button>
              ) : null}
            </div>
          );
        })}
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { productId: '', countedQty: null },
                ])
              }
              className="min-h-11 rounded-lg border border-slate-300 px-4 font-semibold"
            >
              Thêm sản phẩm
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!online || busy}
              className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
            >
              Lưu phiếu
            </button>
          </div>
        ) : null}
      </section>
      {document?.status === 'DRAFT' ? (
        <button
          type="button"
          disabled={!online || busy}
          onClick={() => void action('submit')}
          className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
        >
          Gửi phiếu để ghi sổ
        </button>
      ) : null}
      {document?.status === 'COUNTED' ? (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          {document.canPost ? (
            <>
              {document.lines
                .filter((line) => line.requiresEstimatedCost)
                .map((line) => (
                  <NumericField
                    key={line.id}
                    label={`Đơn giá vốn ước tính: ${line.productName}`}
                    kind="money"
                    precision={18}
                    value={estimates[line.id] ?? ''}
                    onChange={(value) =>
                      setEstimates((current) => ({
                        ...current,
                        [line.id]: value,
                      }))
                    }
                    disabled={!online || busy}
                  />
                ))}
              <button
                type="button"
                disabled={!online || busy}
                onClick={() => void post()}
                className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
              >
                Ghi sổ chênh lệch
              </button>
            </>
          ) : null}
          <button
            type="button"
            disabled={!online || busy}
            onClick={() => void action('refresh')}
            className="min-h-11 rounded-lg border border-amber-700 px-4 font-semibold text-amber-900 disabled:opacity-50"
          >
            Cập nhật tồn & đếm lại
          </button>
        </section>
      ) : null}
      {document && ['DRAFT', 'COUNTED'].includes(document.status) ? (
        <section className="space-y-2">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Lý do hủy phiếu"
            maxLength={500}
            className="min-h-20 w-full rounded-lg border border-slate-300 p-3"
          />
          <button
            type="button"
            disabled={!online || busy || reason.trim().length === 0}
            onClick={() => void action('cancel')}
            className="min-h-11 rounded-lg border border-red-700 px-4 font-semibold text-red-800 disabled:opacity-50"
          >
            Hủy phiếu kiểm kho
          </button>
        </section>
      ) : null}
    </main>
  );
}
