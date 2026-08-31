import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { useSession } from '@/features/auth';
import {
  ActionLink,
  connectedExplorerKeys,
  ContextTabs,
  createConnectedExplorerApi,
  EntityActionBar,
  LoadMoreButton,
  parseProductContextUrl,
  PostedPurchaseHistory,
  RelationshipKpis,
  SectionState,
  SupplierRelationshipList,
  type ConnectedExplorerApi,
} from '@/features/connected-explorer';
import { formatViDecimal } from '@/shared/lib/numeric/canonical-number';
import {
  CatalogApiError,
  catalogKeys,
  createCatalogApi,
  type CatalogApi,
} from '../api/catalog-api';
import type { ProductSaveRequest } from '../components/ProductForm';
import { ProductDetailView } from '../components/ProductDetailView';
import { ProductEditor } from '../components/ProductEditor';

type ProductDetailMode = 'view' | 'create' | 'edit';

function LoadingDetail() {
  return (
    <div aria-label="Đang tải sản phẩm" className="space-y-4 animate-pulse">
      <div className="h-8 w-64 rounded bg-slate-200" />
      <div className="h-40 rounded-xl bg-slate-100" />
    </div>
  );
}

export function ProductDetailPage({
  api: apiProp,
  explorerApi: explorerApiProp,
  mode = 'view',
}: {
  api?: CatalogApi;
  explorerApi?: ConnectedExplorerApi;
  mode?: ProductDetailMode;
}) {
  const [api] = useState(() => apiProp ?? createCatalogApi());
  const [explorerApi] = useState(
    () => explorerApiProp ?? createConnectedExplorerApi(),
  );
  const { productId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { session } = useSession();
  const isOnline = useOnlineStatus();
  const canManage =
    session?.permissions.includes('catalog.basic.manage') ?? false;
  const canManageSalePrice =
    session?.permissions.includes('pricing.sale.manage') ?? false;
  const canReadPurchases = Boolean(
    session?.permissions.some((permission) =>
      [
        'purchase.operational.read',
        'purchase.draft.manage',
        'purchase.cost.read',
      ].includes(permission),
    ),
  );
  const canCreatePurchase =
    session?.permissions.includes('purchase.draft.manage') ?? false;
  const canSell = session?.permissions.includes('sale.draft.manage') ?? false;
  const canViewSupplier = Boolean(
    session?.permissions.some((permission) =>
      ['supplier.read', 'supplier.manage'].includes(permission),
    ),
  );
  const needsDetail = mode !== 'create';
  const contextUrl = parseProductContextUrl(searchParams);
  const contextUrlKey = contextUrl.canonical.toString();
  useEffect(() => {
    if (mode === 'view' && contextUrl.changed) {
      setSearchParams(contextUrlKey, { replace: true });
    }
  }, [contextUrl.changed, contextUrlKey, mode, setSearchParams]);
  useEffect(() => {
    if (
      mode === 'view' &&
      !canReadPurchases &&
      contextUrl.value.tab !== 'overview'
    ) {
      const next = new URLSearchParams(contextUrlKey);
      for (const key of ['tab', 'supplierId', 'from', 'to']) next.delete(key);
      setSearchParams(next, { replace: true });
    }
  }, [
    canReadPurchases,
    contextUrl.value.tab,
    contextUrlKey,
    mode,
    setSearchParams,
  ]);

  const detailQuery = useQuery({
    queryKey: catalogKeys.detail(productId ?? 'missing'),
    queryFn: () => {
      if (!productId) throw new Error('Thiếu mã sản phẩm.');
      return api.detail(productId);
    },
    enabled: needsDetail && Boolean(productId),
  });
  const categoriesQuery = useQuery({
    queryKey: catalogKeys.categories(mode === 'edit'),
    queryFn: () => api.listCategories(mode === 'edit'),
    enabled: mode !== 'view',
  });
  const priceHistoryQuery = useQuery({
    queryKey: catalogKeys.priceHistory(productId ?? 'missing'),
    queryFn: () => {
      if (!productId) throw new Error('Thiếu mã sản phẩm.');
      return api.priceHistory(productId);
    },
    enabled: mode === 'view' && canManageSalePrice && Boolean(productId),
  });
  const relationshipQuery = useQuery({
    queryKey: connectedExplorerKeys.productContext(productId ?? 'missing'),
    queryFn: () => explorerApi.productContext(productId!),
    enabled: mode === 'view' && canReadPurchases && Boolean(productId),
  });
  const suppliersQuery = useInfiniteQuery({
    queryKey: connectedExplorerKeys.productSuppliers({ productId }),
    queryFn: ({ pageParam }) =>
      explorerApi.productSuppliers({
        productId: productId!,
        cursor: pageParam,
        limit: 25,
      }),
    initialPageParam: undefined as
      | NonNullable<
          Awaited<
            ReturnType<ConnectedExplorerApi['productSuppliers']>
          >['nextCursor']
        >
      | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled:
      mode === 'view' &&
      canReadPurchases &&
      Boolean(productId) &&
      (contextUrl.value.tab === 'suppliers' ||
        contextUrl.value.tab === 'purchases'),
    placeholderData: keepPreviousData,
  });
  const historyLimit = contextUrl.value.tab === 'overview' ? 5 : 25;
  const historyQuery = useInfiniteQuery({
    queryKey: connectedExplorerKeys.purchaseHistory({
      productId,
      supplierId: contextUrl.value.supplierId,
      from: contextUrl.value.from,
      to: contextUrl.value.to,
      limit: historyLimit,
    }),
    queryFn: ({ pageParam }) =>
      explorerApi.postedPurchaseHistory({
        productId: productId!,
        supplierId: contextUrl.value.supplierId ?? undefined,
        from: contextUrl.value.from ?? undefined,
        to: contextUrl.value.to ?? undefined,
        cursor: pageParam,
        limit: historyLimit,
      }),
    initialPageParam: undefined as
      | NonNullable<
          Awaited<
            ReturnType<ConnectedExplorerApi['postedPurchaseHistory']>
          >['nextCursor']
        >
      | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled:
      mode === 'view' &&
      canReadPurchases &&
      Boolean(productId) &&
      contextUrl.value.tab !== 'suppliers',
    placeholderData: keepPreviousData,
  });

  async function save(request: ProductSaveRequest) {
    const current = detailQuery.data;
    const { salePrice, ...productValues } = request.values;
    try {
      const result = await api.saveProduct({
        productId: mode === 'edit' ? productId : undefined,
        expectedVersion: mode === 'edit' ? current?.version : undefined,
        values: productValues,
        idempotencyKey: request.productIdempotencyKey,
      });

      const priceChanged =
        salePrice !== '' && salePrice !== current?.currentSalePrice;
      if (canManageSalePrice && priceChanged) {
        await api.setSalePrice({
          productId: result.productId,
          salePrice,
          changeReason:
            mode === 'create' ? 'Đặt giá bán ban đầu' : 'Cập nhật giá bán',
          idempotencyKey: request.priceIdempotencyKey,
        });
      }

      await refreshOperationalData(queryClient);
      toast.show({
        kind: 'success',
        title: mode === 'create' ? 'Đã thêm sản phẩm' : 'Đã cập nhật sản phẩm',
      });
      navigate(`/products/${result.productId}`);
    } catch (error) {
      if (mode === 'edit' && !(error instanceof CatalogApiError)) {
        await detailQuery.refetch();
      }
      throw error;
    }
  }

  if (mode !== 'create' && detailQuery.isPending) return <LoadingDetail />;
  if (mode !== 'view' && categoriesQuery.isPending) return <LoadingDetail />;

  if (mode !== 'create' && detailQuery.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-6"
      >
        <h1 className="text-lg font-bold text-red-900">
          Không thể tải sản phẩm.
        </h1>
        <p className="mt-2 text-sm text-red-800">
          Vui lòng kiểm tra kết nối và thử lại.
        </p>
        {detailQuery.error instanceof CatalogApiError ? (
          <code className="mt-2 block text-xs text-red-700">
            {detailQuery.error.correlationId}
          </code>
        ) : null}
        <button
          type="button"
          onClick={() => void detailQuery.refetch()}
          className="mt-4 min-h-11 rounded-lg border border-red-300 px-4 text-sm font-semibold"
        >
          Thử lại
        </button>
      </div>
    );
  }

  if (mode !== 'view') {
    if (categoriesQuery.isError) {
      return (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"
        >
          Không thể tải nhóm hàng. Vui lòng thử lại.
        </div>
      );
    }
    const detail = detailQuery.data;
    return (
      <ProductEditor
        canManageSalePrice={canManageSalePrice}
        categories={categoriesQuery.data ?? []}
        detail={detail}
        isOnline={isOnline}
        mode={mode}
        onSave={save}
      />
    );
  }

  const detail = detailQuery.data;
  if (!detail) return null;

  const supplierItems =
    suppliersQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const historyItems =
    historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const setContextFilter = (name: string, value: string) => {
    const next = new URLSearchParams(contextUrl.canonical);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next);
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/products"
            className="text-sm font-semibold text-teal-800 hover:underline"
          >
            ← Về danh sách sản phẩm
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              {detail.name}
            </h1>
            {!detail.isActive ? (
              <span className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                Ngừng hoạt động
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-sm text-slate-600">{detail.sku}</p>
        </div>
        <EntityActionBar>
          {canSell && detail.isActive ? (
            <ActionLink to={`/pos?focusProduct=${detail.id}`}>
              Bán hàng
            </ActionLink>
          ) : null}
          {canCreatePurchase && detail.isActive ? (
            <ActionLink to={`/more/purchases/new?productId=${detail.id}`}>
              Nhập hàng
            </ActionLink>
          ) : null}
          {canManage ? (
            <ActionLink to={`/products/${detail.id}/edit`}>
              Sửa sản phẩm
            </ActionLink>
          ) : null}
        </EntityActionBar>
      </div>

      <ContextTabs
        current={contextUrl.value.tab}
        params={contextUrl.canonical}
        tabs={[
          { id: 'overview', label: 'Tổng quan' },
          ...(canReadPurchases
            ? [
                { id: 'suppliers', label: 'Nhà cung cấp' },
                { id: 'purchases', label: 'Lịch sử nhập' },
              ]
            : []),
        ]}
      />

      {contextUrl.value.tab === 'overview' ? (
        <>
          <ProductDetailView
            canManage={canManage}
            canManageSalePrice={canManageSalePrice}
            detail={detail}
            hideHeader
            isOnline={isOnline}
            onImagesChanged={async () => {
              await detailQuery.refetch();
            }}
            priceHistory={priceHistoryQuery.data}
            priceHistoryError={priceHistoryQuery.isError}
            priceHistoryPending={priceHistoryQuery.isPending}
          />
          {canReadPurchases ? (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">Liên kết nhập hàng</h2>
              <SectionState
                pending={relationshipQuery.isPending}
                error={relationshipQuery.isError}
                empty={false}
                onRetry={() => void relationshipQuery.refetch()}
              />
              {relationshipQuery.data ? (
                <RelationshipKpis
                  items={[
                    {
                      label: 'Nhà cung cấp',
                      value: relationshipQuery.data.supplierCount,
                    },
                    {
                      label: 'Phiếu đã ghi sổ',
                      value: relationshipQuery.data.postedReceiptCount,
                    },
                    {
                      label: 'Tổng lượng nhập',
                      value: formatViDecimal(
                        relationshipQuery.data.totalReceivedQty,
                        3,
                      ),
                    },
                    {
                      label: 'Lần nhập gần nhất',
                      value: relationshipQuery.data.lastReceivedAt
                        ? new Intl.DateTimeFormat('vi-VN').format(
                            new Date(relationshipQuery.data.lastReceivedAt),
                          )
                        : '—',
                    },
                  ]}
                />
              ) : null}
              <h3 className="pt-2 font-bold">Các lần nhập gần nhất</h3>
              <SectionState
                pending={historyQuery.isPending}
                error={historyQuery.isError}
                empty={!historyQuery.isPending && historyItems.length === 0}
                onRetry={() => void historyQuery.refetch()}
              />
              {historyItems.length ? (
                <PostedPurchaseHistory
                  items={historyItems}
                  showSupplier
                  canViewSupplier={canViewSupplier}
                  showProduct={false}
                  canViewProduct
                />
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {contextUrl.value.tab === 'suppliers' && canReadPurchases ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">
            Nhà cung cấp từng cung cấp sản phẩm
          </h2>
          <SectionState
            pending={suppliersQuery.isPending}
            error={suppliersQuery.isError}
            empty={!suppliersQuery.isPending && supplierItems.length === 0}
            onRetry={() => void suppliersQuery.refetch()}
          />
          {supplierItems.length ? (
            <SupplierRelationshipList
              items={supplierItems}
              productId={detail.id}
              canViewSupplier={canViewSupplier}
              canCreatePurchase={canCreatePurchase}
            />
          ) : null}
          {suppliersQuery.hasNextPage ? (
            <LoadMoreButton
              loading={suppliersQuery.isFetchingNextPage}
              onClick={() => void suppliersQuery.fetchNextPage()}
            />
          ) : null}
        </section>
      ) : null}

      {contextUrl.value.tab === 'purchases' && canReadPurchases ? (
        <section className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-bold">Lọc lịch sử nhập</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="text-sm font-semibold">
                Nhà cung cấp
                <select
                  value={contextUrl.value.supplierId ?? ''}
                  onChange={(event) =>
                    setContextFilter('supplierId', event.target.value)
                  }
                  className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
                >
                  <option value="">Tất cả</option>
                  {supplierItems.map((item) => (
                    <option key={item.supplierId} value={item.supplierId}>
                      {item.supplierName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Từ ngày
                <input
                  type="date"
                  value={contextUrl.value.from ?? ''}
                  onChange={(event) =>
                    setContextFilter('from', event.target.value)
                  }
                  className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
                />
              </label>
              <label className="text-sm font-semibold">
                Đến ngày
                <input
                  type="date"
                  value={contextUrl.value.to ?? ''}
                  onChange={(event) =>
                    setContextFilter('to', event.target.value)
                  }
                  className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
                />
              </label>
            </div>
          </div>
          <SectionState
            pending={historyQuery.isPending}
            error={historyQuery.isError}
            empty={!historyQuery.isPending && historyItems.length === 0}
            onRetry={() => void historyQuery.refetch()}
          />
          {historyItems.length ? (
            <PostedPurchaseHistory
              items={historyItems}
              showSupplier
              canViewSupplier={canViewSupplier}
              showProduct={false}
              canViewProduct
            />
          ) : null}
          {historyQuery.hasNextPage ? (
            <LoadMoreButton
              loading={historyQuery.isFetchingNextPage}
              onClick={() => void historyQuery.fetchNextPage()}
            />
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
