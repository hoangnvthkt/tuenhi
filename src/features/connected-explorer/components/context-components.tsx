import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { formatViDecimal } from '@/shared/lib/numeric/canonical-number';
import type {
  ProductSupplierItem,
  PurchaseHistoryItem,
  SupplierProductItem,
} from '../api/connected-explorer-api';

export function EntityActionBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function ActionLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center rounded-lg border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50"
    >
      {children}
    </Link>
  );
}

export function ContextTabs({
  current,
  tabs,
  params,
}: {
  current: string;
  tabs: Array<{ id: string; label: string }>;
  params: URLSearchParams;
}) {
  return (
    <nav
      aria-label="Dữ liệu liên quan"
      className="overflow-x-auto border-b border-slate-200"
    >
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const next = new URLSearchParams(params);
          if (tab.id === 'overview') next.delete('tab');
          else next.set('tab', tab.id);
          return (
            <Link
              key={tab.id}
              to={{ search: next.toString() }}
              aria-current={current === tab.id ? 'page' : undefined}
              className={`min-h-11 border-b-2 px-4 py-3 text-sm font-semibold ${
                current === tab.id
                  ? 'border-teal-700 text-teal-900'
                  : 'border-transparent text-slate-600 hover:text-slate-950'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function RelationshipKpis({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {item.label}
          </p>
          <p className="mt-2 text-xl font-bold tabular-nums text-slate-950">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function money(value: string) {
  return `${formatViDecimal(value, 2)} ₫`;
}

function quantity(value: string) {
  return formatViDecimal(value, 3);
}

function receivedDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function SectionState({
  pending,
  error,
  empty,
  onRetry,
}: {
  pending: boolean;
  error: boolean;
  empty: boolean;
  onRetry?: () => void;
}) {
  if (pending)
    return (
      <p role="status" className="p-4 text-sm text-slate-600">
        Đang tải dữ liệu liên quan…
      </p>
    );
  if (error)
    return (
      <div
        role="alert"
        className="rounded-lg bg-red-50 p-4 text-sm text-red-800"
      >
        <p>Không thể tải phần dữ liệu này.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold"
          >
            Thử lại
          </button>
        ) : null}
      </div>
    );
  if (empty)
    return (
      <p className="p-4 text-sm text-slate-600">
        Chưa có dữ liệu từ phiếu nhập đã ghi sổ.
      </p>
    );
  return null;
}

export function SupplierRelationshipList({
  items,
  productId,
  canViewSupplier,
  canCreatePurchase,
}: {
  items: ProductSupplierItem[];
  productId: string;
  canViewSupplier: boolean;
  canCreatePurchase: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <ul className="divide-y divide-slate-200">
        {items.map((item) => (
          <li
            key={item.supplierId}
            className="grid gap-3 p-4 lg:grid-cols-[1fr_auto_auto] lg:items-center"
          >
            <div>
              {canViewSupplier ? (
                <Link
                  to={`/more/suppliers/${item.supplierId}`}
                  className="font-bold text-teal-800 hover:underline"
                >
                  {item.supplierName}
                </Link>
              ) : (
                <strong>{item.supplierName}</strong>
              )}
              <p className="mt-1 text-xs text-slate-600">
                {item.supplierCode ?? 'Chưa có mã'} · {item.postedReceiptCount}{' '}
                phiếu · {quantity(item.totalReceivedQty)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Lần gần nhất {receivedDate(item.lastReceivedAt)}
              </p>
            </div>
            <div className="text-sm">
              <Link
                to={`/more/purchases/${item.latestReceiptId}`}
                className="font-semibold text-teal-800 hover:underline"
              >
                {item.latestReceiptNumber ?? 'Phiếu nhập'}
              </Link>
              {item.canReadCost && item.latestUnitCost !== null ? (
                <p className="mt-1 text-xs text-slate-600">
                  Đơn giá gần nhất: {money(item.latestUnitCost)}
                </p>
              ) : null}
            </div>
            {canCreatePurchase ? (
              <ActionLink
                to={`/more/purchases/new?productId=${productId}&supplierId=${item.supplierId}`}
              >
                Nhập từ NCC này
              </ActionLink>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SupplierProductList({
  items,
  canViewProduct,
}: {
  items: SupplierProductItem[];
  canViewProduct: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <ul className="divide-y divide-slate-200">
        {items.map((item) => (
          <li
            key={item.productId}
            className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center"
          >
            <div>
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
              <p className="mt-1 text-xs text-slate-600">
                {item.sku} · {item.postedReceiptCount} phiếu ·{' '}
                {quantity(item.totalReceivedQty)} {item.unitName}
              </p>
            </div>
            <div className="text-sm lg:text-right">
              <Link
                to={`/more/purchases/${item.latestReceiptId}`}
                className="font-semibold text-teal-800 hover:underline"
              >
                {item.latestReceiptNumber ?? 'Phiếu nhập'}
              </Link>
              {item.canReadCost && item.latestUnitCost !== null ? (
                <p className="mt-1 text-xs text-slate-600">
                  Đơn giá gần nhất: {money(item.latestUnitCost)}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PostedPurchaseHistory({
  items,
  showSupplier,
  showProduct,
  canViewSupplier,
  canViewProduct,
}: {
  items: PurchaseHistoryItem[];
  showSupplier: boolean;
  showProduct: boolean;
  canViewSupplier: boolean;
  canViewProduct: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Phiếu nhập</th>
            {showSupplier ? <th className="px-4 py-3">Nhà cung cấp</th> : null}
            {showProduct ? <th className="px-4 py-3">Sản phẩm</th> : null}
            <th className="px-4 py-3 text-right">Số lượng</th>
            {items.some((item) => item.canReadCost) ? (
              <th className="px-4 py-3 text-right">Đơn giá</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((item) => (
            <tr key={item.lineId}>
              <td className="px-4 py-3">
                <Link
                  to={`/more/purchases/${item.receiptId}`}
                  className="font-semibold text-teal-800 hover:underline"
                >
                  {item.receiptNumber}
                </Link>
                <p className="mt-1 text-xs text-slate-500">
                  {receivedDate(item.receivedAt)}
                </p>
              </td>
              {showSupplier ? (
                <td className="px-4 py-3">
                  {item.supplierId && canViewSupplier ? (
                    <Link
                      to={`/more/suppliers/${item.supplierId}`}
                      className="text-teal-800 hover:underline"
                    >
                      {item.supplierName ?? 'Nhà cung cấp'}
                    </Link>
                  ) : (
                    (item.supplierName ?? 'Không chọn nhà cung cấp')
                  )}
                </td>
              ) : null}
              {showProduct ? (
                <td className="px-4 py-3">
                  {canViewProduct ? (
                    <Link
                      to={`/products/${item.productId}`}
                      className="text-teal-800 hover:underline"
                    >
                      {item.productName}
                    </Link>
                  ) : (
                    item.productName
                  )}
                  <p className="mt-1 text-xs text-slate-500">{item.sku}</p>
                </td>
              ) : null}
              <td className="px-4 py-3 text-right tabular-nums">
                {quantity(item.receivedQty)} {item.unitName}
              </td>
              {items.some((entry) => entry.canReadCost) ? (
                <td className="px-4 py-3 text-right tabular-nums">
                  {item.canReadCost && item.unitCost !== null
                    ? money(item.unitCost)
                    : '—'}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LoadMoreButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex justify-center pt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-60"
      >
        {loading ? 'Đang tải…' : 'Tải thêm'}
      </button>
    </div>
  );
}
