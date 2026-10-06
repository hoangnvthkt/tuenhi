import { useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link } from 'react-router';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { refreshOperationalData } from '@/shared/api/refresh-operational-data';
import {
  FinancialOutcomeUnknownError,
  findPendingFinancialCommand,
  getFinancialCorrelationId,
  type PendingFinancialCommand,
} from '@/shared/api/financial-command';
import {
  FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT,
  FINANCIAL_COMMAND_RECONCILE_EVENT,
} from '@/shared/api/financial-command-recovery';
import { calculatePaymentAllocation } from '@/shared/lib/numeric/payment-allocation';
import {
  compareCanonicalNumbers,
  formatViDecimal,
  validateCanonicalNumber,
} from '@/shared/lib/numeric/canonical-number';
import {
  createCustomerDebtApi,
  type CustomerDebtApi,
  type DebtCursor,
} from '../api/customer-debt-api';

const money = (value: string) => `${formatViDecimal(value, 2)} ₫`;
const entryLabels = {
  SALE_CREDIT: 'Phát sinh nợ',
  COLLECTION: 'Thu nợ',
  ADJUSTMENT: 'Chỉnh số dư',
  RETURN_OFFSET: 'Cấn trừ trả hàng',
  SALE_CANCELLED: 'Hủy hóa đơn',
};
const inputClass =
  'mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3';
const buttonClass =
  'min-h-11 rounded-lg border border-slate-300 px-4 font-semibold disabled:opacity-50';

