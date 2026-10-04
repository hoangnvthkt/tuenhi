import { beforeEach, expect, it } from 'vitest';
import { readStaffCreation, writeStaffCreation } from './staff-recovery';
beforeEach(() => localStorage.clear());
it('scopes pending operations to their actor and persists no extra payload', () => {
  const marker = {
    action: 'create' as const,
    idempotencyKey: '00000000-0000-4000-8000-000000000111',
    targetId: null,
  };
  writeStaffCreation('owner-a', {
    ...marker,
    password: 'secret',
  } as typeof marker);
  expect(readStaffCreation('owner-a')).toEqual(marker);
  expect(readStaffCreation('owner-b')).toBeNull();
  expect(JSON.stringify(localStorage)).not.toContain('secret');
  writeStaffCreation('owner-b', null);
  expect(readStaffCreation('owner-a')).toEqual(marker);
});
it('fails closed on a corrupted marker', () => {
  localStorage.setItem('tuenhi.staff-recovery:owner-a:create', '{broken');
  expect(() => readStaffCreation('owner-a')).toThrow(/Không đọc/);
});

it('isolates reactivation by both actor and target', async () => {
  const { readStaffReactivation, writeStaffReactivation } =
    await import('./staff-recovery');
  const targetId = '00000000-0000-4000-8000-000000000111';
  const marker = {
    action: 'reactivate' as const,
    targetId,
    idempotencyKey: '00000000-0000-4000-8000-000000000112',
  };
  writeStaffReactivation('owner-a', targetId, marker);
  expect(readStaffReactivation('owner-a', targetId)).toEqual(marker);
  expect(readStaffReactivation('owner-b', targetId)).toBeNull();
  expect(readStaffReactivation('owner-a', marker.idempotencyKey)).toBeNull();
});
