import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useOnlineStatus } from '../../app/use-online-status';
import { NumericField } from '../../components/forms/NumericField';
import { useToast } from '../../components/feedback/use-toast';
import { createCatalogApi } from '../catalog/catalog-api';
import {
  createInventoryApi,
  type OpeningDocument,
  type OpeningSuggestion,
} from './inventory-api';
import { formatMoney, safeInventoryMessage, statusLabel } from './inventory-ui';

type OpeningLine = {
  productId: string;
  countedQty: string;
  openingUnitCost: string;
  sourceSuggestionId: string | null;
  confirmedUnverified: boolean;
};

export function OpeningDetailPage({ mode }: { mode?: 'create' }) {
  const { countId } = useParams();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const toast = useToast();
  const [api] = useState(createInventoryApi);
  const [catalogApi] = useState(createCatalogApi);
  const [document, setDocument] = useState<OpeningDocument | null>(null);
  const [products, setProducts] = useState<
    Awaited<ReturnType<typeof catalogApi.list>>['items']
  >([]);
  const [suggestions, setSuggestions] = useState<OpeningSuggestion[]>([]);
  const [lines, setLines] = useState<OpeningLine[]>([
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
      .listSuggestions()
      .then((page) => active && setSuggestions(page.items))
      .catch(() => undefined);
    if (!isCreate && countId)
      api
        .getOpening(countId)
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
      else if (countId) setDocument(await api.getOpening(countId));
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
      const result = await api.saveOpening({
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
      {editable && groupedSuggestions.length > 0 ? (
        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-bold text-amber-950">Gợi ý từ workbook cũ</h2>
          <p className="mt-1 text-sm text-amber-900">
            Các dòng trùng được nhóm theo sản phẩm, không tự cộng. Owner phải
            chọn rồi xác nhận số cuối cùng.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {groupedSuggestions.map((group) =>
              group?.[0] ? (
                <button
                  key={group[0].productId}
                  type="button"
                  onClick={() => applySuggestion(group[0]!)}
                  className="rounded-lg border border-amber-300 bg-white p-3 text-left text-sm"
                >
                  <strong>
                    {group[0].sku} — {group[0].productName}
                  </strong>
                  <span className="mt-1 block text-amber-900">
                    {group.length} gợi ý · cần xác nhận dữ liệu cache
                  </span>
                </button>
              ) : null,
            )}
          </div>
        </aside>
      ) : null}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-semibold">
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
        <h2 className="font-bold">Tồn và giá vốn đầu kỳ</h2>
        {lines.map((line, index) => (
          <div
            key={`${index}-${line.productId}`}
            className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_11rem_11rem_auto]"
          >
            <select
              aria-label={`Sản phẩm mở sổ dòng ${index + 1}`}
              disabled={!editable || line.sourceSuggestionId !== null}
              value={line.productId}
              onChange={(e) =>
                setLines((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, productId: e.target.value } : item,
                  ),
                )
              }
              className="min-h-11 rounded-lg border border-slate-300 px-3"
            >
              <option value="">Chọn sản phẩm</option>
              {products.map((product) => (
                <option
                  disabled={
                    selectedIds.has(product.id) && product.id !== line.productId
                  }
                  key={product.id}
                  value={product.id}
                >
                  {product.sku} — {product.name}
                </option>
              ))}
            </select>
            <NumericField
              label="Tồn đầu kỳ"
              disabled={!editable}
              kind="quantity"
              precision={18}
              positive
              value={line.countedQty}
              onChange={(value) =>
                setLines((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, countedQty: value } : item,
                  ),
                )
              }
            />
            <NumericField
              label="Giá vốn đầu kỳ"
              disabled={!editable}
              kind="money"
              precision={20}
              value={line.openingUnitCost}
              onChange={(value) =>
                setLines((current) =>
                  current.map((item, i) =>
                    i === index ? { ...item, openingUnitCost: value } : item,
                  ),
                )
              }
            />
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
            {line.sourceSuggestionId ? (
              <p className="md:col-span-4 rounded-md bg-amber-100 p-2 text-xs text-amber-950">
                Nguồn cache chưa kiểm chứng đã được owner chọn; hãy kiểm tra lại
                số lượng và đơn giá trước khi gửi.
              </p>
            ) : null}
          </div>
        ))}
        {editable ? (
          <button
            type="button"
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  productId: '',
                  countedQty: '1',
                  openingUnitCost: '0',
                  sourceSuggestionId: null,
                  confirmedUnverified: false,
                },
              ])
            }
            className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold"
          >
            Thêm dòng
          </button>
        ) : null}
      </div>
      <div className="sticky bottom-20 z-20 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg lg:static lg:border-0 lg:bg-slate-50 lg:p-0 lg:py-2 lg:shadow-none">
        {editable ? (
          <button
            disabled={!online || busy}
            onClick={() => void save()}
            className="min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Lưu nháp
          </button>
        ) : null}
        {document?.status === 'DRAFT' ? (
          <button
            disabled={!online || busy}
            onClick={() =>
              void perform(
                () =>
                  api.commandOpening('submit', document.id, document.version),
                'Đã hoàn tất kiểm đếm',
              )
            }
            className="min-h-11 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Hoàn tất kiểm đếm
          </button>
        ) : null}
        {document?.status === 'COUNTED' ? (
          <button
            disabled={!online || busy}
            onClick={() =>
              void perform(
                () => api.commandOpening('post', document.id, document.version),
                'Đã ghi sổ tồn đầu kỳ',
              )
            }
            className="min-h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Ghi sổ
          </button>
        ) : null}
        {document && ['DRAFT', 'COUNTED'].includes(document.status) ? (
          <button
            disabled={!online || busy}
            onClick={() =>
              void perform(
                () =>
                  api.commandOpening(
                    'cancel',
                    document.id,
                    document.version,
                    'Owner hủy phiếu',
                  ),
                'Đã hủy phiếu mở sổ',
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
