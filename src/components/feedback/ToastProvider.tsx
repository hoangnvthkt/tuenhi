import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ToastContext, type ToastApi, type ToastInput } from './toast-context';

type ToastRecord = ToastInput & {
  id: string;
  revision: number;
};

function capVisibleToasts(toasts: ToastRecord[]) {
  const visible = [...toasts];
  while (visible.length > 3) {
    const removableIndex = visible.findIndex((toast) => toast.kind !== 'error');
    visible.splice(removableIndex >= 0 ? removableIndex : 0, 1);
  }
  return visible;
}

function ToastItem({
  toast,
  dismiss,
}: {
  toast: ToastRecord;
  dismiss: (id: string) => void;
}) {
  const timeout = toast.kind === 'success' ? 5_000 : 8_000;

  useEffect(() => {
    if (toast.kind === 'error') return;
    const timer = window.setTimeout(() => dismiss(toast.id), timeout);
    return () => window.clearTimeout(timer);
  }, [dismiss, timeout, toast.id, toast.kind]);

  const isError = toast.kind === 'error';
  return (
    <article
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={[
        'pointer-events-auto w-full rounded-xl border bg-white p-4 shadow-lg motion-safe:animate-[toast-in_160ms_ease-out]',
        isError ? 'border-red-200' : 'border-teal-200',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950">{toast.title}</p>
          {toast.message ? (
            <p className="mt-1 text-sm leading-5 text-slate-600">
              {toast.message}
            </p>
          ) : null}
          {toast.correlationId ? (
            <details className="mt-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium">
                Mã tra cứu
              </summary>
              <code className="mt-1 block break-all">
                {toast.correlationId}
              </code>
            </details>
          ) : null}
          {toast.actionRoute ? (
            <a
              href={toast.actionRoute}
              className="mt-3 inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-teal-800 hover:underline"
            >
              {toast.actionLabel ?? 'Xem chi tiết'}
            </a>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={`Đóng thông báo ${toast.title}`}
          onClick={() => dismiss(toast.id)}
          className="min-h-11 min-w-11 rounded-lg text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          ×
        </button>
      </div>
    </article>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const sequence = useRef(0);
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show(input) {
        sequence.current += 1;
        const revision = sequence.current;
        const safeInput = {
          ...input,
          title:
            input.title.trim() ||
            'Không thể hoàn tất thao tác. Vui lòng thử lại.',
        };
        let resultId = `toast-${revision}`;

        setToasts((current) => {
          const duplicateIndex = safeInput.dedupeKey
            ? current.findIndex(
                (toast) => toast.dedupeKey === safeInput.dedupeKey,
              )
            : -1;

          if (duplicateIndex >= 0) {
            const duplicate = current[duplicateIndex];
            if (!duplicate) return current;
            resultId = duplicate.id;
            return current.map((toast, index) =>
              index === duplicateIndex
                ? { ...safeInput, id: duplicate.id, revision }
                : toast,
            );
          }

          return capVisibleToasts([
            ...current,
            { ...safeInput, id: resultId, revision },
          ]);
        });

        return resultId;
      },
      dismiss,
    }),
    [dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-[calc(1rem+env(safe-area-inset-top))] z-50 flex flex-col gap-3 sm:left-auto sm:right-5 sm:w-[24rem]">
        {toasts.map((toast) => (
          <ToastItem
            key={`${toast.id}-${toast.revision}`}
            toast={toast}
            dismiss={dismiss}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
