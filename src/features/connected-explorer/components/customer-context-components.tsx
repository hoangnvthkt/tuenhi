import { Link } from 'react-router';
import { formatViDecimal } from '@/shared/lib/numeric/canonical-number';
import type {
  CustomerProductItem,
  CustomerReturnItem,
  CustomerSaleItem,
} from '../api/customer-explorer-api';

function money(value: string) {
  return `${formatViDecimal(value, 2)} ₫`;
}

function quantity(value: string) {
  return formatViDecimal(value, 3);
}

function completedDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function CustomerSalesList({
  items,
  canViewSale,
}: {
  items: CustomerSaleItem[];
  canViewSale: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <ul className="divide-y divide-slate-200">
        {items.map((item) => (
          <li
            key={item.saleId}
            className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"
          >
            <div>
              {canViewSale ? (
                <Link
                  to={`/sales/${item.saleId}`}
                  className="font-bold text-teal-800 hover:underline"
                >
                  {item.saleNumber}
                </Link>
              ) : (
                <strong>{item.saleNumber}</strong>
              )}
              <p className="mt-1 text-xs text-slate-600">
                {completedDate(item.completedAt)} · {item.channelName} ·{' '}
                {item.createdByName}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {item.status} · {item.paymentMethod} · {item.paymentStatus}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold tabular-nums">
                {money(item.effectiveNetTotal)}
              </p>
              {item.returnedTotal !== '0' ? (
                <p className="mt-1 text-xs text-slate-600">
                  Đã hoàn {money(item.returnedTotal)}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CustomerReturnsList({
  items,
  canViewReturn,
  canViewSale,
  canViewProduct,
}: {
  items: CustomerReturnItem[];
  canViewReturn: boolean;
  canViewSale: boolean;
  canViewProduct: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <ul className="divide-y divide-slate-200">
        {items.map((item) => (
          <li key={item.returnId} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                {canViewReturn ? (
                  <Link
                    to={`/returns/${item.returnId}`}
                    className="font-bold text-teal-800 hover:underline"
                  >
                    {item.returnNumber}
                  </Link>
                ) : (
                  <strong>{item.returnNumber}</strong>
                )}
                <p className="mt-1 text-xs text-slate-600">
                  {completedDate(item.completedAt)} · {item.refundMethod}
                </p>
                <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
              </div>
              <p className="font-bold tabular-nums">
                {money(item.refundTotal)}
              </p>
            </div>
            <p className="text-xs text-slate-600">
              Hóa đơn:{' '}
              {canViewSale ? (
                <Link
                  to={`/sales/${item.saleId}`}
                  className="font-semibold text-teal-800 hover:underline"
                >
                  {item.saleNumber}
                </Link>
              ) : (
                item.saleNumber
              )}
            </p>
            <ul className="space-y-1 text-sm">
              {item.lines.map((line) => (
                <li key={line.lineId} className="flex justify-between gap-3">
                  <span>
                    {canViewProduct ? (
                      <Link
                        to={`/products/${line.productId}`}
                        className="text-teal-800 hover:underline"
                      >
                        {line.productName}
                      </Link>
                    ) : (
                      line.productName
                    )}{' '}
                    <span className="text-xs text-slate-500">{line.sku}</span>
                  </span>
                  <span className="tabular-nums">
                    {quantity(line.acceptedQty)} {line.unitName}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CustomerProductsList({
  items,
  canViewProduct,
}: {
  items: CustomerProductItem[];
  canViewProduct: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-600">
          <tr>
            <th className="px-4 py-3">Sản phẩm</th>
            <th className="px-4 py-3 text-right">SL thuần</th>
            <th className="px-4 py-3 text-right">Chi tiêu thuần</th>
            <th className="px-4 py-3">Mua gần nhất</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((item) => (
            <tr key={item.productId}>
              <td className="px-4 py-3">
                {canViewProduct ? (
                  <Link
                    to={`/products/${item.productId}`}
                    className="font-bold text-teal-800 hover:underline"
                  >
                    {item.productName}
                  </Link>
                ) : (
                  <strong>{item.productName}</strong>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {item.sku} · {item.orderCount} hóa đơn
                </p>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {quantity(item.netPurchasedQty)} {item.unitName}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {money(item.netPurchasedAmount)}
              </td>
              <td className="px-4 py-3">
                {completedDate(item.lastPurchasedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
