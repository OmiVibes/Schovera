import { z } from 'zod';

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const summary = z.object({
  total_count: count, effective_count: count, important_count: count,
  acknowledged_count: count, awaiting_count: count,
  coverage: z.number().int().min(0).max(100).nullable(),
}).refine(s => s.important_count === s.acknowledged_count + s.awaiting_count
  && s.total_count >= s.effective_count && s.effective_count >= s.important_count
  && s.coverage === (s.important_count ? Math.round(s.acknowledged_count / s.important_count * 100) : null));
const update = z.object({
  id: z.string().uuid(), student_id: z.string().uuid(),
  title: z.string(), message: z.string(), category: z.string(),
  importance: z.enum(['normal', 'important']), sent_at: z.string().datetime({ offset: true }),
  corrects_update_id: z.string().uuid().nullable().optional(),
  is_corrected: z.boolean(), correction_title: z.string().nullable(),
  acknowledgements: z.array(z.object({ acknowledged_at: z.string() })),
  students: z.object({full_name: z.string(), roll_number: z.string(),
    classes: z.object({grade: z.string(), division: z.string()}).nullable()}).nullable(),
});
const page = z.object({school_id: z.string().uuid(), summary, updates: z.array(update).max(100), has_more: z.boolean()});
export type PrincipalCommunicationPage = z.infer<typeof page>;
export type PrincipalCommunicationSummary = z.infer<typeof summary>;
export type CommunicationCursor = { sent_at: string; id: string };
export const PRINCIPAL_PAGE_SIZE = 40;

/** Invalid/partial responses are errors, never authoritative zero totals. */
export function parsePrincipalCommunication(value: unknown, schoolId: string): PrincipalCommunicationPage {
  const result = page.parse(value);
  if (result.school_id !== schoolId || (result.has_more && !result.updates.length)
    || new Set(result.updates.map(u => u.id)).size !== result.updates.length)
    throw new Error('Invalid communication response');
  return result;
}
