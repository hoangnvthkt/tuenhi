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
  ContextTabs,
  createCustomerExplorerApi,
  CustomerProductsList,
  CustomerReturnsList,
  CustomerSalesList,
  customerExplorerKeys,
  EntityActionBar,
  LoadMoreButton,
  parseCustomerContextUrl,
  RelationshipKpis,
  SectionState,
  type CustomerDetail,
  type CustomerExplorerApi,
  type CustomerReturnsCursor,
  type CustomerSalesCursor,
  type CustomerProductsCursor,
} from '@/features/connected-explorer';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { formatViDecimal } from '@/shared/lib/numeric/canonical-number';
import { useToast } from '@/shared/ui/feedback/use-toast';
import {
  createDirectoryApi,
  type CustomerItem,
  type DirectoryApi,
} from '../api/directory-api';
import { CustomerForm } from '../components/CustomerForm';

function readablePhone(value: string | null) {
  if (!value) return 'Chưa có';
  try {
    return parsePhoneNumber(value).formatInternational();
  } catch {
    return value;
  }
}

function customerItem(detail: CustomerDetail): CustomerItem {
  return {
    id: detail.id,
    code: detail.code,
    customerType: detail.customerType,
    name: detail.name,
    phone: detail.phone,
    email: detail.email,
    address: detail.address,
    companyName: detail.companyName,
    taxCode: detail.taxCode,
    customerGroup: detail.customerGroup,
    notes: detail.notes,
    isActive: detail.isActive,
    version: detail.version,
  };
}

function money(value: string) {
  return `${formatViDecimal(value, 2)} ₫`;
}

function shortDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : '—';
}

