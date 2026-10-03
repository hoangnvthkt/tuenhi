/** Append scope so family-prefix invalidation continues to work. */
export function privateQueryKey(
  userId: string,
  ...parts: readonly unknown[]
): readonly unknown[] {
  return [...parts, { accountId: userId }];
}
