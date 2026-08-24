import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { StaffForm } from './StaffForm';
import {
  createStaffApi,
  type EmployeeRole,
  type PermissionDefinition,
  type PermissionEffect,
  type StaffApi,
  type StaffMember,
} from '../api/staff-api';

const staffQueryKey = ['staff'] as const;
const roleLabels = {
  SALES_WAREHOUSE: 'Bán hàng & Kho',
  BUSINESS: 'Nhân viên kinh doanh',
  OWNER: 'Chủ cửa hàng',
} as const;

function currentEffect(member: StaffMember, code: string): PermissionEffect {
  return (
    member.overrides.find((override) => override.permissionCode === code)
      ?.effect ?? 'DEFAULT'
  );
}

function StaffActions({
  api,
  member,
  permissions,
  refresh,
}: {
  api: StaffApi;
  member: StaffMember;
  permissions: PermissionDefinition[];
  refresh: () => void;
}) {
  const [activeReason, setActiveReason] = useState('');
  const [role, setRole] = useState<EmployeeRole>(
    member.roleTemplate === 'BUSINESS' ? 'BUSINESS' : 'SALES_WAREHOUSE',
  );
  const [roleReason, setRoleReason] = useState('');
  const [permissionReason, setPermissionReason] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(command: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await command();
      refresh();
    } catch {
      setError('Không thể cập nhật tài khoản. Vui lòng thử lại.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label
            htmlFor={`active-reason-${member.id}`}
            className="mb-2 block text-sm font-medium text-slate-800"
          >
            Lý do thay đổi trạng thái
          </label>
          <input
            id={`active-reason-${member.id}`}
            value={activeReason}
            onChange={(event) => setActiveReason(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </div>
        <button
          type="button"
          disabled={pending || !activeReason.trim()}
          onClick={() =>
            void run(() =>
              api.setActive({
                userId: member.id,
                active: !member.isActive,
                reason: activeReason.trim(),
              }),
            )
          }
          className="min-h-11 self-end rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
        >
          {member.isActive ? 'Khóa tài khoản' : 'Mở lại tài khoản'}
        </button>
      </div>

      {member.roleTemplate !== 'OWNER' ? (
        <form
          className="grid gap-3 sm:grid-cols-[12rem_1fr_auto]"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!roleReason.trim()) return;
            void run(() =>
              api.setRole({
                userId: member.id,
                role,
                reason: roleReason.trim(),
              }),
            );
          }}
        >
          <div>
            <label
              htmlFor={`role-${member.id}`}
              className="mb-2 block text-sm font-medium"
            >
              Vai trò mới
            </label>
            <select
              id={`role-${member.id}`}
              value={role}
              onChange={(event) => setRole(event.target.value as EmployeeRole)}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
            >
              <option value="SALES_WAREHOUSE">Bán hàng &amp; Kho</option>
              <option value="BUSINESS">Nhân viên kinh doanh</option>
            </select>
          </div>
          <div>
            <label
              htmlFor={`role-reason-${member.id}`}
              className="mb-2 block text-sm font-medium"
            >
              Lý do đổi vai trò
            </label>
            <input
              id={`role-reason-${member.id}`}
              value={roleReason}
              onChange={(event) => setRoleReason(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
            />
          </div>
          <button
            disabled={pending || !roleReason.trim()}
            className="min-h-11 self-end rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Lưu vai trò
          </button>
        </form>
      ) : null}

      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-teal-800">
          Phân quyền
        </summary>
        <div className="mt-3">
          <label
            htmlFor={`permission-reason-${member.id}`}
            className="mb-2 block text-sm font-medium"
          >
            Lý do thay đổi quyền
          </label>
          <input
            id={`permission-reason-${member.id}`}
            value={permissionReason}
            onChange={(event) => setPermissionReason(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
          />
          <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200">
            {permissions.map((permission) => (
              <div
                key={permission.code}
                className="grid gap-2 p-3 sm:grid-cols-[1fr_11rem]"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {permission.label}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {permission.description}
                  </p>
                  {permission.ownerOnly ? (
                    <p className="mt-1 text-xs font-medium text-amber-800">
                      Chỉ chủ cửa hàng
                    </p>
                  ) : null}
                </div>
                <select
                  aria-label={permission.label}
                  disabled={
                    pending ||
                    permission.ownerOnly ||
                    member.roleTemplate === 'OWNER'
                  }
                  value={currentEffect(member, permission.code)}
                  onChange={(event) => {
                    if (!permissionReason.trim()) {
                      setError('Vui lòng nhập lý do thay đổi quyền.');
                      return;
                    }
                    void run(() =>
                      api.setPermissionOverride({
                        userId: member.id,
                        permissionCode: permission.code,
                        effect: event.target.value as PermissionEffect,
                        reason: permissionReason.trim(),
                      }),
                    );
                  }}
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 disabled:bg-slate-100"
                >
                  <option value="DEFAULT">Theo vai trò</option>
                  <option value="GRANT">Cấp riêng</option>
                  <option value="REVOKE">Thu hồi riêng</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </details>

      {member.roleTemplate !== 'OWNER' ? (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-teal-800">
            Đặt lại mật khẩu
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label
                htmlFor={`reset-password-${member.id}`}
                className="mb-2 block text-sm font-medium"
              >
                Mật khẩu tạm mới
              </label>
              <input
                id={`reset-password-${member.id}`}
                type="password"
                autoComplete="new-password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
              />
            </div>
            <div>
              <label
                htmlFor={`reset-reason-${member.id}`}
                className="mb-2 block text-sm font-medium"
              >
                Lý do đặt lại
              </label>
              <input
                id={`reset-reason-${member.id}`}
                value={resetReason}
                onChange={(event) => setResetReason(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-300 px-3"
              />
            </div>
            <button
              type="button"
              disabled={pending || !resetReason.trim() || !temporaryPassword}
              onClick={() =>
                void run(() =>
                  api.resetPassword({
                    userId: member.id,
                    temporaryPassword,
                    reason: resetReason.trim(),
                  }),
                )
              }
              className="min-h-11 self-end rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Đặt mật khẩu tạm
            </button>
          </div>
        </details>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function StaffPage({ api: apiProp }: { api?: StaffApi }) {
  const [api] = useState(() => apiProp ?? createStaffApi());
  const [showCreate, setShowCreate] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: staffQueryKey,
    queryFn: () => api.list(),
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
          className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Thêm nhân viên
        </button>
      </div>

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
