import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  createImportApi,
  type ImportApi,
  type ImportHistoryPage as ImportHistoryData,
  type ImportRunResult,
} from './import-api';

const targetLabels = {
  CATEGORIES: 'Nhóm hàng',
  PRODUCTS: 'Sản phẩm',
  SUPPLIERS: 'Nhà cung cấp',
  CUSTOMERS: 'Khách hàng',
} as const;
const statusLabels = {
  UPLOADED: 'Đã chọn tệp',
  MAPPED: 'Đã ghép cột',
  VALIDATED: 'Đã kiểm tra',
  COMMITTED: 'Đã nhập',
  FAILED: 'Thất bại',
  EXPIRED: 'Đã hết hạn',
} as const;

function dateTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';
}

export function ImportHistoryPage({ api: apiProp }: { api?: ImportApi }) {
  const [api] = useState(() => apiProp ?? createImportApi());
  const { importRunId } = useParams();
  const requestKey = importRunId ?? 'history';
  const [page, setPage] = useState<ImportHistoryData | null>(null);
  const [detail, setDetail] = useState<ImportRunResult | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<{
    key: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const request = importRunId
      ? api.getResult(importRunId).then((result) => {
          if (active) {
            setDetail(result);
            setRequestError(null);
          }
        })
      : api.listHistory({ limit: 30 }).then((result) => {
          if (active) {
            setPage(result);
            setRequestError(null);
          }
        });
    void request
      .catch(() => {
        if (active)
          setRequestError({
            key: requestKey,
            message: 'Không thể tải lịch sử nhập dữ liệu. Vui lòng thử lại.',
          });
      })
      .finally(() => {
        if (active) setLoadedKey(requestKey);
      });
    return () => {
      active = false;
    };
  }, [api, importRunId, requestKey]);

  const isLoading = loadedKey !== requestKey;
  const errorMessage =
    requestError?.key === requestKey ? requestError.message : null;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            {importRunId ? 'Kết quả phiên nhập' : 'Lịch sử nhập dữ liệu'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Chỉ lưu kết quả và số liệu kiểm tra; không lưu workbook gốc.
          </p>
        </div>
        <Link
          to="/imports"
          className="inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white"
        >
          Nhập dữ liệu
        </Link>
      </div>
      {isLoading ? (
        <p
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600"
        >
          Đang tải lịch sử…
        </p>
      ) : null}
      {errorMessage ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-5 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      ) : null}

      {loadedKey === requestKey && detail && importRunId ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {targetLabels[detail.targetType]}
              </p>
              <h2 className="mt-1 text-lg font-bold break-all">
                {detail.fileName}
              </h2>
            </div>
            <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-900">
              {statusLabels[detail.status]}
            </span>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">Tổng số</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums">
                {detail.totalRows.toLocaleString('vi-VN')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Hợp lệ</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-emerald-800">
                {detail.validRows.toLocaleString('vi-VN')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Có lỗi</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-red-800">
                {detail.invalidRows.toLocaleString('vi-VN')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Đã xác nhận</dt>
              <dd className="mt-1 text-sm font-semibold">
                {dateTime(detail.committedAt)}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-xs text-slate-500">
            Mã phiên: <code>{detail.importRunId}</code>
          </p>
        </div>
      ) : null}

      {!importRunId && loadedKey === requestKey && page ? (
        page.items.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Chưa có phiên nhập dữ liệu.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-200">
              {page.items.map((item) => (
                <li key={item.importRunId}>
                  <Link
                    to={`/imports/${item.importRunId}`}
                    className="grid gap-2 p-4 hover:bg-slate-50 md:grid-cols-[minmax(12rem,1fr)_9rem_8rem_10rem] md:items-center"
                  >
                    <div>
                      <p className="font-semibold break-all text-slate-950">
                        {item.fileName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {targetLabels[item.targetType]} ·{' '}
                        {dateTime(item.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm font-medium">
                      {statusLabels[item.status]}
                    </span>
                    <span className="text-sm tabular-nums">
                      {item.totalRows.toLocaleString('vi-VN')} dòng
                    </span>
                    <span className="text-sm tabular-nums text-red-800">
                      {item.invalidRows.toLocaleString('vi-VN')} lỗi
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </section>
  );
}
