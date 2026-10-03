import { useEffect, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  SupplierForm,
  type DirectoryApi,
  type DirectoryCursor,
  type SupplierItem,
} from '@/features/directories';
import type { ConnectedExplorerApi } from '@/features/connected-explorer';

export function PurchaseSupplierPicker({
  api,
  explorerApi,
  supplierId,
  supplierName,
  seeds,
  onChange,
  onEditingChange,
  editable,
  canRead,
  canManage,
  online,
}: {
  api: DirectoryApi;
  explorerApi: ConnectedExplorerApi;
  supplierId: string;
  supplierName?: string | null;
  seeds: SupplierItem[];
  onChange: (id: string) => void;
  onEditingChange: (editing: boolean) => void;
  editable: boolean;
  canRead: boolean;
  canManage: boolean;
  online: boolean;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editor, setEditor] = useState<{ item: SupplierItem | null } | null>(
    null,
  );
  const [savedSupplier, setSavedSupplier] = useState<SupplierItem | null>(null);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const openEditor = (item: SupplierItem | null) => {
    setEditor({ item });
    onEditingChange(true);
  };
  const closeEditor = () => {
    setEditor(null);
    onEditingChange(false);
  };
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [search]);
  const suppliers = useInfiniteQuery({
    queryKey: ['purchase-suppliers', debouncedSearch],
    queryFn: ({ pageParam }) =>
      api.listSuppliers({
        search: debouncedSearch,
        cursor: pageParam,
        limit: 30,
      }),
    initialPageParam: undefined as DirectoryCursor | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: canRead && editable,
    retry: false,
  });
  const matches = suppliers.data?.pages.flatMap((page) => page.items) ?? [];
  const known = [savedSupplier, ...seeds, ...matches].find(
    (item) => item?.id === supplierId,
  );
  const selectedQuery = useQuery({
    queryKey: ['purchase-supplier', supplierId],
    queryFn: () => explorerApi.supplierDetail(supplierId),
    enabled: canRead && Boolean(supplierId) && !known,
    retry: false,
  });
  const selected = known ?? selectedQuery.data;
  const options = new Map(matches.map((item) => [item.id, item]));
  if (selected) options.set(selected.id, selected);
  const loadError = suppliers.isError || selectedQuery.isError;
  const savingApi: DirectoryApi = {
    ...api,
    async saveSupplier(input) {
      setSupplierSaving(true);
      try {
        const result = await api.saveSupplier(input);
        const saved: SupplierItem = {
          ...input.values,
          id: result.supplierId,
          version: result.version,
        };
        setSavedSupplier(saved);
        queryClient.setQueryData(['purchase-supplier', saved.id], saved);
        onChange(saved.id);
        return result;
      } finally {
        setSupplierSaving(false);
      }
    },
  };

  return (
    <div className="space-y-2">
      {editable && canRead ? (
        <label className="block text-sm font-semibold">
          Tìm nhà cung cấp
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tên, mã hoặc số điện thoại"
            className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
          />
        </label>
      ) : null}
      <label className="block text-sm font-semibold">
        Nhà cung cấp
        <select
          aria-label="Nhà cung cấp"
          value={supplierId}
          disabled={!editable || !canRead}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3"
        >
          <option value="">Không chọn</option>
          {supplierId && !selected ? (
            <option value={supplierId}>
              {supplierName || 'Nhà cung cấp đã chọn'}
            </option>
          ) : null}
          {[...options.values()].map((item) => (
            <option key={item.id} value={item.id} disabled={!item.isActive}>
              {item.name}
              {item.isActive ? '' : ' (ngừng hoạt động)'}
            </option>
          ))}
        </select>
      </label>
      {suppliers.isFetching || selectedQuery.isFetching ? (
        <p role="status" className="text-sm text-slate-600">
          Đang tải nhà cung cấp…
        </p>
      ) : null}
      {loadError ? (
        <div role="alert" className="text-sm text-red-700">
          Không thể tải nhà cung cấp. Lựa chọn hiện tại được giữ nguyên.
          <button
            type="button"
            onClick={() => {
              if (suppliers.isError) void suppliers.refetch();
              if (selectedQuery.isError) void selectedQuery.refetch();
            }}
            className="ml-2 min-h-11 font-semibold underline"
          >
            Thử lại nhà cung cấp
          </button>
        </div>
      ) : suppliers.isSuccess &&
        !suppliers.isFetching &&
        matches.length === 0 ? (
        <p className="text-sm text-slate-600">Không có nhà cung cấp phù hợp.</p>
      ) : null}
      {editable && suppliers.hasNextPage ? (
        <button
          type="button"
          disabled={suppliers.isFetchingNextPage}
          onClick={() => void suppliers.fetchNextPage()}
          className="min-h-11 text-sm font-semibold text-teal-800"
        >
          Xem thêm nhà cung cấp
        </button>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {canRead && supplierId ? (
          <Link
            to={`/more/suppliers/${supplierId}`}
            className="text-xs font-semibold text-teal-800 hover:underline"
          >
            Mở chi tiết Nhà cung cấp
          </Link>
        ) : null}
        {editable && canManage ? (
          <>
            <button
              type="button"
              disabled={!online}
              onClick={() => openEditor(null)}
              className="min-h-11 text-sm font-semibold text-teal-800"
            >
              Thêm nhà cung cấp
            </button>
            {supplierId ? (
              <button
                type="button"
                disabled={!online || !selected}
                onClick={() => selected && openEditor(selected)}
                className="min-h-11 text-sm font-semibold text-teal-800"
              >
                Sửa nhà cung cấp
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {editor && editable && canManage ? (
        <section aria-label="Thông tin nhà cung cấp">
          <p className="mb-3 text-sm text-slate-600">
            Lưu hoặc đóng thông tin nhà cung cấp để tiếp tục thao tác phiếu
            nhập.
          </p>
          <fieldset disabled={supplierSaving}>
            <SupplierForm
              key={editor.item?.id ?? 'new'}
              item={editor.item}
              api={savingApi}
              isOnline={online}
              onCancel={() => {
                if (!supplierSaving) closeEditor();
              }}
              onSaved={async () => {
                closeEditor();
                await queryClient.invalidateQueries({
                  queryKey: ['purchase-suppliers'],
                });
                await queryClient.invalidateQueries({
                  queryKey: ['directories', 'suppliers'],
                });
              }}
            />
          </fieldset>
        </section>
      ) : null}
    </div>
  );
}
