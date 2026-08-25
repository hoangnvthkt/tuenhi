import { describe, expect, it } from 'vitest';
import {
  canCreateStaff,
  parseStaffAccessPolicy,
} from '../../../../supabase/functions/_shared/staff-access-policy';

describe('staff access policy', () => {
  it('allows employee creation only for an audited waiver or real leaked-password protection', () => {
    expect(canCreateStaff('OWNER_WAIVER')).toBe(true);
    expect(canCreateStaff('LEAKED_PASSWORD_PROTECTED')).toBe(true);
    expect(canCreateStaff('BLOCKED')).toBe(false);
    expect(canCreateStaff(undefined)).toBe(false);
  });

  it('rejects lifecycle values outside the stable policy contract', () => {
    expect(parseStaffAccessPolicy('BLOCKED')).toBe('BLOCKED');
    expect(parseStaffAccessPolicy('unexpected')).toBeNull();
    expect(parseStaffAccessPolicy({ policy: 'OWNER_WAIVER' })).toBeNull();
  });
});
