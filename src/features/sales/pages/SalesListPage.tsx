import { useCursorList } from '@/shared/hooks/use-cursor-list';
import { ListPagination } from '@/shared/ui/feedback/ListPagination';
import { usePrivateQueryKey } from '@/features/auth';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useEffect, useState } from 'react';
import { createSalesApi } from '../api/sales-api';
const money = (v: string) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(v));
const statusLabels: Record<string, string> = {
  DRAFT: 'Nháp',
  COMPLETED: 'Hoàn tất',
  PARTIALLY_RETURNED: 'Trả một phần',
  RETURNED: 'Đã trả hết',
  CANCELLED: 'Đã hủy',
};
export function SalesListPage() {
  const privateKey = usePrivateQueryKey();
  const [api] = useState(createSalesApi);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const query = useCursorList({
    queryKey: privateKey(...['sales', debouncedSearch, status]),
    load: (cursor: { sortAt: string; id: string } | undefined) =>
      api.list({ search: debouncedSearch, status }, cursor),
    id: (item) => item.id,
  });
  const updateParams = (nextSearch: string, nextStatus: string) => {
    setSearchParams(
      () => {
        const next = new URLSearchParams();
        if (nextSearch) next.set('q', nextSearch);
        if (nextStatus) next.set('status', nextStatus);
        return next;
      },
      { replace: true },
    );
  };
  const openExactInvoice = () => {
    if (search.trim() !== debouncedSearch.trim()) return;
    const normalized = search.trim().toLocaleLowerCase('vi');
    const exact = query.items.filter(
      (item) => item.saleNumber?.trim().toLocaleLowerCase('vi') === normalized,
    );
    if (exact.length !== 1) return;
    const item = exact[0]!;
    navigate(item.status === 'DRAFT' ? `/pos/${item.id}` : `/sales/${item.id}`);
  };
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Hóa đơn</h1>
          <p className="text-sm text-slate-600">
            Tra cứu hóa đơn và bản nháp theo quyền của bạn.
          </p>
        </div>
        <Link
          to="/pos"
          className="min-h-11 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white"
        >
          Bán hàng
        </Link>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]">
        <label className="text-sm font-medium">
          <span className="sr-only">Tìm hóa đơn</span>
          <input
            aria-label="Tìm hóa đơn"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              updateParams(event.target.value, status);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                openExactInvoice();
              }
            }}
            placeholder="Mã hóa đơn, khách hàng hoặc sản phẩm"
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </label>
        <label className="text-sm font-medium">
          <span className="sr-only">Trạng thái hóa đơn</span>
          <select
            aria-label="Trạng thái hóa đơn"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              updateParams(search, event.target.value);
            }}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">Nháp</option>
            <option value="COMPLETED">Hoàn tất</option>
            <option value="PARTIALLY_RETURNED">Trả một phần</option>
            <option value="RETURNED">Đã trả hết</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </label>
      </div>
      {query.isFetching && !query.isLoading ? (
        <p role="status" className="mb-3 text-sm text-slate-500">
          Đang cập nhật danh sách…
        </p>
      ) : null}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {query.items.map((item) => (
          <Link
            key={item.id}
            to={
              item.status === 'DRAFT' ? `/pos/${item.id}` : `/sales/${item.id}`
            }
            className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 hover:bg-slate-50"
          >
            <div>
              <p className="font-medium">
                {item.saleNumber ?? `Nháp ${item.id.slice(0, 8).toUpperCase()}`}
              </p>
              <p className="text-sm text-slate-600">
                {item.customerName ?? 'Khách lẻ'} · {item.channelName} ·{' '}
                {item.createdByName}
              </p>
              {Number.isFinite(Date.parse(item.sortAt)) ? (
                <time className="text-xs text-slate-500" dateTime={item.sortAt}>
                  {new Intl.DateTimeFormat('vi-VN', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(item.sortAt))}
                </time>
              ) : null}
            </div>
            <div className="text-right">
              <p className="font-semibold">{money(item.netTotal)}</p>
              <p className="text-xs text-slate-500">
                {statusLabels[item.status] ?? item.status}
              </p>
            </div>
          </Link>
        ))}
        {query.isLoading ? (
          <p className="p-5 text-sm text-slate-500">Đang tải hóa đơn…</p>
        ) : null}
        {query.isSuccess && !query.items.length ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Chưa có hóa đơn phù hợp.
          </p>
        ) : null}
      </section>
      <ListPagination
        query={query}
        errorMessage="Không thể tải danh sách hóa đơn."
      />
    </main>
  );
}
