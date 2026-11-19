import { z } from 'zod';

const id = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const proposalSchema = z.object({
  id, school_id: id, class_id: id, proposed_by: id, teacher_id: id,
  class_grade: z.string(), class_division: z.string(), proposer_name: z.string(),
  entry_id: id.nullable(), expected_updated_at: timestamp.nullable(),
  subject: z.string().min(2).max(80), weekday: z.number().int().min(1).max(6),
  period_number: z.number().int().min(1).max(20), start_time: z.string(), end_time: z.string(),
  room: z.string().nullable(), reason: z.string().min(8).max(500),
  status: z.enum(['pending', 'approved', 'rejected', 'withdrawn']), created_at: timestamp,
  decided_by: id.nullable(), decider_name: z.string().nullable(), decided_at: timestamp.nullable(),
  decision_reason: z.string().nullable(), published_entry_id: id.nullable(),
  published_updated_at: timestamp.nullable(), published_snapshot: z.record(z.string(), z.unknown()).nullable(),
}).refine(p => p.teacher_id === p.proposed_by
  && ((p.entry_id === null) === (p.expected_updated_at === null))
  && (p.status === 'pending' ? !p.decided_by && !p.decided_at : !!p.decided_by && !!p.decided_at)
  && (p.status === 'approved' ? !!p.published_entry_id && !!p.published_updated_at && !!p.published_snapshot
    : !p.published_entry_id && !p.published_snapshot));
export type TimetableProposal = z.infer<typeof proposalSchema>;
export function parseProposalPage(value: unknown, schoolId: string, teacherId?: string, classId?: string) {
  const page = z.object({ items: z.array(proposalSchema).max(40), has_more: z.boolean() }).parse(value);
  if ((page.has_more && !page.items.length) || new Set(page.items.map(p => p.id)).size !== page.items.length
    || page.items.some(p => p.school_id !== schoolId || (teacherId && p.proposed_by !== teacherId)
      || (classId && p.class_id !== classId))) throw Error('Invalid proposal response');
  return page;
}
