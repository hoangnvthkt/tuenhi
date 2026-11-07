import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import { formatReportMoney } from '@/features/reports';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { ViNumberInput } from '@/shared/ui/forms/ViNumberInput';
import { FinancialOutcomeUnknownError } from '@/shared/api/financial-command';
import { createCashBookApi, type CashShift } from '../api/cash-book-api';
import { formatCashTime, subtractMoney } from '../model/cash-labels';
import { invalidateCashQueries } from '../model/cash-queries';

const validMoney = (value: string) => /^\d+(\.\d{1,2})?$/.test(value);

function Row({
  label,
  value,
  to,
  tone,
  strong,
}: {
  label: string;
  value: string;
  to?: string;
  tone?: 'in' | 'out';
  strong?: boolean;
}) {
  const content = (
    <>
      <span className={strong ? 'font-semibold' : ''}>{label}</span>
      <span
        className={`tabular-nums ${strong ? 'text-xl font-bold' : 'font-semibold'} ${tone === 'in' ? 'text-emerald-700' : tone === 'out' ? 'text-red-700' : ''}`}
      >
        {value}
      </span>
    </>
  );
  const className =
    'flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 text-[15px] last:border-0';
  return to ? (
    <Link to={to} className={`${className} hover:bg-slate-50`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function CashShiftPage() {
  const { session } = useSession();
  const privateKey = usePrivateQueryKey();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const toast = useToast();
  const run = useFinancialCommand(session?.userId);
  const [api] = useState(createCashBookApi);
  const current = useQuery({
    queryKey: privateKey('cash-shifts', 'mine'),
    queryFn: () => api.myShift(),
  });
  const [openingCash, setOpeningCash] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<CashShift | null>(null);

  async function perform(action: () => Promise<CashShift>, success: string) {
    if (busy) return;
    setBusy(true);
    try {
      const shift = await action();
      toast.show({ kind: 'success', title: success });
      if (shift.status === 'CLOSED') setClosed(shift);
      setCounted('');
      setNote('');
      await invalidateCashQueries(queryClient);
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể lưu ca',
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

  const back = (
    <Link
      to="/cash-book"
      className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800"
    >
      Về sổ quỹ
    </Link>
  );
  if (current.isPending)
    return (
      <section className="mx-auto max-w-lg space-y-4">
        {back}
        <div
          role="status"
          aria-label="Đang tải ca"
          className="h-64 animate-pulse rounded-2xl bg-slate-200"
        />
      </section>
    );
  if (current.isError)
    return (
      <section className="mx-auto max-w-lg space-y-4">
        {back}
        <p role="alert" className="text-sm text-red-800">
          Không tải được ca.
        </p>
      </section>
    );

  const shift = current.data;
  if (!shift)
    return (
      <section className="mx-auto max-w-lg space-y-4">
        {back}
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Mở ca
        </h1>
        {closed ? (
          <div
            role="status"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="font-semibold">Đã đóng {closed.shiftNumber}</p>
            <p className="text-sm tabular-nums text-slate-700">
              Chênh lệch {formatReportMoney(closed.difference ?? '0')}
            </p>
          </div>
        ) : null}
        <form
          aria-label="Mở ca"
          onSubmit={(event) => {
            event.preventDefault();
            if (!validMoney(openingCash) || !session?.userId) return;
            void perform(
              () =>
                run({
                  commandName: 'cash.shift.open',
                  entityId: session.userId,
                  invoke: (idempotencyKey) =>
                    api.openShift({ openingCash, idempotencyKey }),
                  parseCachedResponse: api.parseShift,
                }),
              'Đã mở ca',
            );
          }}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <label className="block text-sm font-semibold text-slate-900">
            Tiền mặt đầu ca
            <ViNumberInput
              maxFractionDigits={2}
              value={openingCash}
              onChange={setOpeningCash}
              maxLength={27}
              className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 px-3 text-right text-xl font-semibold tabular-nums"
            />
          </label>
          <button
            type="submit"
            disabled={!online || busy || !validMoney(openingCash)}
            className="min-h-12 w-full rounded-xl bg-teal-700 text-base font-bold text-white disabled:opacity-50"
          >
            Mở ca
          </button>
        </form>
      </section>
    );

  const difference = validMoney(counted)
    ? subtractMoney(counted, shift.expectedCash)
    : null;
  const short =
    difference !== null && /^-?0(\.0+)?$/.test(difference) === false;
  const drill = `/cash-book?fund=CASH&shift=${shift.id}`;
  return (
    <section className="mx-auto max-w-lg space-y-4">
      {back}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Kết ca
        </h1>
        <p className="text-sm text-slate-600">
          {shift.shiftNumber} · {shift.userName} · mở ca{' '}
          {formatCashTime(shift.openedAt)}
        </p>
      </div>
      <section
        aria-label="Tiền mặt trong ca"
        className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm"
      >
        <Row label="Tiền đầu ca" value={formatReportMoney(shift.openingCash)} />
        <Row
          label={`Thu tiền mặt · ${shift.cashInCount} phiếu`}
          value={`+${formatReportMoney(shift.cashIn)}`}
          tone="in"
          to={drill}
        />
        <Row
          label={`Chi tiền mặt · ${shift.cashOutCount} phiếu`}
          value={`−${formatReportMoney(shift.cashOut)}`}
          tone="out"
          to={drill}
        />
        <Row
          label="Tiền mặt phải có"
          value={formatReportMoney(shift.expectedCash)}
          strong
        />
      </section>
      <form
        aria-label="Đóng ca"
        onSubmit={(event) => {
          event.preventDefault();
          if (!validMoney(counted)) return;
          void perform(
            () =>
              run({
                commandName: 'cash.shift.close',
                entityId: shift.id,
                invoke: (idempotencyKey) =>
                  api.closeShift({
                    shiftId: shift.id,
                    expectedVersion: shift.version,
                    countedCash: counted,
                    note: note.trim(),
                    idempotencyKey,
                  }),
                parseCachedResponse: api.parseShift,
              }),
            'Đã đóng ca',
          );
        }}
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="block text-sm font-semibold text-slate-900">
          Tiền mặt đếm được
          <ViNumberInput
            maxFractionDigits={2}
            value={counted}
            onChange={setCounted}
            maxLength={27}
            className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 px-3 text-right text-xl font-semibold tabular-nums"
          />
        </label>
        {difference !== null ? (
          <p
            role="status"
            className={`flex min-h-11 items-center justify-between rounded-lg px-3 ${short ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-900'}`}
          >
            <span>Chênh lệch</span>
            <span className="text-lg font-bold tabular-nums">
              {formatReportMoney(difference)}
            </span>
          </p>
        ) : null}
        <label className="block text-sm font-medium text-slate-700">
          Ghi chú{short ? ' (bắt buộc khi lệch)' : ''}
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
          />
        </label>
        <button
          type="submit"
          disabled={
            !online || busy || !validMoney(counted) || (short && !note.trim())
          }
          className="min-h-12 w-full rounded-xl bg-teal-700 text-base font-bold text-white disabled:opacity-50"
        >
          Đóng ca
        </button>
      </form>
      <section
        aria-label="Chuyển khoản trong ca"
        className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm"
      >
        <Row
          label="Chuyển khoản vào"
          value={`+${formatReportMoney(shift.bankIn)}`}
        />
        <Row
          label="Chuyển khoản ra"
          value={`−${formatReportMoney(shift.bankOut)}`}
        />
      </section>
    </section>
  );
}
