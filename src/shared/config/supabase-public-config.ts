import { z } from 'zod';

const supabasePublicConfigSchema = z.object({
  VITE_SUPABASE_URL: z.url().refine((value) => {
    if (!URL.canParse(value)) {
      return false;
    }

    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co');
  }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
});

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

export function parseSupabasePublicConfig(
  env: Record<string, unknown>,
): SupabasePublicConfig {
  const result = supabasePublicConfigSchema.safeParse(env);

  if (!result.success) {
    throw new Error(
      'Thiếu hoặc sai cấu hình Supabase công khai: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY.',
    );
  }

  return {
    url: result.data.VITE_SUPABASE_URL,
    publishableKey: result.data.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}
