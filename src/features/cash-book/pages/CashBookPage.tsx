import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import {
  formatReportMoney,
  isIsoDate,
  presetReportRange,
  type ReportPeriod,
} from '@/features/reports';
import { useCursorList } from '@/shared/hooks/use-cursor-list';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { ListPagination } from '@/shared/ui/feedback/ListPagination';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { ViNumberInput } from '@/shared/ui/forms/ViNumberInput';
import { FinancialOutcomeUnknownError } from '@/shared/api/financial-command';
import {
  createCashBookApi,
  fundSchema,
  type CashBookEntry,
  type CashCursor,
  type Fund,
} from '../api/cash-book-api';
import {
  documentLink,
  entryLabel,
  formatCashTime,
  fundLabel,
} from '../model/cash-labels';
import { invalidateCashQueries } from '../model/cash-queries';

const OPENING_ENTITY: Record<Fund, string> = {
  CASH: '00000000-0000-4000-8000-00000000ca51',
  BANK: '00000000-0000-4000-8000-00000000ba4c',
};
const signed = (entry: CashBookEntry) =>
  `${entry.direction === 'IN' ? '+' : '−'}${formatReportMoney(entry.amount)}`;
const periods: [ReportPeriod, string][] = [
  ['today', 'Hôm nay'],
  ['week', 'Tuần này'],
  ['month', 'Tháng này'],
  ['custom', 'Tùy chọn'],
];

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | null;
  sub?: string;
  tone?: 'in' | 'out';
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-sm text-slate-600">{label}</span>
      {value === null ? (
        <span
          role="status"
          aria-label={`Đang tải ${label.toLowerCase()}`}
          className="h-7 w-28 animate-pulse rounded bg-slate-200"
        />
      ) : (
        <span
          className={`text-xl font-bold tabular-nums ${tone === 'in' ? 'text-emerald-700' : tone === 'out' ? 'text-red-700' : 'text-slate-950'}`}
        >
          {value}
        </span>
      )}
      {sub ? <span className="text-sm text-slate-600">{sub}</span> : null}
    </div>
  );
}