export function CustomerDetailPage({
  mode = 'view',
  api: apiProp,
  directoryApi: directoryApiProp,
}: {
  mode?: 'view' | 'edit';
  api?: CustomerExplorerApi;
  directoryApi?: DirectoryApi;
}) {
  const privateKey = usePrivateQueryKey();
  const { customerId } = useParams();
  const [api] = useState(() => apiProp ?? createCustomerExplorerApi());
  const [directoryApi] = useState(
    () => directoryApiProp ?? createDirectoryApi(),
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const contextUrl = parseCustomerContextUrl(searchParams);
  const contextUrlKey = contextUrl.canonical.toString();
  const { session } = useSession();
  const online = useOnlineStatus();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canManage = session?.permissions.includes('customer.manage') ?? false;
  const canSell = session?.permissions.includes('sale.draft.manage') ?? false;
  const canViewProduct = session?.permissions.includes('catalog.read') ?? false;
  const canViewReturn =
    session?.permissions.includes('return.request.create') ?? false;

  useEffect(() => {
    if (contextUrl.changed) setSearchParams(contextUrlKey, { replace: true });
  }, [contextUrl.changed, contextUrlKey, setSearchParams]);

  const detailQuery = useQuery({
    queryKey: privateKey(
      ...customerExplorerKeys.detail({
        customerId: customerId ?? 'missing',
        from: contextUrl.value.from,
        to: contextUrl.value.to,
      }),
    ),
    queryFn: () =>
      api.customerDetail({
        customerId: customerId!,
        from: contextUrl.value.from ?? undefined,
        to: contextUrl.value.to ?? undefined,
      }),
    enabled: Boolean(customerId),
  });
  const salesScope = detailQuery.data?.salesScope ?? 'NONE';
  const canReadTransactions = salesScope !== 'NONE';

  useEffect(() => {
    if (
      detailQuery.data?.salesScope === 'NONE' &&
      contextUrl.value.tab !== 'overview'
    ) {
      const next = new URLSearchParams(contextUrlKey);
      next.delete('tab');
      next.delete('q');
      setSearchParams(next, { replace: true });
    }
  }, [contextUrl.value.tab, contextUrlKey, detailQuery.data, setSearchParams]);

  const salesLimit = contextUrl.value.tab === 'overview' ? 5 : 25;
  const salesQuery = useInfiniteQuery({
    queryKey: privateKey(
      ...customerExplorerKeys.sales({
        customerId,
        from: contextUrl.value.from,
        to: contextUrl.value.to,
        limit: salesLimit,
      }),
    ),
    queryFn: ({ pageParam }) =>
      api.customerSales({
        customerId: customerId!,
        from: contextUrl.value.from ?? undefined,
        to: contextUrl.value.to ?? undefined,
        cursor: pageParam,
        limit: salesLimit,
      }),
    initialPageParam: undefined as CustomerSalesCursor | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled:
      mode === 'view' &&
      Boolean(customerId) &&
      canReadTransactions &&
      (contextUrl.value.tab === 'overview' || contextUrl.value.tab === 'sales'),
    placeholderData: keepPreviousData,
  });
  const returnsLimit = contextUrl.value.tab === 'overview' ? 5 : 25;
  const returnsQuery = useInfiniteQuery({
    queryKey: privateKey(
      ...customerExplorerKeys.returns({
        customerId,
        from: contextUrl.value.from,
        to: contextUrl.value.to,
        limit: returnsLimit,
      }),
    ),
    queryFn: ({ pageParam }) =>
      api.customerReturns({
        customerId: customerId!,
        from: contextUrl.value.from ?? undefined,
        to: contextUrl.value.to ?? undefined,
        cursor: pageParam,
        limit: returnsLimit,
      }),
    initialPageParam: undefined as CustomerReturnsCursor | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled:
      mode === 'view' &&
      Boolean(customerId) &&
      canReadTransactions &&
      (contextUrl.value.tab === 'overview' ||
        contextUrl.value.tab === 'returns'),
    placeholderData: keepPreviousData,
  });
  const productsQuery = useInfiniteQuery({
    queryKey: privateKey(
      ...customerExplorerKeys.products({
        customerId,
        search: contextUrl.value.q,
        from: contextUrl.value.from,
        to: contextUrl.value.to,
        limit: 25,
      }),
    ),
    queryFn: ({ pageParam }) =>
      api.customerProducts({
        customerId: customerId!,
        search: contextUrl.value.q || undefined,
        from: contextUrl.value.from ?? undefined,
        to: contextUrl.value.to ?? undefined,
        cursor: pageParam,
        limit: 25,
      }),
    initialPageParam: undefined as CustomerProductsCursor | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled:
      mode === 'view' &&
      Boolean(customerId) &&
      canReadTransactions &&
      contextUrl.value.tab === 'products',
    placeholderData: keepPreviousData,
  });

  if (detailQuery.isPending) {
    return (
      <p role="status" className="p-5 text-sm text-slate-600">
        Đang tải khách hàng…
      </p>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"
      >
        <h1 className="text-lg font-bold">Không thể tải khách hàng.</h1>
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
          to={`/more/customers/${detail.id}`}
          className="text-sm font-semibold text-teal-800"
        >
          ← Chi tiết khách hàng
        </Link>
        <CustomerForm
          api={directoryApi}
          isOnline={online}
          item={customerItem(detail)}
          onCancel={() => navigate(`/more/customers/${detail.id}`)}
          onSaved={async () => {
            await refreshOperationalData(queryClient);
            toast.show({ kind: 'success', title: 'Đã lưu khách hàng' });
            navigate(`/more/customers/${detail.id}`);
          }}
        />
      </section>
    );
  }

  const sales = salesQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const returns = returnsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const products =
    productsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const canViewSale = salesScope !== 'NONE';
  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(contextUrl.canonical);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next);
  };
  const activity = [
    ...sales.map((item) => ({
      id: `sale:${item.saleId}`,
      completedAt: item.completedAt,
      label: item.saleNumber,
      to: `/sales/${item.saleId}`,
      amount: item.effectiveNetTotal,
      kind: 'Hóa đơn',
      canLink: canViewSale,
    })),
    ...returns.map((item) => ({
      id: `return:${item.returnId}`,
      completedAt: item.completedAt,
      label: item.returnNumber,
      to: `/returns/${item.returnId}`,
      amount: item.refundTotal,
      kind: 'Phiếu trả',
      canLink: canViewReturn,
    })),
  ]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, 5);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/more/customers"
            className="text-sm font-semibold text-teal-800 hover:underline"
          >
            ← Khách hàng
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{detail.name}</h1>
            {!detail.isActive ? (
              <span className="rounded bg-slate-200 px-2 py-1 text-xs font-semibold">
                Ngừng hoạt động
              </span>
            ) : null}
            {salesScope === 'OWN' ? (
              <span className="rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-900">
                Giao dịch của tôi
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-sm text-slate-600">
            {detail.code ?? 'Chưa có mã'}
          </p>
        </div>
        <EntityActionBar>
          {canSell && detail.isActive ? (
            <ActionLink to={`/pos?customerId=${detail.id}`}>
              Bán cho khách này
            </ActionLink>
          ) : null}
          {canManage ? (
            <ActionLink to={`/more/customers/${detail.id}/edit`}>
              Sửa khách hàng
            </ActionLink>
          ) : null}
        </EntityActionBar>
      </div>

      <ContextTabs
        current={contextUrl.value.tab}
        params={contextUrl.canonical}
        tabs={[
          { id: 'overview', label: 'Tổng quan' },
          ...(canReadTransactions
            ? [
                { id: 'sales', label: 'Hóa đơn' },
                { id: 'returns', label: 'Phiếu trả' },
                { id: 'products', label: 'Sản phẩm' },
              ]
            : []),
        ]}
      />

      {contextUrl.value.tab === 'overview' ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">Hồ sơ khách hàng</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs uppercase text-slate-500">Loại</dt>
                <dd className="mt-1">
                  {detail.customerType === 'BUSINESS'
                    ? 'Doanh nghiệp'
                    : 'Cá nhân'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Điện thoại</dt>
                <dd className="mt-1">{readablePhone(detail.phone)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Email</dt>
                <dd className="mt-1">{detail.email ?? 'Chưa có'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Công ty</dt>
                <dd className="mt-1">{detail.companyName ?? 'Chưa có'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Mã số thuế</dt>
                <dd className="mt-1">{detail.taxCode ?? 'Chưa có'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Nhóm khách</dt>
                <dd className="mt-1">{detail.customerGroup ?? 'Chưa có'}</dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs uppercase text-slate-500">Địa chỉ</dt>
                <dd className="mt-1">{detail.address ?? 'Chưa có'}</dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-xs uppercase text-slate-500">Ghi chú</dt>
                <dd className="mt-1 whitespace-pre-wrap">
                  {detail.notes ?? 'Chưa có'}
                </dd>
              </div>
            </dl>
          </div>
          {detail.purchaseSummary ? (
            <>
              <RelationshipKpis
                items={[
                  { label: 'Số đơn', value: detail.purchaseSummary.orderCount },
                  {
                    label: 'Chi tiêu thuần',
                    value: money(detail.purchaseSummary.netSpend),
                  },
                  {
                    label: 'Đã hoàn',
                    value: money(detail.purchaseSummary.returnedTotal),
                  },
                  {
                    label: 'Mua gần nhất',
                    value: shortDate(detail.purchaseSummary.lastPurchaseAt),
                  },
                ]}
              />
              <section className="space-y-3">
                <h2 className="font-bold">Hoạt động gần nhất</h2>
                {salesQuery.isError || returnsQuery.isError ? (
                  <SectionState pending={false} error empty={false} />
                ) : null}
                <SectionState
                  pending={salesQuery.isPending || returnsQuery.isPending}
                  error={false}
                  empty={
                    !salesQuery.isPending &&
                    !returnsQuery.isPending &&
                    activity.length === 0
                  }
                />
                {activity.length ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <ul className="divide-y divide-slate-200">
                      {activity.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 p-4"
                        >
                          <div>
                            <p className="text-xs text-slate-500">
                              {item.kind}
                            </p>
                            {item.canLink ? (
                              <Link
                                to={item.to}
                                className="font-semibold text-teal-800 hover:underline"
                              >
                                {item.label}
                              </Link>
                            ) : (
                              <strong>{item.label}</strong>
                            )}
                          </div>
                          <p className="font-semibold tabular-nums">
                            {money(item.amount)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </>
      ) : null}

      {canReadTransactions ? (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
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
      ) : null}

      {contextUrl.value.tab === 'sales' && canReadTransactions ? (
        <section className="space-y-3">
          <SectionState
            pending={salesQuery.isPending}
            error={salesQuery.isError}
            empty={!salesQuery.isPending && sales.length === 0}
            onRetry={() => void salesQuery.refetch()}
          />
          {sales.length ? (
            <CustomerSalesList items={sales} canViewSale={canViewSale} />
          ) : null}
          {salesQuery.hasNextPage ? (
            <LoadMoreButton
              loading={salesQuery.isFetchingNextPage}
              onClick={() => void salesQuery.fetchNextPage()}
            />
          ) : null}
        </section>
      ) : null}

      {contextUrl.value.tab === 'returns' && canReadTransactions ? (
        <section className="space-y-3">
          <SectionState
            pending={returnsQuery.isPending}
            error={returnsQuery.isError}
            empty={!returnsQuery.isPending && returns.length === 0}
            onRetry={() => void returnsQuery.refetch()}
          />
          {returns.length ? (
            <CustomerReturnsList
              items={returns}
              canViewReturn={canViewReturn}
              canViewSale={canViewSale}
              canViewProduct={canViewProduct}
            />
          ) : null}
          {returnsQuery.hasNextPage ? (
            <LoadMoreButton
              loading={returnsQuery.isFetchingNextPage}
              onClick={() => void returnsQuery.fetchNextPage()}
            />
          ) : null}
        </section>
      ) : null}

      {contextUrl.value.tab === 'products' && canReadTransactions ? (
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
              Tìm sản phẩm
              <input
                key={contextUrl.value.q}
                name="q"
                defaultValue={contextUrl.value.q}
                placeholder="SKU hoặc tên sản phẩm"
                className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
              />
            </label>
            <button className="mt-7 min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">
              Tìm kiếm
            </button>
          </form>
          <SectionState
            pending={productsQuery.isPending}
            error={productsQuery.isError}
            empty={!productsQuery.isPending && products.length === 0}
            onRetry={() => void productsQuery.refetch()}
          />
          {products.length ? (
            <CustomerProductsList
              items={products}
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
    </section>
  );
}
