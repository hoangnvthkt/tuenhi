import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePrivateQueryKey } from '@/features/auth';
import { SearchSelect } from '@/shared/ui/forms/SearchSelect';
import { createCatalogApi } from '../api/catalog-api';
import type { CatalogCursor } from '../model/catalog-types';
type ProductOption = {
  id: string;
  name: string;
  sku: string;
  isActive?: boolean;
  defaultCost?: string | null;
};
export function ProductSelect({
  label,
  value,
  disabled,
  readOnly,
  selectedSnapshot,
  excludedIds,
  includeInactive = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  readOnly?: boolean;
  selectedSnapshot?: ProductOption;
  excludedIds?: Set<string>;
  includeInactive?: boolean;
  onChange: (id: string, product?: ProductOption | null) => void;
}) {
  const privateKey = usePrivateQueryKey();
  const [api] = useState(createCatalogApi);
  const [chosen, setChosen] = useState<ProductOption | null>(null);
  const snapshot =
    chosen?.id === value
      ? chosen
      : selectedSnapshot?.id === value
        ? selectedSnapshot
        : null;
  const detail = useQuery({
    queryKey: privateKey('catalog-product', value),
    queryFn: () => api.detail(value),
    enabled: !!value && !snapshot,
  });
  const selected = snapshot ?? detail.data;
  const labelFor = (item: ProductOption) =>
    `${item.sku} — ${item.name}${item.isActive === false ? ' (ngừng kinh doanh)' : ''}`;
  return (
    <>
      {readOnly ? (
        <p aria-label={label}>
          {selected
            ? labelFor(selected)
            : value
              ? 'Đang tải sản phẩm…'
              : 'Chưa chọn sản phẩm'}
        </p>
      ) : (
        <SearchSelect<ProductOption, CatalogCursor>
          label={label}
          value={value || null}
          selected={selected}
          disabled={disabled}
          excludedIds={excludedIds}
          queryKey={privateKey('catalog-select', includeInactive)}
          load={(search, cursor) =>
            api.list({ search, cursor, limit: 30, includeInactive })
          }
          labelFor={labelFor}
          emptyLabel="Chưa chọn sản phẩm"
          onChange={(item) => {
            setChosen(item);
            onChange(item?.id ?? '', item);
          }}
        />
      )}
      {detail.isError ? (
        <p role="alert">
          Không thể tải sản phẩm đã chọn.{' '}
          <button type="button" onClick={() => void detail.refetch()}>
            Thử lại
          </button>
        </p>
      ) : null}
    </>
  );
}
