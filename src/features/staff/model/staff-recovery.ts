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
