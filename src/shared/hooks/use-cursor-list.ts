import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query';
export function useCursorList<
  P extends { items: unknown[]; nextCursor: unknown },
  C,
>({
  queryKey,
  load,
  id,
  enabled = true,
}: {
  queryKey: QueryKey;
  load: (cursor: C | undefined) => Promise<P>;
  id: (item: P['items'][number]) => string;
  enabled?: boolean;
}) {
  const query = useInfiniteQuery<
    P,
    Error,
    InfiniteData<P>,
    QueryKey,
    { cursor: C | undefined }
  >({
    queryKey,
    queryFn: ({ pageParam }) => load(pageParam.cursor),
    initialPageParam: { cursor: undefined },
    getNextPageParam: (page) =>
      page.nextCursor ? { cursor: page.nextCursor as C } : undefined,
    enabled,
  });
  const items = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [
        id(item),
        item,
      ]),
    ).values(),
  ] as P['items'];
  return {
    items,
    data: query.data,
    error: query.error,
    isLoading: query.isLoading,
    isPending: query.isPending,
    isSuccess: query.isSuccess,
    isError: query.isError,
    isFetching: query.isFetching,
    isFetchNextPageError: query.isFetchNextPageError,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
