export function ListPagination({
  query,
  errorMessage = 'Không thể tải danh sách.',
}: {
  errorMessage?: string;
  query: {
    isPending: boolean;
    isError: boolean;
    isFetching: boolean;
    isFetchNextPageError: boolean;
    hasNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
    refetch: () => Promise<unknown>;
  };
}) {
  return (
    <div className="my-3 space-y-2">
      {query.isPending ? (
        <p role="status" className="text-sm text-slate-600">
          Đang tải danh sách…
        </p>
      ) : null}
      {query.isError ? (
        <div>
          <p role="alert" className="text-sm text-red-800">
            {errorMessage}
          </p>
          <button
            type="button"
            disabled={query.isFetching}
            onClick={() =>
              void (query.isFetchNextPageError
                ? query.fetchNextPage()
                : query.refetch())
            }
            className="min-h-11 rounded-lg border px-4"
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {query.hasNextPage && !query.isError ? (
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold"
        >
          {query.isFetching ? 'Đang tải…' : 'Tải thêm'}
        </button>
      ) : null}
    </div>
  );
}
