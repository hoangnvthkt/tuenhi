import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { createSalesApi } from './sales-api';
const money = (v: string) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(v));
export function SalesListPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['sales', search, status],
    queryFn: () => createSalesApi().list({ search, status }),
  });
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Mã hóa đơn, khách hàng hoặc sản phẩm"
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="DRAFT">Nháp</option>
          <option value="COMPLETED">Hoàn tất</option>
        </select>
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {query.data?.items.map((item) => (
          <Link
            key={item.id}
            to={
              item.status === 'DRAFT' ? `/pos/${item.id}` : `/sales/${item.id}`
            }
            className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 hover:bg-slate-50"
          >
            <div>
              <p className="font-medium">{item.saleNumber ?? 'Hóa đơn nháp'}</p>
              <p className="text-sm text-slate-600">
                {item.customerName ?? 'Khách lẻ'} · {item.channelName} ·{' '}
                {item.createdByName}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{money(item.netTotal)}</p>
              <p className="text-xs text-slate-500">
                {item.status === 'DRAFT' ? 'Nháp' : 'Hoàn tất'}
              </p>
            </div>
          </Link>
        ))}
        {query.isLoading ? (
          <p className="p-5 text-sm text-slate-500">Đang tải hóa đơn…</p>
        ) : null}
        {query.data && !query.data.items.length ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Chưa có hóa đơn phù hợp.
          </p>
        ) : null}
      </section>
    </main>
  );
}
