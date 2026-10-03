import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import {
  FinancialOutcomeUnknownError,
  getFinancialCorrelationId,
} from '@/shared/api/financial-command';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { validateCanonicalNumber } from '@/shared/lib/numeric/canonical-number';
import { createCatalogApi } from '@/features/catalog';
import { useSession } from '@/features/auth';
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const toast = useToast();
  const { session } = useSession();
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
  const documentGeneration = useRef(0);
  const hydrate = useCallback((value: OpeningDocument) => {
    setDocument(value);
    setNote(value.note ?? '');
    setLines(
      value.lines.map((line) => ({
        productId: line.productId,
        countedQty: line.countedQty,
        openingUnitCost: line.openingUnitCost,
        sourceSuggestionId: line.sourceSuggestionId,
        confirmedUnverified: line.unverifiedSourceConfirmed,
      })),
    );
  }, []);
  const hasUnsavedChanges =
    document !== null &&
    (note !== (document.note ?? '') ||
      JSON.stringify(lines) !==
        JSON.stringify(
          document.lines.map((line) => ({
            productId: line.productId,
            countedQty: line.countedQty,
            openingUnitCost: line.openingUnitCost,
            sourceSuggestionId: line.sourceSuggestionId,
            confirmedUnverified: line.unverifiedSourceConfirmed,
          })),
        ));

  useEffect(() => {
    let active = true;
    documentGeneration.current += 1;
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
          hydrate(data);
        })
        .catch(
          (reason: unknown) => active && setError(safeInventoryMessage(reason)),
        );
    return () => {
      active = false;
      documentGeneration.current += 1;
    };
  }, [api, catalogApi, countId, isCreate, hydrate]);
  const selectedIds = useMemo(
    () => new Set(lines.map((line) => line.productId).filter(Boolean)),
    [lines],
  );
  const editable = isCreate || document?.status === 'DRAFT';
  function applySuggestion(suggestion: OpeningSuggestion) {
    if (
      suggestion.suggestedOpeningQuantity !== null &&
      !validateCanonicalNumber(suggestion.suggestedOpeningQuantity, {
        kind: 'quantity',
        precision: 18,
        positive: true,
      }).ok
    ) {
      setError(
        'Gợi ý từ workbook cũ có số lượng lẻ nên không thể dùng để mở sổ.',
      );
      return;
    }
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
    const generation = documentGeneration.current;
    setBusy(true);
    setError(null);
    try {
      await action();
      if (generation !== documentGeneration.current) return;
      await refreshOperationalData(queryClient);
      toast.show({ kind: 'success', title, message: title });
      if (redirect) navigate('/more/inventory/opening');
      else if (countId) {
        const fresh = await api.detail(countId);
        if (generation === documentGeneration.current) hydrate(fresh);
      }
    } catch (reason) {
      if (generation !== documentGeneration.current) return;
      const message = safeInventoryMessage(reason);
      setError(message);
      toast.show({
        kind: 'error',
        title: 'Không thể cập nhật phiếu mở sổ',
        message,
        requestId:
          reason instanceof FinancialOutcomeUnknownError
            ? reason.requestId
            : undefined,
        correlationId: getFinancialCorrelationId(reason),
      });
    } finally {
      if (generation === documentGeneration.current) setBusy(false);
    }
  }
  async function save() {
    const valid = lines.filter(
      (line) =>
        line.productId &&
        validateCanonicalNumber(line.countedQty, {
          kind: 'quantity',
          precision: 18,
          positive: true,
        }).ok &&
        validateCanonicalNumber(line.openingUnitCost, {
          kind: 'money',
          precision: 20,
          required: true,
        }).ok,
    );
    if (
      valid.length === 0 ||
      valid.length !== selectedIds.size ||
      lines.filter((line) => line.productId).length !== selectedIds.size
    ) {
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
      <fieldset disabled={busy || !online}>
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
      </fieldset>
      <OpeningActions
        hasUnsavedChanges={hasUnsavedChanges}
        api={api}
        document={document}
        editable={editable}
        online={online}
        busy={busy}
        onSave={save}
        onPerform={perform}
        userId={session?.userId}
      />
    </section>
  );
}
