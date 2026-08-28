import type { OpeningApi } from '../api/opening-api';
import type { OpeningDocument } from '../api/opening-schemas';
import { useFinancialCommand } from '@/shared/hooks/use-financial-command';

export function OpeningActions({
  api,
  document,
  editable,
  online,
  busy,
  onSave,
  onPerform,
  userId,
}: {
  api: OpeningApi;
  document: OpeningDocument | null;
  editable: boolean;
  online: boolean;
  busy: boolean;
  onSave: () => Promise<void>;
  onPerform: (
    action: () => Promise<unknown>,
    success: string,
    redirect?: boolean,
  ) => Promise<void>;
  userId?: string;
}) {
  const runFinancialCommand = useFinancialCommand(userId);
  return (
    <div className="sticky bottom-20 z-20 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg lg:static lg:border-0 lg:bg-slate-50 lg:p-0 lg:py-2 lg:shadow-none">
      {editable ? (
        <button
          disabled={!online || busy}
          onClick={() => void onSave()}
          className="min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Lưu nháp
        </button>
      ) : null}
      {document?.status === 'DRAFT' ? (
        <button
          disabled={!online || busy}
          onClick={() =>
            void onPerform(
              () => api.command('submit', document.id, document.version),
              'Đã hoàn tất kiểm đếm',
            )
          }
          className="min-h-11 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Hoàn tất kiểm đếm
        </button>
      ) : null}
      {document?.status === 'COUNTED' ? (
        <button
          disabled={!online || busy}
          onClick={() =>
            void onPerform(
              () =>
                runFinancialCommand({
                  commandName: 'opening.post',
                  entityId: document.id,
                  invoke: (idempotencyKey) =>
                    api.command(
                      'post',
                      document.id,
                      document.version,
                      '',
                      idempotencyKey,
                    ),
                  parseCachedResponse: api.parseMutationResponse,
                }),
              'Đã ghi sổ tồn đầu kỳ',
            )
          }
          className="min-h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Ghi sổ
        </button>
      ) : null}
      {document && ['DRAFT', 'COUNTED'].includes(document.status) ? (
        <button
          disabled={!online || busy}
          onClick={() =>
            void onPerform(
              () =>
                api.command(
                  'cancel',
                  document.id,
                  document.version,
                  'Owner hủy phiếu',
                ),
              'Đã hủy phiếu mở sổ',
              true,
            )
          }
          className="min-h-11 px-5 text-sm font-semibold text-red-700 disabled:opacity-50"
        >
          Hủy phiếu
        </button>
      ) : null}
    </div>
  );
}
