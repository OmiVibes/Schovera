import { z } from 'zod';

const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const exceptionLabels={
  no_matching_scan:'No matching gate entry — manual attendance remains valid',
  gate_without_confirmation:'Gate evidence recorded; classroom attendance is not confirmed',
  gate_class_mismatch:'Gate evidence and saved Absent mark need review',
  separate_scans:'Multiple separate check-in events — not a replay count',
  uncertain_time:'Reported scan time is uncertain',
  delayed_receipt:'Scan and receipt differ by over 10 minutes; delay or clock mismatch',
  sequence_review:'Reader sequence gap or out-of-order evidence',
} as const;
export type ExceptionCode=keyof typeof exceptionLabels;
const row=z.object({
  student_id:z.string().uuid(),class_id:z.string().uuid(),student_name:z.string(),roll_number:z.string(),
  classroom_status:z.enum(['present','absent','late']).nullable(),register_state:z.enum(['draft','finalized','legacy_saved','unmarked']),revision:count,
  gate_events:count,check_ins:count,reliable_entries:count,timing_issues:count,delayed_sync:count,sequence_issues:count,legacy_events:count,
  first_observed:z.string().datetime({offset:true}).nullable(),last_received:z.string().datetime({offset:true}).nullable(),flags:z.array(z.enum(Object.keys(exceptionLabels) as [ExceptionCode,...ExceptionCode[]])),
  fingerprint:z.string().regex(/^[a-f0-9]{32}$/),reviewed:z.boolean(),reviewer_name:z.string().nullable(),reviewed_at:z.string().datetime({offset:true}).nullable(),
});
export const attendanceReviewSchema=z.object({class_id:z.string().uuid(),attendance_date:z.string(),rows:z.array(row).max(500),confirming_teacher:z.string().nullable(),confirmed_at:z.string().nullable()})
  .refine(v=>v.rows.every(r=>r.class_id===v.class_id)&&new Set(v.rows.map(r=>r.student_id)).size===v.rows.length);
export type AttendanceReview=z.infer<typeof attendanceReviewSchema>;
export const principalAttendanceReviewSchema=z.object({attendance_date:z.string(),summary:z.object({classes:count,finalized_registers:count,draft_registers:count,legacy_registers:count,unmarked_registers:count,students:count,saved:count,present:count,absent:count,late:count,unresolved:count}),
  unresolved_card_receipts:count,has_more:z.boolean(),classes:z.array(z.object({id:z.string().uuid(),grade:z.string(),division:z.string(),state:z.enum(['draft','finalized','legacy_saved','unmarked']),students:count,saved:count,present:count,absent:count,late:count,unresolved:count})).max(100),
}).refine(v=>v.summary.saved===v.summary.present+v.summary.absent+v.summary.late&&v.summary.saved<=v.summary.students
  &&v.summary.classes===v.summary.finalized_registers+v.summary.draft_registers+v.summary.legacy_registers+v.summary.unmarked_registers);
export const parentConfirmationSchema=z.object({attendance_date:z.string(),available:z.boolean(),status:z.enum(['present','absent','late']).nullable()}).refine(v=>v.available===(v.status!==null));
export const meaningfulAttendanceReason=(value:string)=>value.trim().length>=8&&value.trim().length<=500&&value.trim().split(/\s+/).length>=2;

/** Independent small oracle for the SQL rules, used by synthetic acceptance. */
export function exceptionCodes(f:{configured:boolean;classroom_status:string|null;reliable_entries:number;check_ins:number;timing_issues:number;delayed_sync:number;sequence_issues:number}):ExceptionCode[] {
  const flags:ExceptionCode[]=[];
  if(f.configured&&['present','late'].includes(f.classroom_status??'')&&f.reliable_entries===0)flags.push('no_matching_scan');
  if(f.reliable_entries>0&&f.classroom_status===null)flags.push('gate_without_confirmation');
  if(f.reliable_entries>0&&f.classroom_status==='absent')flags.push('gate_class_mismatch');
  if(f.check_ins>1)flags.push('separate_scans');
  if(f.timing_issues>0)flags.push('uncertain_time');
  if(f.delayed_sync>0)flags.push('delayed_receipt');
  if(f.sequence_issues>0)flags.push('sequence_review');
  return flags;
}
export function heldOperationAdvice(error:string|null) {
  if(error==='attendance_conflict')return 'A newer register exists. Reload it, compare the retained intention with school staff, then make a new correction with its current revision and a reason.';
  if(error==='attendance_reason_required'||error==='attendance_review_required'||error==='attendance_revision_required')return 'This older intention needs a reviewed new correction. Ask school staff to inspect the retained operation; its original envelope must not be edited.';
  if(error==='not_authorized')return 'Current permission was refused. Ask the school administrator to check the assignment or account before creating any new write.';
  return 'Saved work is retained. Ask school staff to inspect this operation before retrying or making a new write. Retry cannot force a conflict.';
}
export type SchoolOperationRow={operation_id:string;kind:string;state:string;error:string|null;class_id?:string;attendance_date?:string;local_received_at?:string;disposition?:{disposition:string;resolution_id:string}|null};
export function attendanceOperationState(rows:SchoolOperationRow[],classId:string,date:string) {
  const own=rows.filter(r=>r.kind==='attendance'&&r.class_id===classId&&r.attendance_date===date&&!r.disposition);
  return own.some(r=>r.state==='review')?'review':own.some(r=>r.state==='pending')?'pending':'none';
}
export function attendanceRegisterLabel(state:'draft'|'finalized'|null,dirty:boolean,operation:'none'|'pending'|'review',loading:boolean) {
  if(operation==='review')return 'Conflict — held work needs review';
  if(operation==='pending')return 'Pending offline sync — Parent records are unchanged';
  if(state===null)return loading?'Loading register state…':'Register state unavailable — refresh before saving';
  if(dirty)return 'Unsaved changes — Parent records are unchanged';
  return state==='finalized'?'Teacher-confirmed attendance':'Draft — not confirmed for Parents';
}
