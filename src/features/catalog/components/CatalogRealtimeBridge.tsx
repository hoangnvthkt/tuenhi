import { useCatalogRealtime } from '../hooks/use-catalog-realtime';

export function CatalogRealtimeBridge({ isOnline }: { isOnline: boolean }) {
  useCatalogRealtime({ isOnline });
  return null;
}
