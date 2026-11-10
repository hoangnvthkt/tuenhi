import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivateQueryKey, useSession } from '@/features/auth';
import { formatReportMoney } from '@/features/reports';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { ViNumberInput } from '@/shared/ui/forms/ViNumberInput';
import { FinancialOutcomeUnknownError } from '@/shared/api/financial-command';
import { createSupplierDebtApi } from '../api/supplier-debt-api';
import {
  addMoney,
  allocateOldestFirst,
  fromCents,
  toCents,
} from '../model/supplier-money';
import { formatDay, invalidateSupplierQueries } from '../model/supplier-ui';

const validMoney = (value: string) =>
  value === '' || /^\d+(\.\d{1,2})?$/.test(value);

export function SupplierPayPage() {
  const { supplierId = '' } = useParams();
  const { session } = useSession();
  const privateKey = usePrivateQueryKey();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const toast = useToast();
  const navigate = useNavigate();
  const run = useFinancialCommand(session?.userId);
  const [api] = useState(createSupplierDebtApi);
  const debt = useQuery({
    queryKey: privateKey('supplier-debts', supplierId),
    queryFn: () => api.debt(supplierId),
  });
  const [cash, setCash] = useState('');
  const [bank, setBank] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const total =
    validMoney(cash) && validMoney(bank) ? addMoney(cash, bank) : null;
  const data = debt.data;
  const exceeds =
    data && total !== null && toCents(total) > toCents(data.balance);
  const valid = data && total !== null && toCents(total) > 0n && !exceeds;
  const back = `/more/supplier-debts?supplier=${supplierId}`;

  async function submit() {
    if (!data || !valid || busy) return;
    setBusy(true);
    try {
      await run({
        commandName: 'supplier.debt.pay',
        entityId: supplierId,
        invoke: (idempotencyKey) =>
          api.pay({
            supplierId,
            expectedVersion: data.version,
            cashAmount: cash || '0',
            bankTransferAmount: bank || '0',
            note: note.trim(),
            idempotencyKey,
          }),
        parseCachedResponse: api.parseMutation,
      });
      toast.show({ kind: 'success', title: 'Đã ghi trả nợ NCC' });
      await invalidateSupplierQueries(queryClient);
      void navigate(back);
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể trả nợ NCC',
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

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <Link
        to={back}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800"
      >
        Về công nợ NCC
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Trả nợ NCC
        </h1>
        {data ? (
          <p className="text-sm text-slate-600">
            {data.supplier.code} · {data.supplier.name}
          </p>
        ) : null}
      </div>
      {debt.isError ? (
        <p role="alert" className="text-sm text-red-800">
          Không tải được công nợ.
        </p>
      ) : !data ? (
        <div
          role="status"
          aria-label="Đang tải công nợ"
          className="h-48 animate-pulse rounded-2xl bg-slate-200"
        />
      ) : (
        <>
          <div className="flex min-h-14 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
            <span className="font-semibold">Đang nợ</span>
            <span className="text-xl font-bold tabular-nums">
              {formatReportMoney(data.balance)}
            </span>
          </div>
          <form
            aria-label="Trả nợ NCC"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <label className="block text-sm font-semibold text-slate-900">
              Tiền mặt
              <ViNumberInput
                maxFractionDigits={2}
                value={cash}
                onChange={setCash}
                maxLength={27}
                className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 px-3 text-right text-xl font-semibold tabular-nums"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-900">
              Chuyển khoản
              <ViNumberInput
                maxFractionDigits={2}
                value={bank}
                onChange={setBank}
                maxLength={27}
                className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 px-3 text-right text-xl font-semibold tabular-nums"
              />
            </label>
            {total !== null ? (
              <p
                role="status"
                className={`flex min-h-11 items-center justify-between rounded-lg px-3 ${exceeds ? 'bg-red-50 text-red-900' : 'bg-slate-100'}`}
              >
                <span>
                  {exceeds ? 'Vượt số đang nợ' : 'Còn nợ sau khi trả'}
                </span>
                <span className="font-bold tabular-nums">
                  {exceeds
                    ? formatReportMoney(total)
                    : formatReportMoney(
                        fromCents(toCents(data.balance) - toCents(total)),
                      )}
                </span>
              </p>
            ) : null}
            <label className="block text-sm font-medium text-slate-700">
              Ghi chú
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base"
              />
            </label>
            <button
              type="submit"
              disabled={!online || busy || !valid}
              className="min-h-12 w-full rounded-xl bg-teal-700 text-base font-bold text-white disabled:opacity-50"
            >
              Lưu và lập phiếu chi
            </button>
          </form>
          {total !== null && valid ? (
            <section
              aria-label="Trừ vào phiếu"
              className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm"
            >
              <p className="flex min-h-11 items-center text-sm font-semibold text-slate-600">
                Trừ vào phiếu cũ nhất trước
              </p>
              {allocateOldestFirst(data.openPayables, total)
                .filter((item) => toCents(item.amount) > 0n)
                .map(({ payable, amount }) => (
                  <p
                    key={payable.payableId}
                    className="flex min-h-11 items-center justify-between border-t border-slate-100 text-sm"
                  >
                    <span>
                      {payable.receiptNumber ?? 'Nợ đầu kỳ'} ·{' '}
                      {formatDay(payable.openedAt)}
                    </span>
                    <span className="font-semibold tabular-nums">
                      −{formatReportMoney(amount)}
                    </span>
                  </p>
                ))}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
