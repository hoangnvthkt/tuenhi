import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useState } from 'react';
import { createStockCountApi } from '../api/stock-count-api';
import { statusLabel } from '../../model/inventory-ui';

export function StockCountListPage() {
  const [api] = useState(createStockCountApi);
  const [status, setStatus] = useState('');
  const query = useQuery({
    queryKey: ['stock-counts', status],
    queryFn: () => api.list(status || undefined),
  });
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kiểm kho</h1>
          <p className="text-sm text-slate-600">
            Kiểm từng phần danh mục, owner ghi sổ chênh lệch sau khi đối soát.
          </p>
        </div>
        <Link
          to="/stock-counts/new"
          className="min-h-11 rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white"
        >
          Tạo phiếu kiểm
        </Link>
      </div>
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="mb-4 min-h-11 rounded-lg border border-slate-300 px-3"
      >
        <option value="">Tất cả trạng thái</option>
        <option value="DRAFT">Nháp</option>
        <option value="COUNTED">Đã kiểm đếm</option>
        <option value="POSTED">Đã ghi sổ</option>
        <option value="CANCELLED">Đã hủy</option>
      </select>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {query.data?.items.map((item) => (
          <Link
            key={item.id}
            to={`/stock-counts/${item.id}`}
            className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 hover:bg-slate-50"
          >
            <div>
              <p className="font-medium">
                {item.countNumber ?? 'Phiếu kiểm kho nháp'}
              </p>
              <p className="text-sm text-slate-600">
                {item.createdByName} · {item.lineCount} sản phẩm
              </p>
            </div>
            <p className="text-sm font-semibold">{statusLabel[item.status]}</p>
          </Link>
        ))}
        {query.isLoading ? (
          <p className="p-5 text-sm text-slate-500">Đang tải phiếu kiểm kho…</p>
        ) : null}
        {query.data && query.data.items.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            Chưa có phiếu kiểm kho phù hợp.
          </p>
        ) : null}
      </section>
    </main>
  );
}
