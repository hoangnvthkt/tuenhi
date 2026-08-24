const POS_CART_PREFIX = 'tuenhi:pos:cart:';

export function posCartStorageKey(userId: string) {
  return `${POS_CART_PREFIX}${userId}`;
}
