import { useState } from 'react';
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
}: {
  value: string | null;
  disabled: boolean;
  onChange: (id: string | null) => void;
  selectedSnapshot?: CustomerItem;
}) {
  const privateKey = usePrivateQueryKey();
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
  return (
    <>
      <SearchSelect<CustomerItem, DirectoryCursor>
        label="Khách hàng"
        value={value}
        disabled={disabled}
        selected={snapshot ?? detail.data}
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
        }}
      />
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
}
