import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  CatalogApiError,
  catalogKeys,
  createCatalogApi,
  type CatalogApi,
} from '../api/catalog-api';
import type { CategoryOption } from '../model/catalog-types';

function categoryErrorMessage(error: CatalogApiError) {
  if (error.code === 'CATEGORY_IN_USE') {
    return 'Nhóm hàng đang được sản phẩm sử dụng nên chưa thể ngừng hoạt động.';
  }
  if (error.code === 'DUPLICATE_IN_DATABASE') {
    return 'Tên nhóm hàng đã tồn tại.';
  }
  if (error.code === 'REFERENCE_NOT_FOUND') {
    return 'Nhóm hàng không còn tồn tại. Vui lòng tải lại dữ liệu.';
  }
  return error.message;
}

function CategoryRow({
  category,
  isOnline,
  isWorking,
  onSave,
}: {
  category: CategoryOption;
  isOnline: boolean;
  isWorking: boolean;
  onSave: (name: string, isActive: boolean, action: string) => Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  const disabled = !isOnline || isWorking;

  return (
    <li className="grid gap-3 border-b border-slate-200 p-4 last:border-b-0 md:grid-cols-[minmax(12rem,1fr)_auto_auto] md:items-end">
      <div>
        <label
          htmlFor={`category-${category.id}`}
          className="mb-2 block text-sm font-medium text-slate-800"
        >
          Tên nhóm {category.name}
        </label>
        <input
          id={`category-${category.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
        />
        {!category.isActive ? (
          <span className="mt-2 inline-flex rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
            Đã ngừng hoạt động
          </span>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled || name.trim() === ''}
        onClick={() =>
          void onSave(name.trim(), category.isActive, `rename:${category.id}`)
        }
        aria-label={`Lưu nhóm ${category.name}`}
        className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Lưu tên
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          void onSave(
            name.trim(),
            !category.isActive,
            `status:${category.id}:${!category.isActive}`,
          )
        }
        aria-label={`${category.isActive ? 'Ngừng' : 'Bật'} nhóm ${category.name}`}
        className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {category.isActive ? 'Ngừng hoạt động' : 'Bật lại'}
      </button>
    </li>
  );
}

export function CategoryManager({
  api: apiProp,
  isOnline,
}: {
  api?: CatalogApi;
  isOnline: boolean;
}) {
  const [api] = useState(() => apiProp ?? createCatalogApi());
  const [newName, setNewName] = useState('');
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const operationKeys = useRef(new Map<string, string>());
  const query = useQuery({
    queryKey: catalogKeys.categories(true),
    queryFn: () => api.listCategories(true),
  });

  async function saveCategory(input: {
    categoryId?: string;
    name: string;
    isActive: boolean;
    action: string;
  }) {
    if (!isOnline || workingAction) return;
    const idempotencyKey =
      operationKeys.current.get(input.action) ?? crypto.randomUUID();
    operationKeys.current.set(input.action, idempotencyKey);
    setWorkingAction(input.action);
    setErrorMessage(null);
    setCorrelationId(null);
    try {
      await api.saveCategory({
        categoryId: input.categoryId,
        name: input.name,
        isActive: input.isActive,
        idempotencyKey,
      });
      operationKeys.current.delete(input.action);
      if (!input.categoryId) setNewName('');
      await query.refetch();
    } catch (error) {
      if (error instanceof CatalogApiError) {
        operationKeys.current.delete(input.action);
        setErrorMessage(categoryErrorMessage(error));
        setCorrelationId(error.correlationId);
      } else {
        setErrorMessage(
          'Chưa xác định được kết quả. Vui lòng kiểm tra lại nhóm hàng trước khi thử lại.',
        );
      }
    } finally {
      setWorkingAction(null);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Nhóm hàng
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Tổ chức danh mục bằng cách thêm, đổi tên hoặc ngừng nhóm hàng.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const name = newName.trim();
          if (name) {
            void saveCategory({
              name,
              isActive: true,
              action: `create:${name}`,
            });
          }
        }}
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(12rem,1fr)_auto] md:items-end"
      >
        <div>
          <label
            htmlFor="new-category-name"
            className="mb-2 block text-sm font-medium"
          >
            Tên nhóm hàng mới
          </label>
          <input
            id="new-category-name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={120}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
          />
        </div>
        <button
          disabled={
            !isOnline || Boolean(workingAction) || newName.trim() === ''
          }
          className="min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Thêm nhóm
        </button>
      </form>

      {!isOnline ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Cần kết nối mạng để cập nhật nhóm hàng.
        </p>
      ) : null}
      {errorMessage ? (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          <p>{errorMessage}</p>
          {correlationId ? (
            <code className="mt-1 block text-xs">{correlationId}</code>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {query.isPending ? (
          <p className="p-5 text-sm text-slate-600">Đang tải nhóm hàng…</p>
        ) : null}
        {query.isError ? (
          <div role="alert" className="p-5 text-sm text-red-800">
            <p>Không thể tải nhóm hàng.</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-3 min-h-11 rounded-lg border border-red-300 px-4 font-semibold"
            >
              Thử lại
            </button>
          </div>
        ) : null}
        {query.data?.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Chưa có nhóm hàng.</p>
        ) : null}
        <ul>
          {query.data?.map((category) => (
            <CategoryRow
              key={`${category.id}:${category.name}:${category.isActive}`}
              category={category}
              isOnline={isOnline}
              isWorking={Boolean(workingAction)}
              onSave={(name, isActive, action) =>
                saveCategory({
                  categoryId: category.id,
                  name,
                  isActive,
                  action,
                })
              }
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
