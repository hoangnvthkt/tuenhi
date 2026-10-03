import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query';

type Option = { id: string; name: string };
export function SearchSelect<T extends Option, C>({
  label,
  value,
  selected,
  disabled = false,
  queryKey,
  load,
  labelFor,
  onChange,
  excludedIds,
  emptyLabel = 'Chưa chọn',
}: {
  label: string;
  value: string | null;
  selected?: T | null;
  disabled?: boolean;
  queryKey: QueryKey;
  load: (
    search: string,
    cursor: C | undefined,
  ) => Promise<{ items: T[]; nextCursor: C | null }>;
  labelFor: (item: T) => string;
  onChange: (item: T | null) => void;
  excludedIds?: Set<string>;
  emptyLabel?: string;
}) {
  const [search, setSearch] = useState('');
  const [resolvedSearch, setResolvedSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const activeOption = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setResolvedSearch(search.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [search]);
  type Page = { items: T[]; nextCursor: C | null };
  const query = useInfiniteQuery<
    Page,
    Error,
    InfiniteData<Page>,
    QueryKey,
    { cursor: C | undefined }
  >({
    queryKey: [...queryKey, resolvedSearch],
    queryFn: ({ pageParam }) => load(resolvedSearch, pageParam.cursor),
    initialPageParam: { cursor: undefined },
    getNextPageParam: (page) =>
      page.nextCursor === null ? undefined : { cursor: page.nextCursor },
    enabled: open && !disabled,
  });
  const options = useMemo(
    () =>
      [
        ...new Map(
          (query.data?.pages.flatMap((page) => page.items) ?? []).map(
            (item) => [item.id, item],
          ),
        ).values(),
      ].filter((item) => item.id === value || !excludedIds?.has(item.id)),
    [query.data, value, excludedIds],
  );
  const ready = search.trim() === resolvedSearch && !query.isFetching;
  useEffect(() => {
    if (open && ready)
      activeOption.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open, ready, active, options]);
  const chosen =
    selected?.id === value
      ? selected
      : options.find((item) => item.id === value);
  function choose(item: T | null) {
    if (disabled) return;
    onChange(item);
    setOpen(false);
    setSearch('');
    setActive(0);
  }
  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label className="block text-sm font-medium">
        {label}
        <input
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && ready && options[active] ? `${listId}-${active}` : undefined
          }
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={search}
          placeholder={`Tìm ${label.toLocaleLowerCase('vi-VN')}`}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              event.stopPropagation();
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                open ? Math.min(index + 1, Math.max(options.length - 1, 0)) : 0,
              );
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(0, index - 1));
            }
            if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (ready && options[active]) choose(options[active]);
            }
          }}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"
        />
      </label>
      <p
        aria-label={`${label} đã chọn`}
        className="mt-1 text-sm font-semibold text-slate-700"
      >
        {chosen ? labelFor(chosen) : value ? 'Đang tải lựa chọn…' : emptyLabel}
      </p>
      {open && !disabled ? (
        <div className="mt-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <button
            type="button"
            onClick={() => choose(null)}
            className="min-h-11 px-3 text-sm text-slate-600"
          >
            {emptyLabel}
          </button>
          {query.isError ? (
            <div>
              <p role="alert">Không thể tải danh sách.</p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="min-h-11 px-3 text-teal-800"
              >
                Thử lại
              </button>
            </div>
          ) : null}
          {!ready ? (
            <p role="status" className="p-3 text-sm">
              Đang tìm…
            </p>
          ) : null}
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="max-h-56 overflow-y-auto"
          >
            {ready
              ? options.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      id={`${listId}-${index}`}
                      aria-selected={index === active}
                      ref={index === active ? activeOption : undefined}
                      onClick={() => choose(item)}
                      className={`min-h-11 w-full rounded px-3 text-left text-sm ${index === active ? 'bg-teal-100 font-semibold text-teal-950' : 'hover:bg-teal-50'}`}
                    >
                      {labelFor(item)}
                    </button>
                  </li>
                ))
              : null}
          </ul>
          {ready && !query.isError && !options.length ? (
            <p className="p-3 text-sm">Không tìm thấy kết quả.</p>
          ) : null}
          {query.hasNextPage ? (
            <button
              type="button"
              disabled={!ready}
              onClick={() => void query.fetchNextPage()}
              className="min-h-11 px-3 text-sm font-semibold text-teal-800"
            >
              Tải thêm
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-11 px-3 text-sm"
          >
            Đóng danh sách
          </button>
        </div>
      ) : null}
    </div>
  );
}
