import { usePrivateQueryKey } from '@/features/auth';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { parsePhoneNumber } from 'libphonenumber-js';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useSession } from '@/features/auth';
import {
  ActionLink,
  connectedExplorerKeys,
  ContextTabs,
  createConnectedExplorerApi,
  EntityActionBar,
  LoadMoreButton,
  parseSupplierContextUrl,
  PostedPurchaseHistory,
  RelationshipKpis,
  SectionState,
  SupplierProductList,
  type ConnectedExplorerApi,
} from '@/features/connected-explorer';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import { formatViDecimal } from '@/shared/lib/numeric/canonical-number';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import {
  createDirectoryApi,
  type DirectoryApi,
  type SupplierItem,
} from '../api/directory-api';
import { SupplierForm } from '../components/SupplierForm';

function readablePhone(value: string | null) {
  if (!value) return 'Chưa có';
  try {
    return parsePhoneNumber(value).formatInternational();
  } catch {
    return value;
  }
}

function supplierItem(
  detail: Awaited<ReturnType<ConnectedExplorerApi['supplierDetail']>>,
): SupplierItem {
  return {
    id: detail.id,
    code: detail.code,
    name: detail.name,
    phone: detail.phone,
    email: detail.email,
    address: detail.address,
    notes: detail.notes,
    isActive: detail.isActive,
    version: detail.version,
  };
}

