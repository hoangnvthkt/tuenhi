import { useContext, useEffect, useRef, useState } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router';
import {
  createDirectoryApi,
  type CustomerItem,
  type DirectoryCursor,
} from '@/features/directories';
import { DirectoryApiError } from '@/features/directories';
import {
  validateCustomer,
  type CustomerFormValues,
} from '@/features/directories';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';

function PendingNavigationGuard({ pending }: { pending: boolean }) {
  const blocker = useBlocker(pending);
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);
  return null;
}

export function QuickCustomerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: CustomerItem) => void;
}) {
  const [api] = useState(createDirectoryApi);
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const online = useOnlineStatus();
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const request = useRef<{
    values: CustomerFormValues;
    idempotencyKey: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<CustomerItem[]>([]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal?.();
    else dialog.current?.close?.();
  }, [open]);
  useEffect(() => {
    if (!unknown && !saving) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unknown, saving]);
  async function save() {
    if (busy.current || !online) return;
    const validated = validateCustomer({
      name,
      phone,
      code: '',
      email: '',
      address: '',
      notes: '',
      isActive: true,
      customerType: 'INDIVIDUAL',
      companyName: '',
      taxCode: '',
      customerGroup: '',
    });
    if (!validated.ok) {
      setError(Object.values(validated.fieldErrors).join(' '));
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      if (!request.current) {
        const found: CustomerItem[] = [];
        let cursor: DirectoryCursor | undefined;
        if (validated.data.phone)
          do {
            const page = await api.listCustomers({
              search: validated.data.phone,
              cursor,
              limit: 100,
            });
            if (!alive.current) return;
            found.push(
              ...page.items.filter(
                (item) => item.isActive && item.phone === validated.data.phone,
              ),
            );
            cursor = page.nextCursor ?? undefined;
          } while (cursor);
        if (found.length) {
          setDuplicates(found);
          return;
        }
        request.current = {
          values: validated.data,
          idempotencyKey: crypto.randomUUID(),
        };
      }
      const result = await api.saveCustomer(request.current);
      if (!alive.current) return;
      const values = request.current.values;
      onCreated({
        id: result.customerId,
        version: result.version,
        name: values.name,
        phone: values.phone || null,
        code: null,
        email: null,
        address: null,
        notes: null,
        isActive: true,
        customerType: 'INDIVIDUAL',
        companyName: null,
        taxCode: null,
        customerGroup: null,
      });
    } catch (cause) {
      if (!alive.current) return;
      if (request.current && !(cause instanceof DirectoryApiError)) {
        setUnknown(true);
        setError(
          'Chưa xác định kết quả. Giữ trang này và thử lại cùng yêu cầu để tránh tạo trùng.',
        );
      } else {
        request.current = null;
        setUnknown(false);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Không thể lưu khách hàng. Vui lòng thử lại.',
        );
      }
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }
  if (!open) return null;
  return (
    <dialog
      onKeyDown={(e) => e.stopPropagation()}
      ref={dialog}
      aria-labelledby="quick-customer-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving && !unknown) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-slate-950/40"
    >
      {dataRouter ? (
        <PendingNavigationGuard pending={saving || unknown} />
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="quick-customer-title" className="text-lg font-semibold">
          Thêm khách hàng
        </h2>
        <label className="mt-4 block text-sm font-medium">
          Tên khách hàng
          <input
            autoFocus
            required
            maxLength={200}
            value={name}
            disabled={saving || unknown}
            onChange={(e) => {
              setName(e.target.value);
              setDuplicates([]);
            }}
            className="mt-1 min-h-11 w-full rounded-lg border px-3"
          />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Số điện thoại (tùy chọn)
          <input
            type="tel"
            maxLength={30}
            value={phone}
            disabled={saving || unknown}
            onChange={(e) => {
              setPhone(e.target.value);
              setDuplicates([]);
            }}
            className="mt-1 min-h-11 w-full rounded-lg border px-3"
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {duplicates.length ? (
          <div className="mt-3 rounded-lg bg-amber-50 p-3">
            <p>
              Số điện thoại đã có khách. Chọn khách hiện có hoặc sửa số điện
              thoại.
            </p>
            {duplicates.map((item) => (
              <button
                className="mt-2 min-h-11 text-teal-800"
                type="button"
                key={item.id}
                onClick={() => onCreated(item)}
              >
                Chọn {item.name} · {item.phone}
              </button>
            ))}
          </div>
        ) : null}
        {!online ? (
          <p role="alert">Đang mất mạng. Kết nối lại để lưu khách.</p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={saving || unknown}
            onClick={onClose}
            className="min-h-11 flex-1 rounded-lg border"
          >
            Đóng
          </button>
          <button
            type="submit"
            disabled={saving || !online}
            className="min-h-11 flex-1 rounded-lg bg-teal-700 px-3 text-white disabled:opacity-50"
          >
            {saving
              ? 'Đang lưu…'
              : unknown
                ? 'Thử lại cùng yêu cầu'
                : 'Lưu và chọn'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
