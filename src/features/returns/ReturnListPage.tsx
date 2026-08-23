import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useState } from 'react';
import { createSalesApi } from '../sales/sales-api';

const money = (value: string) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(value));

const label: Record<string, string> = {
  REQUESTED: 'Chờ kiểm nhận',
  COMPLETED: 'Đã hoàn tất',
  CANCELLED: 'Đã hủy',
  DRAFT: 'Nháp',
};

export function ReturnListPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['sale-returns', search, status],
    queryFn: () => createSalesApi().listReturns({ search, status }),
  });

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trả hàng</h1>
          <p className="text-sm text-slate-600">
            Tạo, theo dõi và kiểm nhận hàng trả theo hóa đơn gốc.
          </p>
        </div>
        <Link
          to="/returns/new"
          className="min-h-11 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white"
        >
          Tạo yêu cầu trả
        </Link>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_180px]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Mã phiếu TH hoặc hóa đơn HD"
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="min-h-11 rounded-lg border border-slate-300 px-3"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="REQUESTED">Chờ kiểm nhận</option>
          <option value="COMPLETED">Đã hoàn tất</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {query.data?.items.map((item) => (
          <Link
            key={item.id}
            to={`/returns/${item.id}`}
            className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 hover:bg-slate-50"
          >
            <div>
              <p className="font-medium">
                {item.returnNumber ?? 'Yêu cầu trả hàng'} · {item.saleNumber}
              </p>
              <p className="text-sm text-slate-600">
                {item.createdByName} · {label[item.status] ?? item.status}
              </p>
            </div>
            <p className="text-right font-semibold">
              {money(item.refundTotal)}
            </p>
          </Link>
        ))}
        {query.isLoading ? (
          <p className="p-5 text-sm text-slate-500">
            Đang tải yêu cầu trả hàng…
          </p>
        ) : null}
        {query.data && query.data.items.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Chưa có yêu cầu trả hàng phù hợp.
          </p>
        ) : null}
      </section>
    </main>
  );
}
