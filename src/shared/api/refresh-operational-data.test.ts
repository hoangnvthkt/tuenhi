import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { refreshOperationalData } from './refresh-operational-data';

const clients: QueryClient[] = [];

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

function observeQuery(
  client: QueryClient,
  key: readonly string[],
  onFetch: () => void,
) {
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: async () => {
      onFetch();
      return key.join(':');
    },
    retry: false,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  return { observer, unsubscribe };
}

describe('refreshOperationalData', () => {
  it('refetches active operational data without refetching unrelated active queries', async () => {
    const client = new QueryClient();
    clients.push(client);
    let salesFetches = 0;
    let connectedExplorerFetches = 0;
    let staffFetches = 0;
    const sales = observeQuery(client, ['sales', ''], () => {
      salesFetches += 1;
    });
    const staff = observeQuery(client, ['staff'], () => {
      staffFetches += 1;
    });
    const connectedExplorer = observeQuery(
      client,
      ['connected-explorer', 'supplier', 'supplier-id'],
      () => {
        connectedExplorerFetches += 1;
      },
    );

    await sales.observer.refetch();
    await staff.observer.refetch();
    await connectedExplorer.observer.refetch();
    const salesBeforeRefresh = salesFetches;
    const connectedExplorerBeforeRefresh = connectedExplorerFetches;
    const staffBeforeRefresh = staffFetches;
    await refreshOperationalData(client);

    expect(salesFetches).toBe(salesBeforeRefresh + 1);
    expect(connectedExplorerFetches).toBe(connectedExplorerBeforeRefresh + 1);
    expect(staffFetches).toBe(staffBeforeRefresh);
    client.setQueryData(['reports', '2026-08-01'], 'cached');
    await refreshOperationalData(client);
    expect(
      client.getQueryCache().find({ queryKey: ['reports', '2026-08-01'] })
        ?.state.isInvalidated,
    ).toBe(true);
    sales.unsubscribe();
    connectedExplorer.unsubscribe();
    staff.unsubscribe();
  });
});
