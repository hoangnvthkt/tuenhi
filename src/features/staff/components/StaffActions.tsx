import { useRef, useState, type FormEvent } from 'react';
import {
  StaffRecoveryError,
  type EmployeeRole,
  type PermissionDefinition,
  type PermissionEffect,
  type StaffApi,
  type StaffMember,
} from '../api/staff-api';

import {
  readStaffReactivation,
  writeStaffReactivation,
} from '../model/staff-recovery';

function currentEffect(member: StaffMember, code: string): PermissionEffect {
  return (
    member.overrides.find((override) => override.permissionCode === code)
      ?.effect ?? 'DEFAULT'
  );
}

export function StaffActions({
  api,
  actorId,
  member,
  permissions,
  refresh,
}: {
  api: StaffApi;
  actorId: string;
  member: StaffMember;
  permissions: PermissionDefinition[];
  refresh: (message?: null) => void;
}) {
  const [activeReason, setActiveReason] = useState('');
  const [role, setRole] = useState<EmployeeRole>(
    member.roleTemplate === 'OWNER' ? 'SALES_WAREHOUSE' : member.roleTemplate,
  );
  const [roleReason, setRoleReason] = useState('');
  const [permissionReason, setPermissionReason] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [initialRecovery] = useState(() => {
    try {
      return { marker: readStaffReactivation(actorId, member.id), error: null };
    } catch (error) {
      return {
        marker: null,
        error:
          error instanceof Error ? error.message : 'Không đọc được yêu cầu.',
      };
    }
  });
  type ActivationInput = Parameters<StaffApi['setActive']>[0];
  const initialAttempt: ActivationInput | null = initialRecovery.marker
    ? {
        userId: member.id,
        active: true,
        idempotencyKey: initialRecovery.marker.idempotencyKey,
        resume: true,
      }
    : null;
  const attempt = useRef<ActivationInput | null>(initialAttempt);
  const [attemptActive, setAttemptActive] = useState(
    initialAttempt?.active ?? false,
  );
  const [hasAttempt, setHasAttempt] = useState(!!initialAttempt);
  const [stale, setStale] = useState(false);
  const busy = useRef(false);

  function clearAttempt() {
    writeStaffReactivation(actorId, member.id, null);
    attempt.current = null;
    setHasAttempt(false);
    setStale(false);
  }
  async function changeActive() {
    if (busy.current || initialRecovery.error || stale) return;
    const recovering = !!attempt.current;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      if (!attempt.current) {
        const input: ActivationInput = {
          userId: member.id,
          active: !member.isActive,
          reason: activeReason.trim(),
          idempotencyKey: crypto.randomUUID(),
        };
        if (!input.reason) return;
        if (input.active)
          writeStaffReactivation(actorId, member.id, {
            action: 'reactivate',
            idempotencyKey: input.idempotencyKey,
            targetId: input.userId,
          });
        attempt.current = input;
        setAttemptActive(input.active);
        setHasAttempt(true);
      }
      const result = await api.setActive(attempt.current);
      if (
        result.authReactivationPending ||
        result.authSessionRevocationPending
      ) {
        setError(
          result.authReactivationPending
            ? 'Hồ sơ đã mở nhưng chưa hoàn tất mở quyền đăng nhập. Vui lòng tiếp tục yêu cầu này.'
            : 'Tài khoản đã khóa trong app nhưng chưa hoàn tất thu hồi phiên đăng nhập. Vui lòng thử lại.',
        );
        refresh(null);
        return;
      }
      clearAttempt();
      refresh();
    } catch (error) {
      if (error instanceof StaffRecoveryError && !error.outcomeUnknown) {
        if (error.code === 'STAFF_RECOVERY_STALE') setStale(true);
        else if (!recovering && error.code !== 'STAFF_OPERATION_UNKNOWN')
          clearAttempt();
      }
      setError(
        error instanceof Error
          ? error.message
          : 'Chưa thể hoàn tất cập nhật tài khoản.',
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function run(command: () => Promise<void>) {
    if (busy.current || hasAttempt || initialRecovery.error) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await command();
      refresh();
    } catch {
      setError('Không thể cập nhật tài khoản. Vui lòng thử lại.');
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <fieldset
        disabled={pending || hasAttempt || !!initialRecovery.error}
        className="space-y-3"
      >
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
            onClick={() => void changeActive()}
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
                onChange={(event) =>
                  setRole(event.target.value as EmployeeRole)
                }
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"
              >
                <option value="SALES_WAREHOUSE">Bán hàng &amp; Kho</option>
                <option value="BUSINESS">Nhân viên kinh doanh</option>
                <option value="WAREHOUSE_VIEWER">Kho — chỉ xem</option>
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
            {member.roleTemplate === 'WAREHOUSE_VIEWER' ? (
              <p className="mb-3 text-sm text-slate-600">
                Tài khoản kho chỉ được xem hàng hóa và tồn kho. Đổi vai trò để
                cấp các quyền khác.
              </p>
            ) : null}
            {member.roleTemplate !== 'WAREHOUSE_VIEWER' ? (
              <>
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
              </>
            ) : null}
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
                  {member.roleTemplate === 'WAREHOUSE_VIEWER' ? (
                    <p className="self-center text-sm font-medium text-slate-700">
                      {['catalog.read', 'inventory.read'].includes(
                        permission.code,
                      ) && currentEffect(member, permission.code) !== 'REVOKE'
                        ? 'Được xem'
                        : 'Không được cấp'}
                    </p>
                  ) : (
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
                  )}
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
      </fieldset>
      {hasAttempt ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm">
            Yêu cầu đang chờ hoàn tất. Không đổi trạng thái bằng yêu cầu mới.
          </p>
          <button
            type="button"
            disabled={pending || stale}
            onClick={() => void changeActive()}
            className="mt-2 min-h-11 rounded-lg border border-amber-700 px-3 disabled:opacity-50"
          >
            {attemptActive
              ? 'Tiếp tục mở quyền đăng nhập'
              : 'Thử lại thu hồi phiên đăng nhập'}
          </button>
          {stale ? (
            <button
              type="button"
              onClick={() => {
                clearAttempt();
                refresh(null);
              }}
              className="ml-2 min-h-11 px-3"
            >
              Bỏ yêu cầu đã lỗi thời
            </button>
          ) : null}
        </div>
      ) : null}
      {initialRecovery.error ? (
        <p role="alert">{initialRecovery.error}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