export function SupplierDetailPage({
  mode = 'view',
  api: apiProp,
  directoryApi: directoryApiProp,
}: {
  mode?: 'view' | 'edit';
  api?: ConnectedExplorerApi;
  directoryApi?: DirectoryApi;
}) {
  const privateKey = usePrivateQueryKey();
  const { supplierId } = useParams();
  const [api] = useState(() => apiProp ?? createConnectedExplorerApi());
  const [directoryApi] = useState(
    () => directoryApiProp ?? createDirectoryApi(),
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const contextUrl = parseSupplierContextUrl(searchParams);
  const contextUrlKey = contextUrl.canonical.toString();
  const { session } = useSession();
  const online = useOnlineStatus();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canManage = session?.permissions.includes('supplier.manage') ?? false;
  const canCreatePurchase =
    session?.permissions.includes('purchase.draft.manage') ?? false;
  const canViewProduct = session?.permissions.includes('catalog.read') ?? false;

  useEffect(() => {
    if (contextUrl.changed) setSearchParams(contextUrlKey, { replace: true });
  }, [contextUrl.changed, contextUrlKey, setSearchParams]);

  const detailQuery = useQuery({
    queryKey: privateKey(
      ...connectedExplorerKeys.supplierDetail(supplierId ?? 'missing'),
    ),
    queryFn: () => api.supplierDetail(supplierId!),
    enabled: Boolean(supplierId),
  });
  const canReadPurchases = detailQuery.data?.canReadPurchases ?? false;
  useEffect(() => {
    if (
      detailQuery.data &&
      !detailQuery.data.canReadPurchases &&
      contextUrl.value.tab !== 'overview'
    ) {
      const next = new URLSearchParams(contextUrlKey);
      next.delete('tab');
      setSearchParams(next, { replace: true });
    }
  }, [contextUrlKey, contextUrl.value.tab, detailQuery.data, setSearchParams]);

  const productsQuery = useInfiniteQuery({
    queryKey: privateKey(
      ...connectedExplorerKeys.supplierProducts({
        supplierId,
        search: contextUrl.value.q,
      }),
    ),
    queryFn: ({ pageParam }) =>
      api.supplierProducts({
        supplierId: supplierId!,
        search: contextUrl.value.q || undefined,
        cursor: pageParam,
        limit: 25,
      }),
    initialPageParam: undefined as
      | NonNullable<
          Awaited<
            ReturnType<ConnectedExplorerApi['supplierProducts']>
          >['nextCursor']
        >
      | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled:
      Boolean(supplierId) &&
      canReadPurchases &&
      (contextUrl.value.tab === 'products' ||
        contextUrl.value.tab === 'purchases'),
    placeholderData: keepPreviousData,
  });
  const historyLimit = contextUrl.value.tab === 'overview' ? 5 : 25;
  const historyQuery = useInfiniteQuery({
    queryKey: privateKey(
      ...connectedExplorerKeys.purchaseHistory({
        supplierId,
        productId: contextUrl.value.productId,
        from: contextUrl.value.from,
        to: contextUrl.value.to,
        limit: historyLimit,
      }),
    ),
    queryFn: ({ pageParam }) =>
      api.postedPurchaseHistory({
        supplierId: supplierId!,
        productId: contextUrl.value.productId ?? undefined,
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
      Boolean(supplierId) &&
      canReadPurchases &&
      contextUrl.value.tab !== 'products',
    placeholderData: keepPreviousData,
  });

  if (detailQuery.isPending) {
    return (
      <p role="status" className="p-5 text-sm text-slate-600">
        Đang tải Nhà cung cấp…
      </p>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"
      >
        <h1 className="text-lg font-bold">Không thể tải Nhà cung cấp.</h1>
        <button
          type="button"
          onClick={() => void detailQuery.refetch()}
          className="mt-4 min-h-11 rounded-lg border border-red-300 px-4 font-semibold"
        >
          Thử lại
        </button>
      </div>
    );
  }
  const detail = detailQuery.data;

  if (mode === 'edit') {
    return (
      <section className="space-y-4">
        <Link
          to={`/more/suppliers/${detail.id}`}
          className="text-sm font-semibold text-teal-800"
        >
          ← Chi tiết Nhà cung cấp
        </Link>
        <SupplierForm
          api={directoryApi}
          isOnline={online}
          item={supplierItem(detail)}
          onCancel={() => navigate(`/more/suppliers/${detail.id}`)}
          onSaved={async () => {
            await refreshOperationalData(queryClient);
            toast.show({ kind: 'success', title: 'Đã lưu Nhà cung cấp' });
            navigate(`/more/suppliers/${detail.id}`);
          }}
        />
      </section>
    );
  }

  const productItems =
    productsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const historyItems =
    historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const setFilter = (name: string, value: string) => {
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
            to="/more/suppliers"
            className="text-sm font-semibold text-teal-800 hover:underline"
          >
            ← Nhà cung cấp
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{detail.name}</h1>
            {!detail.isActive ? (
              <span className="rounded bg-slate-200 px-2 py-1 text-xs font-semibold">
                Ngừng hoạt động
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-sm text-slate-600">
            {detail.code ?? 'Chưa có mã'}
          </p>
        </div>
        <EntityActionBar>
          {canCreatePurchase && detail.isActive ? (
            <ActionLink to={`/more/purchases/new?supplierId=${detail.id}`}>
              Lập phiếu nhập
            </ActionLink>
          ) : null}
          {canManage ? (
            <ActionLink to={`/more/suppliers/${detail.id}/edit`}>
              Sửa
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
                { id: 'products', label: 'Mặt hàng cung cấp' },
                { id: 'purchases', label: 'Lịch sử nhập' },
              ]
            : []),
        ]}
      />

      {contextUrl.value.tab === 'overview' ? (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold">Thông tin liên hệ</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase text-slate-500">
                    Điện thoại
                  </dt>
                  <dd className="mt-1">{readablePhone(detail.phone)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-500">Email</dt>
                  <dd className="mt-1">{detail.email ?? 'Chưa có'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-slate-500">Địa chỉ</dt>
                  <dd className="mt-1">{detail.address ?? 'Chưa có'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase text-slate-500">Ghi chú</dt>
                  <dd className="mt-1 whitespace-pre-wrap">
                    {detail.notes ?? 'Chưa có'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          {canReadPurchases ? (
            <section className="space-y-3">
              <RelationshipKpis
                items={[
                  {
                    label: 'Mặt hàng',
                    value: detail.distinctProductCount ?? 0,
                  },
                  {
                    label: 'Phiếu đã ghi sổ',
                    value: detail.postedReceiptCount ?? 0,
                  },
                  {
                    label: 'Tổng lượng nhập',
                    value: formatViDecimal(detail.totalReceivedQty ?? '0', 3),
                  },
                  {
                    label: 'Lần nhập gần nhất',
                    value: detail.lastReceivedAt
                      ? new Intl.DateTimeFormat('vi-VN').format(
                          new Date(detail.lastReceivedAt),
                        )
                      : '—',
                  },
                ]}
              />
              <h2 className="font-bold">Các lần nhập gần nhất</h2>
              <SectionState
                pending={historyQuery.isPending}
                error={historyQuery.isError}
                empty={!historyQuery.isPending && historyItems.length === 0}
                onRetry={() => void historyQuery.refetch()}
              />
              {historyItems.length ? (
                <PostedPurchaseHistory
                  items={historyItems}
                  showSupplier={false}
                  canViewSupplier
                  showProduct
                  canViewProduct={canViewProduct}
                />
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {contextUrl.value.tab === 'products' && canReadPurchases ? (
        <section className="space-y-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setFilter(
                'q',
                String(data.get('q') ?? '')
                  .trim()
                  .slice(0, 200),
              );
            }}
            className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <label className="flex-1 text-sm font-semibold">
              Tìm mặt hàng
              <input
                key={contextUrl.value.q}
                name="q"
                defaultValue={contextUrl.value.q}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
                placeholder="SKU hoặc tên sản phẩm"
              />
            </label>
            <button className="mt-7 min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">
              Tìm kiếm
            </button>
          </form>
          <SectionState
            pending={productsQuery.isPending}
            error={productsQuery.isError}
            empty={!productsQuery.isPending && productItems.length === 0}
            onRetry={() => void productsQuery.refetch()}
          />
          {productItems.length ? (
            <SupplierProductList
              items={productItems}
              canViewProduct={canViewProduct}
            />
          ) : null}
          {productsQuery.hasNextPage ? (
            <LoadMoreButton
              loading={productsQuery.isFetchingNextPage}
              onClick={() => void productsQuery.fetchNextPage()}
            />
          ) : null}
        </section>
      ) : null}

      {contextUrl.value.tab === 'purchases' && canReadPurchases ? (
        <section className="space-y-3">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
            <label className="text-sm font-semibold">
              Sản phẩm
              <select
                value={contextUrl.value.productId ?? ''}
                onChange={(event) => setFilter('productId', event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
              >
                <option value="">Tất cả</option>
                {productItems.map((item) => (
                  <option key={item.productId} value={item.productId}>
                    {item.productName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Từ ngày
              <input
                type="date"
                value={contextUrl.value.from ?? ''}
                onChange={(event) => setFilter('from', event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
              />
            </label>
            <label className="text-sm font-semibold">
              Đến ngày
              <input
                type="date"
                value={contextUrl.value.to ?? ''}
                onChange={(event) => setFilter('to', event.target.value)}
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
              />
            </label>
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
              showSupplier={false}
              canViewSupplier
              showProduct
              canViewProduct={canViewProduct}
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
