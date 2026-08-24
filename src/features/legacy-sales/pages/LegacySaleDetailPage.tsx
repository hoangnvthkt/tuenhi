import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatViNumber } from '@/shared/lib/numeric/canonical-number';
import {
  createLegacySalesApi,
  type LegacySalesApi,
} from '../api/legacy-sales-api';

function money(value: string | null) {
  return value === null ? 'Không có dữ liệu' : `${formatViNumber(value)} ₫`;
}

function provenance(value: 'SOURCE_VALUE' | 'CACHED_UNVERIFIED' | null) {
  if (value === 'CACHED_UNVERIFIED') return 'Cache chưa xác minh';
  if (value === 'SOURCE_VALUE') return 'Giá trị nguồn';
  return 'Không có dữ liệu';
}

export function LegacySaleDetailPage({
  api: apiProp,
}: {
  api?: LegacySalesApi;
}) {
  const [api] = useState(() => apiProp ?? createLegacySalesApi());
  const { legacySaleId } = useParams();
  const query = useQuery({
    queryKey: ['legacy-sale', legacySaleId],
    queryFn: () => api.detail(legacySaleId ?? ''),
    enabled: Boolean(legacySaleId),
  });
  const sale = query.data;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/legacy-sales"
            className="text-sm font-semibold text-teal-800 hover:underline"
          >
            ← Dữ liệu cũ
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            {sale?.sourceSaleNumber ?? 'Chi tiết dữ liệu cũ'}
          </h1>
        </div>
        <span className="rounded-md bg-amber-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white">
          Chỉ để tra cứu
        </span>
      </div>
      {query.isPending ? (
        <p
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600"
        >
          Đang tải chi tiết…
        </p>
      ) : null}
      {query.isError ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-5 text-sm text-red-800"
        >
          Không thể tải chi tiết dữ liệu cũ.
        </p>
      ) : null}
      {sale ? (
        <>
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            Số liệu và trạng thái bên dưới là nhãn từ nguồn, không phải chứng từ
            ghi sổ chính thức.
          </div>
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Ngày nguồn</p>
              <p className="mt-1 font-semibold">
                {sale.soldOn ?? 'Không xác định'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Nhân viên nguồn</p>
              <p className="mt-1 font-semibold">
                {sale.staffLabel || 'Không có'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Kênh nguồn</p>
              <p className="mt-1 font-semibold">
                {sale.channelLabel || 'Không có'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Khách nguồn</p>
              <p className="mt-1 font-semibold">
                {sale.customerLabel || 'Không có'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Thanh toán nguồn</p>
              <p className="mt-1 font-semibold">
                {sale.paymentLabel || 'Không có'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Trạng thái nguồn</p>
              <p className="mt-1 font-semibold">
                {sale.sourceStatusLabel || 'Không có'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Dòng bắt đầu</p>
              <p className="mt-1 font-semibold">{sale.sourceRowStart}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Tổng nguồn</p>
              <p className="mt-1 font-semibold tabular-nums">
                {money(sale.reportedNetTotal)}
              </p>
            </div>
          </div>
          {sale.warningCodes.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-white p-5">
              <h2 className="font-bold">Cảnh báo chất lượng</h2>
              <ul className="mt-3 space-y-2">
                {sale.warningCodes.map((code) => (
                  <li key={code}>
                    <code className="text-xs text-amber-900">{code}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Nguồn</th>
                  <th className="px-4 py-3">Sản phẩm</th>
                  <th className="px-4 py-3 text-right">SL</th>
                  <th className="px-4 py-3 text-right">Đơn giá nguồn</th>
                  <th className="px-4 py-3 text-right">Thành tiền nguồn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sale.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-3">
                      <p>Dòng nguồn {line.sourceRowNumber}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {provenance(line.lineTotalProvenance)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{line.productLabel}</p>
                      <code className="text-xs text-slate-500">
                        {line.productCode}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {line.quantity ? formatViNumber(line.quantity) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="tabular-nums">{money(line.unitPrice)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {provenance(line.unitPriceProvenance)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="tabular-nums">{money(line.lineTotal)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {provenance(line.lineTotalProvenance)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="rounded-xl border border-slate-200 bg-white p-5 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold">
              Nguồn và provenance
            </summary>
            <dl className="mt-3 space-y-2">
              <div>
                <dt>Adapter</dt>
                <dd>
                  <code>{sale.adapterId}</code>
                </dd>
              </div>
              <div>
                <dt>Phiên nhập</dt>
                <dd>
                  <code>{sale.sourceImportRunId}</code>
                </dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd>
                  <code className="break-all">{sale.sourceFileSha256}</code>
                </dd>
              </div>
            </dl>
          </details>
        </>
      ) : null}
    </section>
  );
}
