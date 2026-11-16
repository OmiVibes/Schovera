import {createHash} from 'node:crypto';
export function retainedIntention(row){
 if(!row||row.state!=='review')throw Error('held_operation_required');
 if(createHash('sha256').update(row.canonical).digest('hex')!==row.payload_hash)throw Error('stored_payload_corrupt');
 const operation=JSON.parse(row.canonical);
 if(operation.operation_id!==row.operation_id||operation.actor_id!==row.actor_id||operation.class_id!==row.class_id||operation.school_id!==row.school_id||operation.kind!==row.kind)throw Error('stored_payload_corrupt');
 return operation;
}
export function sanitizedComparison(row,students,snapshot){
 const operation=retainedIntention(row),intended=operation.kind==='attendance'?operation.payload.records:[];
 return students.map(s=>({student_id:s.id,name:s.full_name,current:snapshot.records.find(r=>r.student_id===s.id)?.status??null,intended:intended.find(r=>r.student_id===s.id)?.status??null}));
}
