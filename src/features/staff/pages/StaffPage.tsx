import { SessionContextValue, usePrivateQueryKey } from '@/features/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext, useRef, useState } from 'react';
import {
  createStaffApi,
  StaffRecoveryError,
  type StaffApi,
  type StaffFormValues,
} from '../api/staff-api';
import { StaffActions } from '../components/StaffActions';
import { StaffForm } from '../components/StaffForm';

import {
  readStaffCreation,
  writeStaffCreation,
  type StaffCreationMarker,
} from '../model/staff-recovery';

const staffQueryKey = ['staff'] as const;
const staffAccessCapabilityQueryKey = ['staff', 'access-capability'] as const;
const roleLabels = {
  OWNER: 'Chủ cửa hàng',
  SALES_WAREHOUSE: 'Bán hàng / Kho',
  BUSINESS: 'Kinh doanh',
  WAREHOUSE_VIEWER: 'Kho — chỉ xem',
} as const;

export function StaffPage({ api }: { api?: StaffApi }) {
  const auth = useContext(SessionContextValue);
  const actorId = auth?.session?.userId ?? 'no-session';
  return <StaffPageContent key={actorId} api={api} actorId={actorId} />;
}

function StaffPageContent({
  api: apiProp,
  actorId,
}: {
  api?: StaffApi;
  actorId: string;
}) {
  const privateKey = usePrivateQueryKey();
  const [api] = useState(() => apiProp ?? createStaffApi());
  const [showCreate, setShowCreate] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: privateKey(...staffQueryKey),
    queryFn: () => api.list(),
  });
  const capabilityQuery = useQuery({
    queryKey: privateKey(...staffAccessCapabilityQueryKey),
    queryFn: () => api.getAccessCapability(),
  });
  const [initialRecovery] = useState(() => {
    try {
      return { marker: readStaffCreation(actorId), error: null };
    } catch (error) {
      return {
        marker: null,
        error:
          error instanceof Error
            ? error.message
            : 'Không thể đọc yêu cầu đang chờ.',
      };
    }
  });
  const [recovery, setRecovery] = useState(initialRecovery.marker);
  const [recoveryError, setRecoveryError] = useState<string | null>(
    initialRecovery.error,
  );
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const operation = useRef<StaffCreationMarker | null>(initialRecovery.marker);

  function store(marker: StaffCreationMarker | null) {
    writeStaffCreation(actorId, marker);
    operation.current = marker;
    setRecovery(marker);
  }
  function completed() {
    store(null);
    setRecoveryError(null);
    setStatusMessage('Đã tạo tài khoản nhân viên.');
    setShowCreate(false);
    void queryClient.invalidateQueries({ queryKey: staffQueryKey });
  }
  async function create(values?: StaffFormValues) {
    if (busy.current || initialRecovery.error) return;
    busy.current = true;
    setWorking(true);
    setRecoveryError(null);
    setStatusMessage(null);
    try {
      let marker = operation.current;
      if (!marker) {
        if (!values) return;
        marker = {
          action: 'create',
          idempotencyKey: crypto.randomUUID(),
          targetId: null,
        };
        store(marker); // Persist identity before the request; never persist form values.
        await api.create({ ...values, idempotencyKey: marker.idempotencyKey });
      } else {
        const feed = await api.list(); // A reload must inspect current state before resuming.
        await queryClient.invalidateQueries({ queryKey: staffQueryKey });
        const targetId = marker.targetId;
        if (targetId && feed.items.some((member) => member.id === targetId)) {
          completed();
          return;
        }
        if (!marker.targetId) {
          setRecoveryError(
            'Chưa xác định được tài khoản của yêu cầu này. Gửi mã yêu cầu cho hỗ trợ để đối soát; chưa tạo lại.',
          );
          return;
        }
        await api.create({
          pendingUserId: marker.targetId,
          idempotencyKey: marker.idempotencyKey,
        });
      }
      completed();
    } catch (error) {
      if (
        error instanceof StaffRecoveryError &&
        error.outcomeUnknown &&
        operation.current
      ) {
        store({
          ...operation.current,
          targetId: error.pendingUserId ?? operation.current.targetId,
        });
      } else if (
        error instanceof StaffRecoveryError &&
        !operation.current?.targetId
      ) {
        store(null); // A definitive rejection before Auth creation may be corrected.
      }
      if (values && !operation.current) {
        setRecoveryError(null);
        throw error; // Let the mounted form retain its inputs on a correctable rejection.
      }
      setRecoveryError(
        error instanceof Error
          ? error.message
          : 'Chưa thể hoàn tất yêu cầu. Vui lòng kiểm tra lại.',
      );
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  const refresh = (message?: null) => {
    setStatusMessage(
      message === null ? null : 'Đã cập nhật tài khoản nhân viên.',
    );
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
          disabled={
            !capabilityQuery.data?.canCreate ||
            !!recovery ||
            !!initialRecovery.error ||
            working
          }
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
        <div
          hidden={!!recovery}
          className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="mb-5 text-lg font-bold text-slate-950">
            Tạo tài khoản mới
          </h2>
          <StaffForm
            disabled={working || !!recovery}
            onCancel={() => setShowCreate(false)}
            onSubmit={(values) => create(values)}
          />
        </div>
      ) : null}

      {recovery ? (
        <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p role="status">
            {recovery.targetId
              ? 'Tài khoản đã tạo, cần hoàn tất hồ sơ.'
              : 'Chưa xác định được kết quả tạo tài khoản.'}
          </p>
          <p className="mt-2 text-sm">Mã yêu cầu: {recovery.idempotencyKey}</p>
          <button
            type="button"
            disabled={working || !capabilityQuery.data?.canCreate}
            onClick={() => void create()}
            className="mt-3 min-h-11 rounded-lg border border-amber-700 px-4 disabled:opacity-50"
          >
            {working
              ? 'Đang kiểm tra…'
              : recovery.targetId
                ? 'Tiếp tục hoàn tất hồ sơ'
                : 'Kiểm tra danh sách'}
          </button>
        </div>
      ) : null}
      {recoveryError &&
      recoveryError !== 'Tài khoản đã tạo, cần hoàn tất hồ sơ.' ? (
        <p role="alert" className="mt-4 text-sm text-red-800">
          {recoveryError}
        </p>
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
                  actorId={actorId}
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
