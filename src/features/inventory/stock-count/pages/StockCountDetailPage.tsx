import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { validateCanonicalNumber } from '@/shared/lib/numeric/canonical-number';
import { createCatalogApi } from '@/features/catalog';
import { createStockCountApi } from '../api/stock-count-api';
import type { PeriodicStockCount } from '../api/stock-count-schemas';
import { StockCountActions } from '../components/StockCountActions';
import { StockCountEditor } from '../components/StockCountEditor';
import type { StockCountDraftLine } from '../model/stock-count-draft';
import { safeInventoryMessage, statusLabel } from '../../model/inventory-ui';

export function StockCountDetailPage({ mode }: { mode?: 'create' }) {
  const { countId } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const toast = useToast();
  const [api] = useState(createStockCountApi);
  const [catalogApi] = useState(createCatalogApi);
  const [document, setDocument] = useState<PeriodicStockCount | null>(null);
  const [products, setProducts] = useState<
    Awaited<ReturnType<typeof catalogApi.list>>['items']
  >([]);
  const [lines, setLines] = useState<StockCountDraftLine[]>([
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
        .detail(countId)
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

  async function reload() {
    if (countId) setDocument(await api.detail(countId));
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
      await refreshOperationalData(queryClient);
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
      setError('Số đếm phải là số nguyên canonical không âm.');
      return;
    }
    await perform(async () => {
      const result = await api.save({
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
      () => api.command(command, document.id, document.version, reason.trim()),
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
      () => api.post(document.id, document.version, values),
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
      <StockCountEditor
        document={document}
        editable={editable}
        lines={lines}
        products={products}
        selectedIds={selectedIds}
        note={note}
        online={online}
        busy={busy}
        setNote={setNote}
        setLines={setLines}
        onSave={save}
      />
      <StockCountActions
        document={document}
        estimates={estimates}
        reason={reason}
        online={online}
        busy={busy}
        setEstimates={setEstimates}
        setReason={setReason}
        onAction={action}
        onPost={post}
      />
    </main>
  );
}
