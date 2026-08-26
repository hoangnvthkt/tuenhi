import { INTEGER_FINAL } from '@/shared/lib/numeric/canonical-number';
import type { PosCartItem } from './pos-types';

const POS_CART_PREFIX = 'tuenhi:pos:cart:';

export function posCartStorageKey(userId: string) {
  return `${POS_CART_PREFIX}${userId}`;
}

export function sanitizePersistedPosCartItems(value: unknown): PosCartItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is PosCartItem =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as PosCartItem).quantity === 'string' &&
      INTEGER_FINAL.test((item as PosCartItem).quantity) &&
      (item as PosCartItem).quantity.length <= 18,
  );
}
