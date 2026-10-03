import { usePrivateQueryKey } from '@/features/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parsePhoneNumber } from 'libphonenumber-js';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '@/features/auth';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import { useToast } from '@/shared/ui/feedback/use-toast';
import {
  createDirectoryApi,
  directoryKeys,
  type CustomerItem,
  type DirectoryApi,
  type DirectoryCursor,
} from '../api/directory-api';
import { CustomerForm } from '../components/CustomerForm';

function readablePhone(value: string | null) {
  if (!value) return null;
  try {
    return parsePhoneNumber(value).formatInternational();
  } catch {
    return value;
  }
}

export function CustomerPage({
  api: apiProp,
  isOnline: onlineProp,
}: {
  api?: DirectoryApi;
  isOnline?: boolean;
}) {
  const privateKey = usePrivateQueryKey();
  const [api] = useState(() => apiProp ?? createDirectoryApi());
  const detectedOnline = useOnlineStatus();
  const isOnline = onlineProp ?? detectedOnline;
  const { session } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canManage = session?.permissions.includes('customer.manage') ?? false;
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<DirectoryCursor | undefined>();
  const [editor, setEditor] = useState<CustomerItem | 'new' | null>(null);
  const query = useQuery({
    queryKey: privateKey(...directoryKeys.customers({ search, cursor })),
    queryFn: () => api.listCustomers({ search, cursor, limit: 30 }),
  });

  async function saved() {
    await refreshOperationalData(queryClient);
    setEditor(null);
    toast.show({ kind: 'success', title: 'Đã lưu khách hàng' });
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Khách hàng</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tra cứu khách cá nhân và doanh nghiệp.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setEditor('new')}
            className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white"
          >
            Thêm khách hàng
          </button>
        ) : null}
      </div>
      {editor ? (
        <CustomerForm
          key={editor === 'new' ? 'new' : `${editor.id}:${editor.version}`}
          item={editor === 'new' ? null : editor}
          api={api}
          isOnline={isOnline}
          onCancel={() => setEditor(null)}
          onSaved={saved}
        />
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setCursor(undefined);
          setSearch(draft.trim());
        }}
        className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex-1">
          <label
            htmlFor="customer-search"
            className="mb-2 block text-sm font-medium"
          >
            Tìm khách hàng
          </label>
          <input
            id="customer-search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Tên, mã hoặc điện thoại"
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>
        <button className="mt-7 min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white">
          Tìm kiếm
        </button>
      </form>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {query.isPending ? (
          <p className="p-5 text-sm text-slate-600">Đang tải khách hàng…</p>
        ) : null}
        {query.isError ? (
          <div role="alert" className="p-5 text-red-800">
            <p>Không thể tải khách hàng.</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold"
            >
              Thử lại
            </button>
          </div>
        ) : null}
        {query.data?.items.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Chưa có khách hàng.</p>
        ) : null}
        <ul className="divide-y divide-slate-200">
          {query.data?.items.map((item) => (
            <li
              key={item.id}
              className="grid gap-3 p-4 md:grid-cols-[1fr_13rem_auto] md:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/more/customers/${item.id}`}
                    className="font-bold text-teal-800 hover:underline"
                  >
                    {item.name}
                  </Link>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs">
                    {item.customerType === 'BUSINESS'
                      ? 'Doanh nghiệp'
                      : 'Cá nhân'}
                  </span>
                  {!item.isActive ? (
                    <span className="rounded bg-slate-200 px-2 py-1 text-xs">
                      Ngừng hoạt động
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {item.code ? (
                    <Link
                      to={`/more/customers/${item.id}`}
                      className="font-mono text-teal-800 hover:underline"
                    >
                      {item.code}
                    </Link>
                  ) : (
                    'Chưa có mã'
                  )}
                  {item.companyName ? ` · ${item.companyName}` : ''}
                </p>
              </div>
              <p className="text-sm text-slate-700">
                {readablePhone(item.phone) ?? 'Chưa có điện thoại'}
              </p>
              {canManage ? (
                <button
                  type="button"
                  aria-label={`Sửa ${item.name}`}
                  onClick={() => setEditor(item)}
                  className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold"
                >
                  Sửa
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {query.data?.nextCursor ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCursor(query.data?.nextCursor ?? undefined)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold"
          >
            Trang tiếp
          </button>
        </div>
      ) : null}
    </section>
  );
}
