import { describe, expect, it } from 'vitest';
import { parseSupabasePublicConfig } from './supabase-public-config';

describe('parseSupabasePublicConfig', () => {
  it('returns only the browser-safe Supabase values', () => {
    expect(
      parseSupabasePublicConfig({
        VITE_SUPABASE_URL: 'https://sample.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
        SUPABASE_DB_PASSWORD: 'database-secret',
      }),
    ).toEqual({
      url: 'https://sample.supabase.co',
      publishableKey: 'sb_publishable_test',
    });
  });

  it('rejects missing values without echoing submitted secrets', () => {
    const run = () =>
      parseSupabasePublicConfig({
        VITE_SUPABASE_URL: 'not-a-url',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'secret-value',
      });

    expect(run).toThrow(
      'Thiếu hoặc sai cấu hình Supabase công khai: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.',
    );

    try {
      run();
    } catch (error) {
      expect(String(error)).not.toContain('secret-value');
    }
  });
});
