import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useOnlineStatus } from '@/shared/hooks/use-online-status';
import { getSupabaseClient } from '@/shared/supabase/client';
import { useSession } from '../auth/use-session';
import { catalogKeys } from './catalog-api';

export type CatalogRealtimeEvent = {
  table: 'products' | 'product_images' | 'inventory_balances';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

export interface CatalogRealtimeTransport {
  subscribe(handler: (event: CatalogRealtimeEvent) => void): () => void;
}

function createRealtimeTransport(): CatalogRealtimeTransport {
  return {
    subscribe(handler) {
      const client = getSupabaseClient();
      const channel = client
        .channel('catalog-query-invalidation')
        .on(
          'postgres_changes',
          { event: '*', schema: 'api', table: 'products' },
          (payload) =>
            handler({
              table: 'products',
              new: payload.new,
              old: payload.old,
            }),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'api', table: 'product_images' },
          (payload) =>
            handler({
              table: 'product_images',
              new: payload.new,
              old: payload.old,
            }),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'api', table: 'inventory_balances' },
          (payload) =>
            handler({
              table: 'inventory_balances',
              new: payload.new,
              old: payload.old,
            }),
        )
        .subscribe();
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}

function recordString(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
  key: string,
) {
  const value = first[key] ?? second[key];
  return typeof value === 'string' ? value : null;
}

export function useCatalogRealtime({
  transport: transportProp,
  isOnline: onlineProp,
}: {
  transport?: CatalogRealtimeTransport;
  isOnline?: boolean;
} = {}) {
  const [transport] = useState(
    () => transportProp ?? createRealtimeTransport(),
  );
  const queryClient = useQueryClient();
  const { status, session } = useSession();
  const detectedOnline = useOnlineStatus();
  const isOnline = onlineProp ?? detectedOnline;
  const previousOnline = useRef(isOnline);

  useEffect(() => {
    if (status !== 'authenticated' || !session || !isOnline) return;
    return transport.subscribe((event) => {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      const productId =
        event.table === 'products'
          ? recordString(event.new, event.old, 'id')
          : recordString(event.new, event.old, 'product_id');
      if (productId) {
        void queryClient.invalidateQueries({
          queryKey: catalogKeys.detail(productId),
        });
      }
    });
  }, [isOnline, queryClient, session, status, transport]);

  useEffect(() => {
    const reconnected = !previousOnline.current && isOnline;
    previousOnline.current = isOnline;
    if (reconnected && status === 'authenticated' && session) {
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    }
  }, [isOnline, queryClient, session, status]);
}
