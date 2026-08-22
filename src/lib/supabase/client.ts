import { createClient } from '@supabase/supabase-js';
import {
  parseSupabasePublicConfig,
  type SupabasePublicConfig,
} from '../config/supabase-public-config';
import type { Database } from './database.types';

export function createSupabaseClient(config: SupabasePublicConfig) {
  return createClient<Database, 'api'>(config.url, config.publishableKey, {
    db: {
      schema: 'api',
    },
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
}

let browserClient: ReturnType<typeof createSupabaseClient> | undefined;

export function getSupabaseClient() {
  browserClient ??= createSupabaseClient(
    parseSupabasePublicConfig(import.meta.env),
  );

  return browserClient;
}
