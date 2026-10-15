import { useContext, useId, useRef, useState } from 'react';
import { CaretRight, User } from '@phosphor-icons/react';
import { SessionContextValue } from '@/features/auth';
import { QuickCustomerDialog } from './QuickCustomerDialog';
import { useQuery } from '@tanstack/react-query';
import { usePrivateQueryKey } from '@/features/auth';
import {
  createDirectoryApi,
  type DirectoryCursor,
  type CustomerItem,
} from '@/features/directories';
import { createCustomerExplorerApi } from '@/features/connected-explorer';
import { SearchSelect } from '@/shared/ui/forms/SearchSelect';

export function CustomerPicker({
  value,
  disabled,
  onChange,
  selectedSnapshot,
  compact = false,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (id: string | null) => void;
  selectedSnapshot?: CustomerItem;
  compact?: boolean;
}) {
  const privateKey = usePrivateQueryKey();
  const auth = useContext(SessionContextValue);
  const canCreate =
    auth?.session?.permissions.includes('customer.manage') ?? false;
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const summaryButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const [api] = useState(createDirectoryApi);
  const [explorer] = useState(createCustomerExplorerApi);
  const [chosen, setChosen] = useState<CustomerItem | null>(null);
  const snapshot =
    chosen?.id === value
      ? chosen
      : selectedSnapshot?.id === value
        ? selectedSnapshot
        : null;
  const detail = useQuery({
    queryKey: privateKey('pos-customer', value),
    queryFn: () => explorer.customerDetail({ customerId: value! }),
    enabled: !!value && !snapshot,
  });
  const selected = snapshot ?? detail.data;
  const picker = (
    <>
      <SearchSelect<CustomerItem, DirectoryCursor>
        label="Khách hàng"
        value={value}
        disabled={disabled}
        selected={selected}
        queryKey={privateKey('pos-customers')}
        load={(search, cursor) =>
          api.listCustomers({ search, cursor, limit: 30 })
        }
        labelFor={(item) =>
          `${item.name}${item.phone ? ' · ' + item.phone : ''}`
        }
        emptyLabel="Khách lẻ"
        onChange={(item) => {
          setChosen(item);
          onChange(item?.id ?? null);
          if (compact) {
            setExpanded(false);
            requestAnimationFrame(() => summaryButton.current?.focus());
          }
        }}
      />
      {canCreate ? (
        <button
          ref={addButton}
          type="button"
          disabled={disabled}
          className="min-h-11 text-sm font-medium text-teal-800"
          onClick={() => setCreating(true)}
        >
          Thêm khách
        </button>
      ) : null}
      {creating && canCreate && !disabled ? (
        <QuickCustomerDialog
          key={auth?.session?.userId}
          open
          onClose={() => {
            setCreating(false);
            addButton.current?.focus();
          }}
          onCreated={(item) => {
            setChosen(item);
            onChange(item.id);
            setCreating(false);
            if (compact) setExpanded(false);
            requestAnimationFrame(() =>
              compact
                ? summaryButton.current?.focus()
                : document.getElementById('pos-product-search')?.focus(),
            );
          }}
        />
      ) : null}
      {detail.isError ? (
        <p role="alert" className="text-sm text-red-800">
          Không thể tải khách đã chọn.{' '}
          <button type="button" onClick={() => void detail.refetch()}>
            Thử lại
          </button>
        </p>
      ) : null}
    </>
  );
  if (!compact) return picker;
  return (
    <>
      <button
        ref={summaryButton}
        type="button"
        className="pos-context-row"
        disabled={disabled || creating}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
      >
        <User size={19} aria-hidden="true" />
        <span>
          {selected?.name ?? (value ? 'Đang tải khách hàng…' : 'Khách lẻ')}
        </span>
        <CaretRight size={20} aria-hidden="true" />
      </button>
      <div id={panelId} className="pos-customer-picker" hidden={!expanded}>
        {picker}
      </div>
    </>
  );
}