export function CustomerDebtPanel({
  customerId,
  api: apiProp,
}: {
  customerId: string;
  api?: CustomerDebtApi;
}) {
  const [api] = useState(() => apiProp ?? createCustomerDebtApi());
  const { session } = useSession();
  const privateKey = usePrivateQueryKey();
  const online = useOnlineStatus();
  const toast = useToast();
  const queryClient = useQueryClient();
  const run = useFinancialCommand(session?.userId);
  const canRead = session?.permissions.includes('customer.debt.read') ?? false;
  const canCollect =
    session?.permissions.includes('customer.debt.collect') ?? false;
  const canAdjust =
    session?.permissions.includes('customer.debt.adjust') ?? false;
  const [mode, setMode] = useState<'collect' | 'adjust' | null>(null);
  const [cash, setCash] = useState('');
  const [bank, setBank] = useState('');
  const [newBalance, setNewBalance] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [unresolved, setUnresolved] = useState<PendingFinancialCommand | null>(
    null,
  );
  const [, refreshMarkers] = useState(0);
  const submitting = useRef(false);
  const attempt = useRef<{
    commandName: 'customer.debt.collect' | 'customer.debt.adjust';
    key?: string;
    invoke: (key: string) => ReturnType<CustomerDebtApi['collect']>;
  } | null>(null);
  let pending: PendingFinancialCommand | undefined;
  let storageBlocked = false;
  try {
    if (session?.userId)
      pending =
        findPendingFinancialCommand({
          userId: session.userId,
          commandName: 'customer.debt.collect',
          entityId: customerId,
        }) ??
        findPendingFinancialCommand({
          userId: session.userId,
          commandName: 'customer.debt.adjust',
          entityId: customerId,
        });
  } catch {
    storageBlocked = true;
  }
  pending ??= unresolved ?? undefined;
  const detail = useQuery({
    queryKey: privateKey('customer-debt', customerId, 'balance'),
    queryFn: () => api.detail(customerId),
    enabled: canRead,
  });
  const history = useInfiniteQuery({
    queryKey: privateKey('customer-debt', customerId, 'entries'),
    queryFn: ({ pageParam }) => api.entries(customerId, pageParam),
    initialPageParam: undefined as DebtCursor | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: canRead,
  });
  const allocation = calculatePaymentAllocation(
    detail.data?.balance ?? '0',
    cash,
    bank,
  );
  const adjusted = validateCanonicalNumber(newBalance, {
    kind: 'money',
    precision: 20,
    required: true,
  });
  const valid =
    mode === 'collect'
      ? allocation.ok && allocation.paid !== '0'
      : adjusted.ok &&
        note.trim().length > 0 &&
        compareCanonicalNumbers(newBalance, detail.data?.balance ?? '0') !== 0;
  const locked =
    !online ||
    busy ||
    Boolean(pending) ||
    storageBlocked ||
    !detail.data ||
    detail.isError;
  useEffect(() => {
    const update = () => refreshMarkers((value) => value + 1);
    window.addEventListener(FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT, update);
    return () =>
      window.removeEventListener(
        FINANCIAL_COMMAND_MARKERS_CHANGED_EVENT,
        update,
      );
  }, []);

  async function reconciled() {
    setUnresolved(null);
    attempt.current = null;
    setMode(null);
    await refreshOperationalData(queryClient);
  }
  async function reconcile() {
    if (!pending || !online || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const original =
        attempt.current?.commandName === pending.commandName &&
        attempt.current.key === pending.idempotencyKey
          ? attempt.current
          : null;
      await run({
        commandName: pending.commandName,
        entityId: customerId,
        resumeOnly: true,
        retryPending: Boolean(original),
        invoke:
          original?.invoke ??
          (async () => {
            throw new Error('Chỉ đối soát mã yêu cầu đã gửi.');
          }),
        parseCachedResponse: api.parseMutationResponse,
      });
      await reconciled();
      toast.show({ kind: 'success', title: 'Đã đối soát công nợ' });
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể đối soát công nợ',
        message: error instanceof Error ? error.message : undefined,
        correlationId: getFinancialCorrelationId(error),
      });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const receive = () => {
      void reconcile();
    };
    window.addEventListener(FINANCIAL_COMMAND_RECONCILE_EVENT, receive);
    return () =>
      window.removeEventListener(FINANCIAL_COMMAND_RECONCILE_EVENT, receive);
  });
  async function submit() {
    if (
      locked ||
      !valid ||
      !mode ||
      !detail.data ||
      submitting.current ||
      (!canCollect && mode === 'collect') ||
      (!canAdjust && mode === 'adjust')
    )
      return;
    const snapshot = {
      customerId,
      expectedVersion: detail.data.version,
      note: note.trim(),
    };
    const commandName =
      mode === 'collect' ? 'customer.debt.collect' : 'customer.debt.adjust';
    const amounts = allocation.ok ? { ...allocation.allocation } : null;
    const balance = newBalance;
    const current: NonNullable<typeof attempt.current> = {
      commandName,
      key: undefined as string | undefined,
      invoke: async (idempotencyKey: string) => {
        current.key = idempotencyKey;
        return commandName === 'customer.debt.collect' && amounts
          ? api.collect({ ...snapshot, ...amounts, idempotencyKey })
          : api.adjust({
              customerId,
              expectedVersion: snapshot.expectedVersion,
              newBalance: balance,
              reason: snapshot.note,
              idempotencyKey,
            });
      },
    };
    attempt.current = current;
    submitting.current = true;
    setBusy(true);
    try {
      await run({
        commandName,
        entityId: customerId,
        invoke: current.invoke,
        parseCachedResponse: api.parseMutationResponse,
      });
      await reconciled();
      toast.show({
        kind: 'success',
        title:
          commandName === 'customer.debt.collect'
            ? 'Đã ghi nhận khách trả nợ'
            : 'Đã cập nhật số dư nợ',
      });
    } catch (error) {
      if (error instanceof FinancialOutcomeUnknownError && session?.userId) {
        setUnresolved({
          version: 1,
          userId: session.userId,
          commandName,
          entityId: customerId,
          idempotencyKey: error.requestId,
          createdAt: new Date().toISOString(),
        });
      } else attempt.current = null;
      toast.show({
        kind: 'error',
        title: 'Chưa thể cập nhật công nợ',
        message: error instanceof Error ? error.message : undefined,
        requestId:
          error instanceof FinancialOutcomeUnknownError
            ? error.requestId
            : undefined,
        correlationId: getFinancialCorrelationId(error),
      });
      await detail.refetch();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (!canRead) return null;
  return (
    <section
      aria-labelledby="customer-debt-title"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="customer-debt-title" className="text-lg font-bold">
            Công nợ khách hàng
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Số dư hiện tại của khách, gồm nợ hóa đơn và nợ nhập cũ.
          </p>
          {detail.data ? (
            <p
              data-testid="customer-debt-balance"
              className="mt-2 text-2xl font-bold text-amber-900"
            >
              {money(detail.data.balance)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canCollect ? (
            <button
              type="button"
              disabled={
                locked ||
                !detail.data ||
                compareCanonicalNumbers(detail.data.balance, '0') <= 0
              }
              className={buttonClass}
              onClick={() => {
                setMode('collect');
                setCash('');
                setBank('');
                setNote('');
              }}
            >
              Thu nợ
            </button>
          ) : null}
          {canAdjust ? (
            <button
              type="button"
              disabled={locked}
              className={buttonClass}
              onClick={() => {
                setMode('adjust');
                setNewBalance(detail.data?.balance ?? '0');
                setNote('');
              }}
            >
              Chỉnh số dư nợ
            </button>
          ) : null}
        </div>
      </div>
      {detail.isPending ? <p role="status">Đang tải công nợ…</p> : null}
      {detail.isError ? (
        <div role="alert">
          Không thể tải công nợ.{' '}
          <button
            type="button"
            className={buttonClass}
            onClick={() => void detail.refetch()}
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {storageBlocked ? (
        <p role="alert" className="text-red-800">
          Không đọc được mã yêu cầu trên thiết bị. Chưa thể thay đổi công nợ.
        </p>
      ) : null}
      {pending ? (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3"
        >
          <p>
            Giao dịch công nợ đang chờ đối soát. Chưa tạo khoản thu hoặc điều
            chỉnh mới.
          </p>
          <button
            type="button"
            disabled={!online || busy}
            className={buttonClass}
            onClick={() => void reconcile()}
          >
            Đối soát công nợ
          </button>
        </div>
      ) : null}
      {mode ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-3 rounded-lg bg-slate-50 p-4"
        >
          <h3 className="font-semibold">
            {mode === 'collect'
              ? 'Ghi nhận khách trả nợ'
              : 'Nhập hoặc chỉnh số dư nợ'}
          </h3>
          {mode === 'collect' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Tiền mặt thu nợ
                  <input
                    inputMode="decimal"
                    value={cash}
                    onChange={(event) => setCash(event.target.value)}
                    maxLength={21}
                    placeholder="0"
                    disabled={locked}
                    className={inputClass}
                  />
                </label>
                <label className="text-sm font-medium">
                  Chuyển khoản thu nợ
                  <input
                    inputMode="decimal"
                    value={bank}
                    onChange={(event) => setBank(event.target.value)}
                    maxLength={21}
                    placeholder="0"
                    disabled={locked}
                    className={inputClass}
                  />
                </label>
              </div>
              <p aria-live="polite" className="text-sm">
                {allocation.ok
                  ? `Còn nợ sau khi thu: ${money(allocation.debt)}`
                  : allocation.message}
              </p>
            </>
          ) : (
            <label className="block text-sm font-medium">
              Số nợ mới
              <input
                inputMode="decimal"
                value={newBalance}
                onChange={(event) => setNewBalance(event.target.value)}
                maxLength={21}
                disabled={locked}
                className={inputClass}
              />
            </label>
          )}
          <label className="block text-sm font-medium">
            {mode === 'adjust' ? 'Lý do điều chỉnh' : 'Ghi chú thu nợ'}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required={mode === 'adjust'}
              maxLength={500}
              disabled={locked}
              className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-3"
            />
          </label>
          {mode === 'adjust' ? (
            <p className="text-sm text-slate-600">
              Chỉnh số dư lưu lịch sử và lý do; không ghi nhận tiền khách đã
              trả.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={locked || !valid}
              className="min-h-11 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-50"
            >
              {busy
                ? 'Đang xử lý…'
                : mode === 'collect'
                  ? 'Ghi nhận thu nợ'
                  : 'Lưu số dư nợ'}
            </button>
            <button
              type="button"
              disabled={busy || Boolean(pending)}
              className={buttonClass}
              onClick={() => setMode(null)}
            >
              Đóng
            </button>
          </div>
        </form>
      ) : null}
      <div>
        <h3 className="font-semibold">Lịch sử công nợ</h3>
        {history.isPending ? (
          <p className="mt-2 text-sm">Đang tải lịch sử…</p>
        ) : null}
        {history.isError ? (
          <p role="alert">
            Không thể tải lịch sử công nợ.{' '}
            <button type="button" onClick={() => void history.refetch()}>
              Thử lại lịch sử
            </button>
          </p>
        ) : null}
        <ul className="mt-2 divide-y divide-slate-100">
          {history.data?.pages
            .flatMap((page) => page.items)
            .map((entry) => (
              <li key={entry.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{entryLabels[entry.kind]}</strong>
                  <span className="font-semibold">{money(entry.delta)}</span>
                </div>
                <p className="text-slate-600">
                  {new Date(entry.occurredAt).toLocaleString('vi-VN')} ·{' '}
                  {entry.actorName}
                </p>
                {entry.saleNumber ? (
                  session?.permissions.includes('sale.all.read') ? (
                    <Link
                      className="text-teal-800 underline"
                      to={`/sales/${entry.saleId}`}
                    >
                      {entry.saleNumber}
                    </Link>
                  ) : (
                    <p>{entry.saleNumber}</p>
                  )
                ) : null}
                {entry.note ? <p>{entry.note}</p> : null}
                {entry.kind === 'COLLECTION' ? (
                  <p>
                    Tiền mặt {money(entry.cashAmount)} · Chuyển khoản{' '}
                    {money(entry.bankTransferAmount)}
                  </p>
                ) : null}
                <p className="text-slate-600">
                  Số dư sau: {money(entry.balanceAfter)}
                </p>
              </li>
            ))}
        </ul>
        {history.data?.pages[0]?.items.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Chưa có phát sinh công nợ.
          </p>
        ) : null}
        {history.hasNextPage ? (
          <button
            type="button"
            disabled={history.isFetchingNextPage}
            className={buttonClass}
            onClick={() => void history.fetchNextPage()}
          >
            Xem thêm lịch sử
          </button>
        ) : null}
      </div>
    </section>
  );
}
