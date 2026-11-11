import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { usePrivateQueryKey } from '@/features/auth';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { QUANTITY_FINAL } from '@/shared/lib/numeric/canonical-number';
import { NumericField } from '@/shared/ui/forms/NumericField';
import { createCatalogApi, type ProductBundle } from '../api/catalog-api';
import { ProductSelect } from '../components/ProductSelect';
import '../components/bundles.css';

type DraftLine = {
  productId: string;
  productName: string;
  sku: string;
  unitName: string;
  quantity: string;
  isActive: boolean;
};
type Draft = {
  id?: string;
  version?: number;
  name: string;
  isActive: boolean;
  lines: DraftLine[];
};

const EMPTY: Draft = { name: '', isActive: true, lines: [] };

export function ProductBundlesPage() {
  const privateKey = usePrivateQueryKey();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [api] = useState(createCatalogApi);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const keyRef = useRef<string | null>(null);
  const bundles = useQuery({
    queryKey: privateKey('catalog', 'bundles', true),
    queryFn: () => api.listBundles(true),
  });

  const open = (next: Draft) => {
    keyRef.current = crypto.randomUUID();
    setError(null);
    setDraft(next);
  };
  const edit = (bundle: ProductBundle) =>
    open({
      id: bundle.id,
      version: bundle.version,
      name: bundle.name,
      isActive: bundle.isActive,
      lines: bundle.lines,
    });
  const change = (next: Draft) => {
    // Different content must not reuse the previous attempt's request id.
    keyRef.current = crypto.randomUUID();
    setError(null);
    setDraft(next);
  };
  const save = async (target: Draft) => {
    if (
      !target.name.trim() ||
      !target.lines.length ||
      target.lines.some(
        (line) => !QUANTITY_FINAL.test(line.quantity) || line.quantity === '0',
      )
    ) {
      setError('Nhập tên gói và ít nhất một thuốc có số lượng.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.saveBundle({
        bundleId: target.id,
        expectedVersion: target.version,
        name: target.name,
        isActive: target.isActive,
        lines: target.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
        })),
        idempotencyKey: keyRef.current ?? crypto.randomUUID(),
      });
      setDraft(null);
      await refreshOperationalData(queryClient);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Gói hàng
          </h1>
          <Link to="/products" className="text-sm text-slate-600">
            Hàng hóa
          </Link>
        </div>
        <button
          type="button"
          onClick={() => open(EMPTY)}
          disabled={!online}
          className="min-h-11 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Thêm gói
        </button>
      </div>

      {draft ? (
        <form
          aria-label={draft.id ? 'Sửa gói hàng' : 'Thêm gói hàng'}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void save(draft);
          }}
        >
          <div className="bundle-field">
            <label
              htmlFor="bundle-name"
              className="mb-2 block text-sm font-medium text-slate-800"
            >
              Tên gói
            </label>
            <input
              id="bundle-name"
              value={draft.name}
              maxLength={120}
              onChange={(event) =>
                change({ ...draft, name: event.target.value })
              }
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
            />
          </div>
          <div className="bundle-field">
            <ProductSelect
              label="Thêm thuốc"
              value=""
              excludedIds={new Set(draft.lines.map((line) => line.productId))}
              onChange={(id, product) => {
                if (!id || !product) return;
                const unit = (product as unknown as { unitName?: string })
                  .unitName;
                change({
                  ...draft,
                  lines: [
                    ...draft.lines,
                    {
                      productId: id,
                      productName: product.name,
                      sku: product.sku,
                      unitName: unit ?? '',
                      quantity: '1',
                      isActive: true,
                    },
                  ],
                });
              }}
            />
          </div>
          {draft.lines.map((line) => (
            <div key={line.productId} className="bundle-line">
              <span>
                {line.productName}
                <small className={line.isActive ? '' : 'bundle-line-warn'}>
                  {line.sku}
                  {line.unitName ? ` · ${line.unitName}` : ''}
                  {line.isActive ? '' : ' · ngừng kinh doanh'}
                </small>
              </span>
              <NumericField
                label={`Số lượng ${line.productName}`}
                value={line.quantity}
                kind="quantity"
                precision={6}
                positive
                onChange={(value) =>
                  change({
                    ...draft,
                    lines: draft.lines.map((item) =>
                      item.productId === line.productId
                        ? { ...item, quantity: value }
                        : item,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="bundle-remove"
                aria-label={`Bỏ ${line.productName} khỏi gói`}
                onClick={() =>
                  change({
                    ...draft,
                    lines: draft.lines.filter(
                      (item) => item.productId !== line.productId,
                    ),
                  })
                }
              >
                Bỏ
              </button>
            </div>
          ))}
          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="bundle-actions">
            <button
              type="submit"
              disabled={!online || saving}
              className="min-h-11 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Lưu gói
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={saving}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Hủy
            </button>
            {draft.id ? (
              <button
                type="button"
                disabled={!online || saving}
                onClick={() =>
                  void save({ ...draft, isActive: !draft.isActive })
                }
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                {draft.isActive ? 'Ngừng dùng' : 'Dùng lại'}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {bundles.isLoading ? (
          <p role="status" className="text-sm text-slate-600">
            Đang tải gói hàng…
          </p>
        ) : bundles.isError ? (
          <p role="alert" className="text-sm text-red-700">
            Không tải được gói hàng.{' '}
            <button type="button" onClick={() => void bundles.refetch()}>
              Thử lại
            </button>
          </p>
        ) : !bundles.data?.length ? (
          <p className="text-sm text-slate-600">Chưa có gói hàng.</p>
        ) : (
          bundles.data.map((bundle) => (
            <div key={bundle.id} className="bundle-row">
              <span>
                <strong className="text-slate-950">{bundle.name}</strong>
                <span className="text-sm text-slate-600">
                  {' '}
                  · {bundle.lines.length} món
                </span>{' '}
                {bundle.isActive ? null : (
                  <span className="bundle-off">Ngừng dùng</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => edit(bundle)}
                disabled={!online}
                aria-label={`Sửa ${bundle.name}`}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Sửa
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
