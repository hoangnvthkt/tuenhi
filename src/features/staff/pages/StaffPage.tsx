import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { createStaffApi, type StaffApi } from '../api/staff-api';
import { StaffActions } from '../components/StaffActions';
import { StaffForm } from '../components/StaffForm';

const staffQueryKey = ['staff'] as const;
const staffAccessCapabilityQueryKey = ['staff', 'access-capability'] as const;
const roleLabels = {
  OWNER: 'Chủ cửa hàng',
  SALES_WAREHOUSE: 'Bán hàng / Kho',
  BUSINESS: 'Kinh doanh',
  WAREHOUSE_VIEWER: 'Kho — chỉ xem',
} as const;

export function StaffPage({ api: apiProp }: { api?: StaffApi }) {
  const [api] = useState(() => apiProp ?? createStaffApi());
  const [showCreate, setShowCreate] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: staffQueryKey,
    queryFn: () => api.list(),
  });
  const capabilityQuery = useQuery({
    queryKey: staffAccessCapabilityQueryKey,
    queryFn: () => api.getAccessCapability(),
  });
  const createStaff = useMutation({
    mutationFn: api.create,
    onSuccess: () => {
      setStatusMessage('Đã tạo tài khoản nhân viên.');
      setShowCreate(false);
      void queryClient.invalidateQueries({ queryKey: staffQueryKey });
    },
  });

  const refresh = () => {
    setStatusMessage('Đã cập nhật tài khoản nhân viên.');
    void queryClient.invalidateQueries({ queryKey: staffQueryKey });
  };

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Nhân viên &amp; phân quyền
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Quản lý trạng thái, vai trò và quyền vận hành của từng tài khoản.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          disabled={!capabilityQuery.data?.canCreate}
          className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Thêm nhân viên
        </button>
      </div>

      {capabilityQuery.isPending ? (
        <p className="mt-5 text-sm text-slate-600">
          Đang kiểm tra quyền tạo nhân viên…
        </p>
      ) : capabilityQuery.isError ? (
        <p role="alert" className="mt-5 text-sm text-red-800">
          Không thể kiểm tra quyền tạo nhân viên. Vui lòng tải lại trang.
        </p>
      ) : capabilityQuery.data ? (
        <p
          role="status"
          className={`mt-5 rounded-lg px-3 py-2 text-sm ${
            capabilityQuery.data.policy === 'OWNER_WAIVER'
              ? 'border border-slate-300 bg-slate-50 text-slate-800'
              : capabilityQuery.data.canCreate
                ? 'bg-teal-50 text-teal-900'
                : 'bg-slate-100 text-slate-800'
          }`}
        >
          {capabilityQuery.data.message}
        </p>
      ) : null}

      {showCreate ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-slate-950">
            Tạo tài khoản mới
          </h2>
          <StaffForm
            onCancel={() => setShowCreate(false)}
            onSubmit={(values) => createStaff.mutateAsync(values)}
          />
        </div>
      ) : null}

      {statusMessage ? (
        <p
          role="status"
          className="mt-5 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900"
        >
          {statusMessage}
        </p>
      ) : null}

      <div className="mt-6">
        {query.isPending ? (
          <div
            role="status"
            className="min-h-40 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600"
          >
            Đang tải danh sách nhân viên…
          </div>
        ) : query.isError ? (
          <div className="rounded-xl border border-red-200 bg-white p-5">
            <p role="alert" className="text-sm text-red-800">
              Không thể tải danh sách nhân viên. Vui lòng thử lại.
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white"
            >
              Thử lại
            </button>
          </div>
        ) : query.data.items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Chưa có nhân viên.
          </div>
        ) : (
          <ul className="space-y-4">
            {query.data.items.map((member) => (
              <li
                key={member.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-950">
                      {member.displayName}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {member.email}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {roleLabels[member.roleTemplate]}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      member.isActive
                        ? 'bg-teal-50 text-teal-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {member.isActive ? 'Đang hoạt động' : 'Đã khóa'}
                  </span>
                </div>
                <StaffActions
                  api={api}
                  member={member}
                  permissions={query.data.permissionDefinitions}
                  refresh={refresh}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
