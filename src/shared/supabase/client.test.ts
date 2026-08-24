import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseClient } from './client';

describe('createSupabaseClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('targets the api schema for Data API requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('[]', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createSupabaseClient({
      url: 'https://example.supabase.co',
      publishableKey: 'publishable-test-key',
    });

    const result = await client.from('profiles').select('id');

    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();

    const [request, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(request)).toBe(
      'https://example.supabase.co/rest/v1/profiles?select=id',
    );

    const headers = new Headers(init?.headers);
    expect(headers.get('accept-profile')).toBe('api');
  });
});