export function CashBookPage() {
  const { session } = useSession();
  const privateKey = usePrivateQueryKey();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const toast = useToast();
  const run = useFinancialCommand(session?.userId);
  const [api] = useState(createCashBookApi);
  const [params, setParams] = useSearchParams();
  const can = (code: string) => session?.permissions.includes(code) ?? false;
  const canAll = can('cash.book.read');
  const canVoucher = can('cash.voucher.create');
  const canShift = can('cash.shift.manage');
  const canOpening = can('cash.opening.set');
  const parsedFund = fundSchema.safeParse(params.get('fund'));
  const fund: Fund = parsedFund.success ? parsedFund.data : 'CASH';
  const parsedShift = z.uuid().safeParse(params.get('shift'));
  const shiftId = parsedShift.success ? parsedShift.data : null;
  const requested = params.get('period');
  const period: ReportPeriod =
    requested === 'today' || requested === 'week' || requested === 'custom'
      ? requested
      : 'month';
  const fallback = presetReportRange(period === 'custom' ? 'month' : period);
  const from = isIsoDate(params.get('from'))
    ? params.get('from')!
    : fallback.from;
  const to = isIsoDate(params.get('to')) ? params.get('to')! : fallback.to;
  const scope = canAll ? 'ALL' : 'OWN';
  const setParam = (next: Record<string, string>) =>
    setParams({
      fund,
      period,
      from,
      to,
      ...(shiftId ? { shift: shiftId } : {}),
      ...next,
    });

  const book = useCursorList({
    queryKey: privateKey('cash-book', fund, from, to, scope, shiftId),
    load: (cursor: CashCursor | undefined) =>
      api.book({ fund, from, to, scope, shiftId, cursor }),
    id: (item) => item.entryKey,
  });
  const first = book.data?.pages[0];
  const shifts = useQuery({
    queryKey: privateKey('cash-shifts', scope),
    queryFn: () => api.shifts(scope),
    enabled: !shiftId && (canAll || canShift),
  });

  const [opening, setOpening] = useState({
    asOf: presetReportRange('today').from,
    amount: '',
  });
  const [cancelling, setCancelling] = useState<{
    id: string;
    reason: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function perform(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.show({ kind: 'success', title: success });
      setCancelling(null);
      await invalidateCashQueries(queryClient);
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể lưu',
        message: error instanceof Error ? error.message : undefined,
        requestId:
          error instanceof FinancialOutcomeUnknownError
            ? error.requestId
            : undefined,
      });
    } finally {
      setBusy(false);
    }
  }
  const saveOpening = () =>
    perform(
      () =>
        run({
          commandName: 'cash.opening.set',
          entityId: OPENING_ENTITY[fund],
          invoke: (idempotencyKey) =>
            api.setOpening({ fund, ...opening, idempotencyKey }),
          parseCachedResponse: api.parseOpening,
        }),
      'Đã lưu số dư đầu quỹ',
    );
  const cancelVoucher = (voucherId: string, reason: string) =>
    perform(
      () =>
        run({
          commandName: 'cash.voucher.cancel',
          entityId: voucherId,
          invoke: (idempotencyKey) =>
            api.cancelVoucher({ voucherId, reason, idempotencyKey }),
          parseCachedResponse: api.parseCancel,
        }),
      'Đã hủy phiếu',
    );

  const summary = first?.summary;
  const balances = first?.fundBalances;
  const showBalances = canAll && !shiftId;
  const shift = first?.shift;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {shiftId ? (
            <Link
              to={`/cash-book?fund=${fund}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800"
            >
              Về sổ quỹ
            </Link>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            {shiftId ? `Ca ${shift?.shiftNumber ?? ''}` : 'Sổ quỹ'}
          </h1>
          {shift ? (
            <p className="text-sm text-slate-600">
              {shift.userName} · {formatCashTime(shift.openedAt)}
              {shift.closedAt
                ? ` – ${formatCashTime(shift.closedAt)}`
                : ' · đang mở'}
            </p>
          ) : null}
        </div>
        {!shiftId ? (
          <div className="flex flex-wrap gap-2">
            {canShift ? (
              <Link
                to="/cash-book/shift"
                className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                Kết ca
              </Link>
            ) : null}
            {canVoucher ? (
              <>
                <Link
                  to={`/cash-book/vouchers/new?direction=IN&fund=${fund}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-800"
                >
                  Lập phiếu thu
                </Link>
                <Link
                  to={`/cash-book/vouchers/new?direction=OUT&fund=${fund}`}
                  className="inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white"
                >
                  Lập phiếu chi
                </Link>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Quỹ" className="flex flex-wrap gap-2">
          {(['CASH', 'BANK'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={fund === item}
              onClick={() => setParam({ fund: item })}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${fund === item ? 'bg-teal-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
            >
              {fundLabel[item]}
              {showBalances && balances ? (
                <span className="tabular-nums">
                  {formatReportMoney(balances[item])}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        {!shiftId ? (
          <div aria-label="Khoảng thời gian" className="flex flex-wrap gap-2">
            {periods.map(([item, label]) => (
              <button
                key={item}
                type="button"
                aria-pressed={period === item}
                onClick={() => {
                  const range = presetReportRange(
                    item === 'custom' ? 'month' : item,
                  );
                  setParam({ period: item, from: range.from, to: range.to });
                }}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${period === item ? 'bg-teal-50 text-teal-900 ring-1 ring-teal-700' : 'border border-slate-300 bg-white text-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {period === 'custom' && !shiftId ? (
        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-sm font-medium">
            Từ ngày
            <input
              type="date"
              value={from}
              onChange={(event) => setParam({ from: event.target.value })}
              className="ml-2 rounded border border-slate-300 p-2"
            />
          </label>
          <label className="text-sm font-medium">
            Đến ngày
            <input
              type="date"
              value={to}
              onChange={(event) => setParam({ to: event.target.value })}
              className="ml-2 rounded border border-slate-300 p-2"
            />
          </label>
        </div>
      ) : null}

      {canOpening && first?.openings && !first.openings[fund] && !shiftId ? (
        <form
          aria-label={`Số dư đầu quỹ ${fundLabel[fund]}`}
          onSubmit={(event) => {
            event.preventDefault();
            void saveOpening();
          }}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <h2 className="w-full text-base font-semibold text-amber-950">
            Số dư đầu quỹ {fundLabel[fund]}
          </h2>
          <label className="text-sm font-medium text-slate-800">
            Ngày
            <input
              type="date"
              value={opening.asOf}
              max={presetReportRange('today').from}
              onChange={(event) =>
                setOpening({ ...opening, asOf: event.target.value })
              }
              className="mt-1 block min-h-11 rounded-lg border border-slate-300 px-3"
            />
          </label>
          <label className="text-sm font-medium text-slate-800">
            Số tiền
            <ViNumberInput
              maxFractionDigits={2}
              value={opening.amount}
              onChange={(amount) => setOpening({ ...opening, amount })}
              className="mt-1 block min-h-11 w-44 rounded-lg border border-slate-300 px-3 text-right tabular-nums"
            />
          </label>
          <button
            type="submit"
            disabled={!online || busy || !/^\d/.test(opening.amount)}
            className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Lưu số dư đầu
          </button>
        </form>
      ) : null}

      <div
        className={`grid gap-3 ${showBalances ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}
      >
        {showBalances ? (
          <Stat
            label="Tồn đầu kỳ"
            value={
              summary
                ? summary.openingBalance === null
                  ? '—'
                  : formatReportMoney(summary.openingBalance)
                : null
            }
          />
        ) : null}
        <Stat
          label="Tổng thu"
          tone="in"
          value={summary ? `+${formatReportMoney(summary.totalIn)}` : null}
          sub={summary ? `${summary.inCount} phiếu` : undefined}
        />
        <Stat
          label="Tổng chi"
          tone="out"
          value={summary ? `−${formatReportMoney(summary.totalOut)}` : null}
          sub={summary ? `${summary.outCount} phiếu` : undefined}
        />
        {showBalances ? (
          <Stat
            label="Tồn cuối kỳ"
            value={
              summary
                ? summary.closingBalance === null
                  ? '—'
                  : formatReportMoney(summary.closingBalance)
                : null
            }
          />
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              {[
                'Thời gian',
                'Loại',
                'Chứng từ',
                'Người nộp / nhận',
                'Người lập',
                'Số tiền',
                ...(showBalances ? ['Tồn quỹ'] : []),
                '',
              ].map((label, index) => (
                <th
                  key={`${label}-${index}`}
                  className={`whitespace-nowrap p-3 font-semibold ${label === 'Số tiền' || label === 'Tồn quỹ' ? 'text-right' : ''} ${label === 'Loại' || label === 'Số tiền' || label === '' ? '' : 'hidden md:table-cell'}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {book.items.map((entry) => {
              const link = documentLink(entry);
              return (
                <tr key={entry.entryKey} className="align-top">
                  <td className="hidden whitespace-nowrap p-3 tabular-nums md:table-cell">
                    {formatCashTime(entry.occurredAt)}
                  </td>
                  <td className="p-3">
                    <span className="font-medium md:font-normal">
                      {entryLabel(entry, fund)}
                    </span>
                    {entry.memo ? (
                      <p className="max-w-56 text-xs text-slate-500">
                        {entry.memo}
                      </p>
                    ) : null}
                    {/* Phone: the other columns fold under the label. */}
                    <p className="mt-1 text-xs text-slate-600 md:hidden">
                      <span className="tabular-nums">
                        {formatCashTime(entry.occurredAt)}
                      </span>
                      {' · '}
                      {link ? (
                        <Link
                          to={link}
                          className="font-semibold text-teal-800 underline"
                        >
                          {entry.documentNumber ?? 'Mở'}
                        </Link>
                      ) : (
                        <span className="font-semibold">
                          {entry.documentNumber}
                        </span>
                      )}
                      {entry.party ? ` · ${entry.party}` : ''}
                    </p>
                  </td>
                  <td className="hidden whitespace-nowrap p-3 font-semibold md:table-cell">
                    {link ? (
                      <Link
                        to={link}
                        className="inline-flex min-h-11 items-center text-teal-800 underline"
                      >
                        {entry.documentNumber ?? 'Mở'}
                      </Link>
                    ) : (
                      entry.documentNumber
                    )}
                  </td>
                  <td className="hidden p-3 md:table-cell">
                    {entry.party ?? '—'}
                  </td>
                  <td className="hidden p-3 md:table-cell">
                    {entry.actorName ?? '—'}
                  </td>
                  <td
                    className={`whitespace-nowrap p-3 text-right font-semibold tabular-nums ${entry.direction === 'IN' ? 'text-emerald-700' : 'text-red-700'}`}
                  >
                    {signed(entry)}
                    {showBalances && entry.balanceAfter !== null ? (
                      <p className="text-xs font-normal text-slate-500 md:hidden">
                        Tồn {formatReportMoney(entry.balanceAfter)}
                      </p>
                    ) : null}
                  </td>
                  {showBalances ? (
                    <td className="hidden whitespace-nowrap p-3 text-right tabular-nums md:table-cell">
                      {entry.balanceAfter === null
                        ? '—'
                        : formatReportMoney(entry.balanceAfter)}
                    </td>
                  ) : null}
                  <td className="p-3">
                    {entry.canCancel && cancelling?.id !== entry.documentId ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCancelling({ id: entry.documentId, reason: '' })
                        }
                        className="min-h-11 whitespace-nowrap text-sm font-semibold text-red-700"
                      >
                        Hủy phiếu
                      </button>
                    ) : null}
                    {cancelling?.id === entry.documentId ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void cancelVoucher(
                            entry.documentId,
                            cancelling.reason.trim(),
                          );
                        }}
                        className="flex min-w-56 flex-col gap-2"
                      >
                        <label className="text-xs font-medium text-slate-700">
                          Lý do hủy
                          <input
                            value={cancelling.reason}
                            onChange={(event) =>
                              setCancelling({
                                ...cancelling,
                                reason: event.target.value,
                              })
                            }
                            maxLength={400}
                            className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={
                              !online || busy || !cancelling.reason.trim()
                            }
                            className="min-h-11 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            Xác nhận hủy
                          </button>
                          <button
                            type="button"
                            onClick={() => setCancelling(null)}
                            className="min-h-11 px-3 text-sm font-semibold text-slate-700"
                          >
                            Thôi
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {book.isSuccess && !book.items.length ? (
          <p className="p-5 text-sm text-slate-600">Chưa có phiếu trong kỳ.</p>
        ) : null}
      </div>
      <ListPagination query={book} errorMessage="Không tải được sổ quỹ." />

      {!shiftId && (canAll || canShift) ? (
        <section aria-label="Ca gần đây" className="space-y-3">
          <h2 className="text-base font-semibold text-slate-950">Ca gần đây</h2>
          {shifts.isPending ? (
            <p role="status" className="text-sm text-slate-600">
              Đang tải ca…
            </p>
          ) : shifts.isError ? (
            <p role="alert" className="text-sm text-red-800">
              Không tải được danh sách ca.
            </p>
          ) : shifts.data.items.length === 0 ? (
            <p className="text-sm text-slate-600">Chưa có ca.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    {[
                      'Ca',
                      'Người',
                      'Mở ca',
                      'Phải có',
                      'Đếm được',
                      'Chênh lệch',
                    ].map((label) => (
                      <th
                        key={label}
                        className={`whitespace-nowrap p-3 font-semibold ${label === 'Người' || label === 'Mở ca' || label === 'Đếm được' ? 'hidden md:table-cell' : ''}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shifts.data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3 font-semibold">
                        <Link
                          to={`/cash-book?fund=CASH&shift=${item.id}`}
                          className="inline-flex min-h-11 items-center text-teal-800 underline"
                        >
                          {item.shiftNumber}
                        </Link>
                      </td>
                      <td className="hidden p-3 md:table-cell">
                        {item.userName}
                      </td>
                      <td className="hidden whitespace-nowrap p-3 tabular-nums md:table-cell">
                        {formatCashTime(item.openedAt)}
                      </td>
                      <td className="whitespace-nowrap p-3 tabular-nums">
                        {formatReportMoney(item.expectedCash)}
                      </td>
                      <td className="hidden whitespace-nowrap p-3 tabular-nums md:table-cell">
                        {item.countedCash === null
                          ? 'Đang mở'
                          : formatReportMoney(item.countedCash)}
                      </td>
                      <td
                        className={`whitespace-nowrap p-3 font-semibold tabular-nums ${item.difference && item.difference !== '0.00' ? 'text-red-700' : ''}`}
                      >
                        {item.difference === null
                          ? '—'
                          : formatReportMoney(item.difference)}
                        {item.closeNote ? (
                          <p className="text-xs font-normal text-slate-500">
                            {item.closeNote}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
