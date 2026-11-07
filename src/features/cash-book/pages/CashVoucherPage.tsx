import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { useToast } from '@/shared/ui/feedback/use-toast';
import { ViNumberInput } from '@/shared/ui/forms/ViNumberInput';
import { FinancialOutcomeUnknownError } from '@/shared/api/financial-command';
import {
  createCashBookApi,
  fundSchema,
  type Fund,
  type VoucherCategory,
} from '../api/cash-book-api';
import { fundLabel, transferLabel } from '../model/cash-labels';
import { invalidateCashQueries } from '../model/cash-queries';

type Category = Exclude<VoucherCategory, 'REVERSAL'>;

function categories(direction: 'IN' | 'OUT', fund: Fund): [Category, string][] {
  return direction === 'IN'
    ? [
        ['OWNER_CONTRIBUTION', 'Chủ nộp tiền'],
        ['OTHER', 'Thu khác'],
      ]
    : [
        ['EXPENSE', 'Chi phí cửa hàng (điện, nước, ship…)'],
        ['OWNER_WITHDRAWAL', 'Rút tiền về chủ'],
        ['FUND_TRANSFER', transferLabel(fund, 'OUT')],
        ['OTHER', 'Chi khác'],
      ];
}

export function CashVoucherPage() {
  const { session } = useSession();
  const run = useFinancialCommand(session?.userId);
  const online = useOnlineStatus();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [api] = useState(createCashBookApi);
  const [params] = useSearchParams();
  const direction = params.get('direction') === 'IN' ? 'IN' : 'OUT';
  const parsedFund = fundSchema.safeParse(params.get('fund'));
  const [fund, setFund] = useState<Fund>(
    parsedFund.success ? parsedFund.data : 'CASH',
  );
  const [category, setCategory] = useState<Category>(
    direction === 'IN' ? 'OWNER_CONTRIBUTION' : 'EXPENSE',
  );
  const [amount, setAmount] = useState('');
  const [party, setParty] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  // One form = one voucher: retries after a lost response reuse its request.
  const [entityId, setEntityId] = useState(() => crypto.randomUUID());
  const title = direction === 'IN' ? 'Lập phiếu thu' : 'Lập phiếu chi';
  const valid =
    /^\d+(\.\d{1,2})?$/.test(amount) && /[1-9]/.test(amount) && memo.trim();

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const result = await run({
        commandName: 'cash.voucher.create',
        entityId,
        invoke: (idempotencyKey) =>
          api.createVoucher({
            fund,
            direction,
            category,
            amount,
            party: party.trim(),
            memo: memo.trim(),
            idempotencyKey,
          }),
        parseCachedResponse: api.parseVoucher,
      });
      setEntityId(crypto.randomUUID());
      toast.show({ kind: 'success', title: `Đã lưu ${result.voucherNumber}` });
      await invalidateCashQueries(queryClient);
      void navigate(`/cash-book?fund=${fund}`);
    } catch (error) {
      toast.show({
        kind: 'error',
        title: 'Chưa thể lưu phiếu',
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
        to={`/cash-book?fund=${fund}`}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800"
      >
        Về sổ quỹ
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-slate-950">
        {title}
      </h1>
      <form
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-900">Quỹ</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['CASH', 'BANK'] as const).map((item) => (
              <label
                key={item}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border text-sm font-semibold ${fund === item ? 'border-2 border-teal-700 bg-teal-50 text-teal-900' : 'border-slate-300 text-slate-700'}`}
              >
                <input
                  type="radio"
                  name="fund"
                  checked={fund === item}
                  onChange={() => setFund(item)}
                />
                {fundLabel[item]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-semibold text-slate-900">
          {direction === 'IN' ? 'Loại thu' : 'Loại chi'}
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
            className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal"
          >
            {categories(direction, fund).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-900">
          Số tiền
          <ViNumberInput
            maxFractionDigits={2}
            value={amount}
            onChange={setAmount}
            maxLength={27}
            className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 px-3 text-right text-xl font-semibold tabular-nums"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-900">
          {direction === 'IN' ? 'Người nộp' : 'Người nhận'}
          <input
            value={party}
            onChange={(event) => setParty(event.target.value)}
            maxLength={200}
            className="mt-1 block min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base font-normal"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-900">
          Nội dung
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal"
          />
        </label>
        <button
          type="submit"
          disabled={!online || busy || !valid}
          className="min-h-12 w-full rounded-xl bg-teal-700 text-base font-bold text-white disabled:opacity-50"
        >
          {direction === 'IN' ? 'Lưu phiếu thu' : 'Lưu phiếu chi'}
        </button>
      </form>
    </section>
  );
}
