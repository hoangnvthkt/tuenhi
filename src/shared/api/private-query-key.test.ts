import { QueryClient } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { privateQueryKey } from './private-query-key';
import { refreshOperationalData } from './refresh-operational-data';

it('isolates cached results while operational refresh still reaches the account keys', async () => {
  const client = new QueryClient();
  const owner = privateQueryKey('owner', 'reports', 'today');
  const viewer = privateQueryKey('viewer', 'reports', 'today');
  client.setQueryData(owner, 'owner revenue');
  expect(client.getQueryData(viewer)).toBeUndefined();
  await refreshOperationalData(client);
  expect(client.getQueryState(owner)?.isInvalidated).toBe(true);
});
