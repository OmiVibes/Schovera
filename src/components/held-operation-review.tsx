'use client';
import {useRef,useState} from 'react';import {z} from 'zod';
import {useUiText} from './ui-text';import {meaningfulAttendanceReason,type SchoolOperationRow} from '@/lib/attendance-review';
const status=z.enum(['present','absent','late']);
const schema=z.object({operation_id:z.string().uuid(),kind:z.enum(['attendance','update']),date:z.string(),revision:z.number().int().nonnegative(),state:z.enum(['draft','finalized']),error:z.string().nullable(),disposition:z.object({disposition:z.string()}).nullable(),rows:z.array(z.object({student_id:z.string().uuid(),name:z.string(),current:status.nullable(),intended:status.nullable()})).max(500)});
type Review=z.infer<typeof schema>;
export function HeldOperationReview({operation,review,resolve}:{operation:SchoolOperationRow;review:(id:string)=>Promise<unknown>;resolve:(body:Record<string,unknown>)=>Promise<unknown>}){
 const ui=useUiText();const [data,setData]=useState<Review|null>(null),[reason,setReason]=useState(''),[choices,setChoices]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[finished,setFinished]=useState(false);
 const request=useRef<{intent:string;id:string}|null>(null),generation=useRef(0);
 const load=async()=>{const version=++generation.current;setBusy(true);setMessage('');try{const fresh=schema.parse(await review(operation.operation_id));if(version!==generation.current)return;setData(fresh);setChoices(Object.fromEntries(fresh.rows.map(r=>[r.student_id,r.current??''])));setReason('');request.current=null;}catch{setData(null);setMessage('Review unavailable. Sign in and check current class permission; original work is retained.');}finally{setBusy(false);}};
 const save=async(disposition:string)=>{
  if(!data||!meaningfulAttendanceReason(reason))return;
  const intent={operation_id:operation.operation_id,disposition,reason:reason.trim(),...(disposition==='new_attendance_write'?{expected_revision:data.revision,records:data.rows.map(r=>({student_id:r.student_id,status:choices[r.student_id]}))}:{})};
  const identity=JSON.stringify(intent);if(request.current?.intent!==identity)request.current={intent:identity,id:crypto.randomUUID()};
  setBusy(true);setMessage('');try{await resolve({...intent,request_id:request.current.id});setFinished(true);setData(null);setMessage('Resolution recorded. The original held write was not applied.');}catch(error){const code=error instanceof Error?error.message:'';setMessage(code.includes('operation_already_synced')?'Destination already confirmed the original. Retry sync to recover its receipt.':code.includes('attendance_conflict')?'The register changed. Review current state before making a new correction.':'Resolution not confirmed. Retry the same request or reload current state; original work is retained.');}finally{setBusy(false);}
 };
 const label=(value:string|null)=>ui(value==='present'?'Present':value==='absent'?'Absent':value==='late'?'Late':'No saved mark');
 if(operation.disposition||finished)return <p role="status">{ui('Resolution recorded. The original held write was not applied.')}</p>;
 return <div className="m2-review-form">
  <button type="button" className="secondary" disabled={busy} onClick={()=>void load()}>{ui('Review held operation')}</button>
  {data&&<><p>{ui('Current revision {0}; compare before making a new write.',[data.revision])}</p><p>{ui('Only current authorized students are shown. Original notes and message text remain private.')}</p>
   {data.disposition?<p>{ui('Resolution recorded. The original held write was not applied.')}</p>:<>
   {data.kind==='attendance'?data.rows.map(row=><label key={row.student_id}>{row.name} · {ui('Saved')}: {label(row.current)} · {ui('Retained intention')}: {label(row.intended)}
    <select value={choices[row.student_id]??''} onChange={e=>setChoices(previous=>({...previous,[row.student_id]:e.target.value}))}><option value="">{ui('Choose a reviewed status')}</option>{(['present','absent','late'] as const).map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>):<p>{ui('Create any replacement message in Students with a new identity. This review does not resend its private text.')}</p>}
   <label>{ui('Reason for resolution')}<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} /></label>
   <p>{ui('Use at least 8 characters and two words. Say what you checked or why the mark changed.')}</p>
   {data.kind==='attendance'&&<button type="button" disabled={busy||!meaningfulAttendanceReason(reason)||!data.rows.length||data.rows.some(r=>!choices[r.student_id])} onClick={()=>void save('new_attendance_write')}>{ui('Save new reviewed attendance')}</button>}
   <button type="button" className="secondary" disabled={busy||!meaningfulAttendanceReason(reason)} onClick={()=>void save('closed_without_applying')}>{ui('Close without applying original')}</button>
   <button type="button" className="secondary" disabled={busy} onClick={()=>{generation.current++;setData(null);setReason('');}}>{ui('Cancel review')}</button>
   </>}
  </>}{message&&<p role="status">{ui(message)}</p>}
 </div>;
}
