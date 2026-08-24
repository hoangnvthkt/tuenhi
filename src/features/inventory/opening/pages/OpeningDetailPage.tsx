import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { createCatalogApi } from '@/features/catalog';
import { createOpeningApi } from '../api/opening-api';
import type {
  OpeningDocument,
  OpeningSuggestion,
} from '../api/opening-schemas';
import { OpeningActions } from '../components/OpeningActions';
import { OpeningEditor } from '../components/OpeningEditor';
import type { OpeningDraftLine } from '../model/opening-draft';
import {
  formatMoney,
  safeInventoryMessage,
  statusLabel,
} from '../../model/inventory-ui';

export function OpeningDetailPage({ mode }: { mode?: 'create' }) {
  const { countId } = useParams();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const toast = useToast();
  const [api] = useState(createOpeningApi);
  const [catalogApi] = useState(createCatalogApi);
  const [document, setDocument] = useState<OpeningDocument | null>(null);
  const [products, setProducts] = useState<
    Awaited<ReturnType<typeof catalogApi.list>>['items']
  >([]);
  const [suggestions, setSuggestions] = useState<OpeningSuggestion[]>([]);
  const [lines, setLines] = useState<OpeningDraftLine[]>([
    {
      productId: '',
      countedQty: '1',
      openingUnitCost: '0',
      sourceSuggestionId: null,
      confirmedUnverified: false,
    },
  ]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCreate = mode === 'create';
  useEffect(() => {
    let active = true;
    catalogApi
      .list({ limit: 100 })
      .then((page) => active && setProducts(page.items))
      .catch(() => undefined);
    api
      .suggestions()
      .then((page) => active && setSuggestions(page.items))
      .catch(() => undefined);
    if (!isCreate && countId)
      api
        .detail(countId)
        .then((data) => {
          if (!active) return;
          setDocument(data);
          setNote(data.note ?? '');
          setLines(
            data.lines.map((line) => ({
              productId: line.productId,
              countedQty: line.countedQty,
              openingUnitCost: line.openingUnitCost,
              sourceSuggestionId: line.sourceSuggestionId,
              confirmedUnverified: line.unverifiedSourceConfirmed,
            })),
          );
        })
        .catch(
          (reason: unknown) => active && setError(safeInventoryMessage(reason)),
        );
    return () => {
      active = false;
    };
  }, [api, catalogApi, countId, isCreate]);
  const selectedIds = useMemo(
    () => new Set(lines.map((line) => line.productId).filter(Boolean)),
    [lines],
  );
  const editable = isCreate || document?.status === 'DRAFT';
  function applySuggestion(suggestion: OpeningSuggestion) {
    const line = {
      productId: suggestion.productId,
      countedQty: suggestion.suggestedOpeningQuantity ?? '',
      openingUnitCost: suggestion.suggestedUnitCost ?? '',
      sourceSuggestionId: suggestion.id,
      confirmedUnverified: true,
    };
    setLines((current) =>
      current.length === 1 && !current[0]?.productId
        ? [line]
        : selectedIds.has(line.productId)
          ? current.map((item) =>
              item.productId === line.productId ? line : item,
            )
          : [...current, line],
    );
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
      toast.show({ kind: 'success', title, message: title });
      if (redirect) navigate('/more/inventory/opening');
      else if (countId) setDocument(await api.detail(countId));
    } catch (reason) {
      const message = safeInventoryMessage(reason);
      setError(message);
      toast.show({
        kind: 'error',
        title: 'Không thể cập nhật phiếu mở sổ',
        message,
      });
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const valid = lines.filter(
      (line) =>
        line.productId &&
        Number(line.countedQty) > 0 &&
        line.openingUnitCost !== '',
    );
    if (valid.length === 0 || valid.length !== selectedIds.size) {
      setError(
        'Mỗi sản phẩm chỉ xuất hiện một lần, số lượng phải lớn hơn 0 và phải có đơn giá vốn.',
      );
      return;
    }
    await perform(async () => {
      const result = await api.save({
        id: document?.id,
        expectedVersion: document?.version,
        note,
        lines: valid,
      });
      if (isCreate)
        navigate(`/more/inventory/opening/${String(result.countId)}`);
    }, 'Đã lưu phiếu mở sổ');
  }
  const groupedSuggestions = useMemo(() => {
    const groups = new Map<string, OpeningSuggestion[]>();
    for (const suggestion of suggestions) {
      groups.set(suggestion.productId, [
        ...(groups.get(suggestion.productId) ?? []),
        suggestion,
      ]);
    }
    return [...groups.values()];
  }, [suggestions]);
  return (
    <section className="space-y-5">
      <div>
        <Link
          to="/more/inventory/opening"
          className="text-sm font-semibold text-teal-800"
        >
          ← Mở sổ tồn đầu kỳ
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {document?.countNumber ??
            (isCreate ? 'Tạo phiếu mở sổ' : 'Phiếu mở sổ')}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {document ? statusLabel[document.status] : 'Nháp mới'}
          {document
            ? ` · Tổng giá trị ${formatMoney(document.totalValue)}`
            : ''}
        </p>
      </div>
      {!online ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
        >
          Đang ngoại tuyến. Hệ thống khóa thao tác và không tự gửi lại sau khi
          kết nối.
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
      <OpeningEditor
        editable={editable}
        groupedSuggestions={groupedSuggestions}
        note={note}
        lines={lines}
        products={products}
        selectedIds={selectedIds}
        onApplySuggestion={applySuggestion}
        setNote={setNote}
        setLines={setLines}
      />
      <OpeningActions
        api={api}
        document={document}
        editable={editable}
        online={online}
        busy={busy}
        onSave={save}
        onPerform={perform}
      />
    </section>
  );
}
