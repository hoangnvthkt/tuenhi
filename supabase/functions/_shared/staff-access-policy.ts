export type StaffAccessPolicy =
  'BLOCKED' | 'OWNER_WAIVER' | 'LEAKED_PASSWORD_PROTECTED';

export function parseStaffAccessPolicy(
  value: unknown,
): StaffAccessPolicy | null {
  if (
    value === 'BLOCKED' ||
    value === 'OWNER_WAIVER' ||
    value === 'LEAKED_PASSWORD_PROTECTED'
  ) {
    return value;
  }
  return null;
}

export function canCreateStaff(value: unknown): boolean {
  const policy = parseStaffAccessPolicy(value);
  return policy === 'OWNER_WAIVER' || policy === 'LEAKED_PASSWORD_PROTECTED';
}
