import { z } from 'zod';

const markerSchema = z.object({
  action: z.literal('create'),
  idempotencyKey: z.uuid(),
  targetId: z.uuid().nullable(),
});
export type StaffCreationMarker = z.infer<typeof markerSchema>;
const key = (actorId: string) => `tuenhi.staff-recovery:${actorId}:create`;

export function readStaffCreation(actorId: string): StaffCreationMarker | null {
  const value = localStorage.getItem(key(actorId));
  if (!value) return null;
  try {
    const parsed = markerSchema.safeParse(JSON.parse(value));
    if (parsed.success) return parsed.data;
  } catch {
    /* An unreadable marker must not enable another create. */
  }
  throw new Error(
    'Không đọc được yêu cầu đang chờ. Liên hệ hỗ trợ trước khi tạo tiếp.',
  );
}
export function writeStaffCreation(
  actorId: string,
  marker: StaffCreationMarker | null,
) {
  if (marker)
    localStorage.setItem(
      key(actorId),
      JSON.stringify(markerSchema.parse(marker)),
    );
  else localStorage.removeItem(key(actorId));
}

const reactivationSchema = z.object({
  action: z.literal('reactivate'),
  idempotencyKey: z.uuid(),
  targetId: z.uuid(),
});
export type StaffReactivationMarker = z.infer<typeof reactivationSchema>;
const reactivationKey = (actorId: string, targetId: string) =>
  `tuenhi.staff-recovery:${actorId}:reactivate:${targetId}`;
export function readStaffReactivation(
  actorId: string,
  targetId: string,
): StaffReactivationMarker | null {
  const value = localStorage.getItem(reactivationKey(actorId, targetId));
  if (!value) return null;
  try {
    const parsed = reactivationSchema.safeParse(JSON.parse(value));
    if (parsed.success && parsed.data.targetId === targetId) return parsed.data;
  } catch {
    /* Fail closed rather than issuing a different request. */
  }
  throw new Error(
    'Không đọc được yêu cầu mở lại tài khoản. Cần hỗ trợ đối soát.',
  );
}
export function writeStaffReactivation(
  actorId: string,
  targetId: string,
  marker: StaffReactivationMarker | null,
) {
  if (marker) {
    if (marker.targetId !== targetId)
      throw new Error('Yêu cầu không khớp tài khoản.');
    localStorage.setItem(
      reactivationKey(actorId, targetId),
      JSON.stringify(reactivationSchema.parse(marker)),
    );
  } else localStorage.removeItem(reactivationKey(actorId, targetId));
}
