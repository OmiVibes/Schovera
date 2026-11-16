import { z } from 'zod';

const status = z.enum(['present', 'absent', 'late']);
export const attendanceSnapshotSchema = z.object({
  register_id: z.string().uuid().nullable(),
  state: z.enum(['draft', 'finalized']),
  revision: z.number().int().nonnegative(),
  records: z.array(z.object({ student_id: z.string().uuid(), status })).max(500),
  confirmed_by: z.string().uuid().nullable(),
  confirmed_at: z.string().datetime({ offset: true }).nullable(),
  legacy: z.boolean(),
}).refine(s => new Set(s.records.map(r => r.student_id)).size === s.records.length
  && (s.state !== 'finalized' || (s.confirmed_by !== null && s.confirmed_at !== null)));
export type AttendanceSnapshot = z.infer<typeof attendanceSnapshotSchema>;
export function attendanceWriteError(message: string) {
  if (message.includes('attendance_conflict')) return 'Attendance changed elsewhere. Your edits were not saved. Reload the register before trying again.';
  if (message.includes('attendance_reason_required')) return 'Enter a reason for changing finalized attendance.';
  if (message.includes('attendance_already_finalized')) return 'This register is already finalized. Reload before making a correction.';
  return 'Could not save attendance. No confirmation was received. Retry the same save or reload the register.';
}
