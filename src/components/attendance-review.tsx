'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { useUiText } from './ui-text';
import { classDisplay } from '@/lib/class-display';
import { attendanceReviewSchema, principalAttendanceReviewSchema, parentConfirmationSchema, exceptionLabels, meaningfulAttendanceReason } from '@/lib/attendance-review';

function useAttendanceRead<T>(method:string,args:Record<string,unknown>,schema:z.ZodType<T>,revision='') {
  const db=useMemo(()=>createClient(),[]),argJson=JSON.stringify(args),key=method+argJson+revision;
  const [result,setResult]=useState<{key:string;data:T}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const generation=useRef(0),controller=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    const version=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;setLoading(true);setError('');
    try{const r=await db.rpc(method,JSON.parse(argJson)).abortSignal(abort.signal);if(r.error)throw Error('Unavailable');const data=schema.parse(r.data);if(version===generation.current)setResult({key,data});}
    catch{if(version===generation.current&&!abort.signal.aborted){setResult(null);setError('Attendance evidence could not be checked. Refresh when connected.');}}
    finally{if(version===generation.current)setLoading(false);}
  },[db,method,argJson,schema,key]);
  const invalidate=useCallback(()=>{generation.current++;controller.current?.abort();},[]);
  useEffect(()=>{
    let active=true;void Promise.resolve().then(()=>{if(active)void refresh();});
    const update=()=>{if(!document.hidden)void refresh();};const timer=setInterval(update,30000);
    window.addEventListener('focus',update);window.addEventListener('online',update);window.addEventListener('schovera:attendance-synced',update);window.addEventListener('schovera:attendance-review-changed',update);
    return()=>{active=false;invalidate();clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('online',update);window.removeEventListener('schovera:attendance-synced',update);window.removeEventListener('schovera:attendance-review-changed',update);};
  },[refresh,invalidate]);
  return {db,data:result?.key===key?result.data:null,error,loading,refresh};
}

export function StaffAttendanceReview({classId,date,revision=0,onFind}:{classId:string;date:string;revision?:number;onFind?:(name:string)=>void}) {
  const ui=useUiText();const read=useAttendanceRead('class_attendance_review',{p_class_id:classId,p_attendance_date:date},attendanceReviewSchema,String(revision));
  const [reason,setReason]=useState(''),[selected,setSelected]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  const [includeReviewed,setIncludeReviewed]=useState(false),[limit,setLimit]=useState(4);
  const request=useRef<{key:string;id:string}|null>(null);
  const exceptions=read.data?.rows.filter(r=>r.flags.length)??[];
  const shown=exceptions.filter(r=>includeReviewed||!r.reviewed);
  const acknowledge=async()=>{
    const student=exceptions.find(r=>r.student_id===selected);if(!student||!meaningfulAttendanceReason(reason))return;
    const identity=JSON.stringify([classId,date,student.student_id,student.fingerprint,reason.trim()]);if(request.current?.key!==identity)request.current={key:identity,id:crypto.randomUUID()};
    setSaving(true);setMessage('');
    const result=await read.db.rpc('review_attendance_exception',{p_class_id:classId,p_attendance_date:date,p_student_id:student.student_id,p_fingerprint:student.fingerprint,p_reason:reason.trim(),p_request_id:request.current.id});
    setSaving(false);
    if(result.error){setMessage(result.error.message.includes('attendance_conflict')?'Evidence changed. Refresh and review again.':'Review was not confirmed. Check your permission and retry the same review.');return;}
    setMessage('Review recorded. Classroom attendance was not changed.');setSelected('');setReason('');request.current=null;await read.refresh();window.dispatchEvent(new Event('schovera:attendance-review-changed'));
  };
  return <section className="m2-attendance-review" aria-label={ui('Gate and classroom review')}>
    <header><div><h3>{ui('Gate and classroom review')}</h3><p>{ui('Saved records only. Scans never confirm classroom presence or safety.')}</p></div><button type="button" className="secondary" disabled={read.loading} onClick={()=>void read.refresh()}>{ui('Refresh evidence')}</button></header>
    <p className="hint">{ui('Compared with the current class roster, not the class at scan time. Missing events may reflect a card, reader, clock or sync issue.')}</p>
    {read.data?.confirming_teacher&&<p>{ui('Last confirmed by {0}',[read.data.confirming_teacher])}</p>}
    {read.error?<p role="alert" className="error">{ui(read.error)}</p>:!read.data?<p role="status">{ui('Checking saved attendance evidence…')}</p>:<>
      <p role="status">{ui('{0} students need review; {1} reviewed for this evidence.',[exceptions.filter(r=>!r.reviewed).length,exceptions.filter(r=>r.reviewed).length])}</p>
      <label><input type="checkbox" checked={includeReviewed} onChange={event=>setIncludeReviewed(event.target.checked)} /> {ui('Include reviewed evidence')}</label>
      {!exceptions.length&&<p>{ui('No exception under these rules. This does not certify identity, safety or complete reader coverage.')}</p>}
      {shown.slice(0,limit).map(row=><article className="m2-exception" key={row.student_id}>
        <div><strong>{row.student_name}</strong><span className={row.reviewed?'status present':'status pending'}>{ui(row.reviewed?'Reviewed evidence':'Needs review')}</span></div>
        <ul>{row.flags.map(flag=><li key={flag}>{ui(exceptionLabels[flag])}</li>)}</ul>
        <p>{ui('{0} separate gate events; {1} time-matching check-ins for this date.',[row.gate_events,row.reliable_entries])}</p>
        {row.first_observed&&<p className="hint">{ui('Reported scan (UTC): {0}; server receipt (UTC): {1}',[new Date(row.first_observed).toISOString(),row.last_received?new Date(row.last_received).toISOString():'—'])}</p>}
        {onFind&&<button type="button" className="secondary" onClick={()=>onFind(row.student_name)}>{ui('Find in register')}</button>}
        {!row.reviewed&&<button type="button" className="secondary" disabled={saving} onClick={()=>{setSelected(row.student_id);setReason('');}}>{ui('Review without changing attendance')}</button>}
        {row.reviewed&&<p>{ui('Reviewed by {0}',[row.reviewer_name??ui('School staff')])}</p>}
        {selected===row.student_id&&<div className="m2-review-form"><label>{ui('What did you check?')}<textarea maxLength={500} minLength={8} value={reason} onChange={e=>setReason(e.target.value)} /></label><p className="hint">{ui('Use at least 8 characters and two words. Say what you checked or why the mark changed.')}</p><button type="button" disabled={saving||!meaningfulAttendanceReason(reason)} onClick={()=>void acknowledge()}>{ui('Record staff review')}</button><button type="button" className="secondary" disabled={saving} onClick={()=>setSelected('')}>{ui('Cancel review')}</button></div>}
      </article>)}
      {!!exceptions.length&&<p>{ui('Showing {0} of {1} matching exception students.',[Math.min(limit,shown.length),shown.length])}</p>}
      {shown.length>limit&&<button type="button" className="secondary" onClick={()=>setLimit(value=>value+8)}>{ui('Show more exceptions')}</button>}
      {read.data.rows.some(r=>r.legacy_events>0)&&<p>{ui('Legacy reference-only gate events are excluded from named reconciliation.')}</p>}
    </>}
    {message&&<p role="status">{ui(message)}</p>}
  </section>;
}

export function ParentClassroomConfirmation({studentId,revision}:{studentId:string;revision:string}) {
  const ui=useUiText();const read=useAttendanceRead('parent_classroom_confirmation',{p_student_id:studentId},parentConfirmationSchema,revision);
  return <p className="m2-parent-confirmation" role="status">{read.error?ui('Today’s classroom confirmation is unavailable. Earlier saved history is shown separately.'):!read.data?ui('Checking today’s classroom confirmation…'):read.data.available?ui('Current class: Teacher-saved attendance is available for {0}.',[read.data.attendance_date]):ui('No Teacher-confirmed record for the current class is available for {0}. Missing gate evidence is not an absence.',[read.data.attendance_date])}</p>;
}

export function PrincipalAttendanceReview() {
  const ui=useUiText();const [date,setDate]=useState(''),[cursor,setCursor]=useState<string|null>(null),[classId,setClassId]=useState('');
  const read=useAttendanceRead('principal_attendance_review',{p_attendance_date:date||null,p_after_id:cursor,p_limit:40},principalAttendanceReviewSchema);
  const value=read.data;
  return <section className="card attendance-overview m2-principal-attendance" id="principal-attendance">
    <h2>{ui('Classroom attendance overview')}</h2><label>{ui('Review date')}<input type="date" value={date||value?.attendance_date||''} onChange={e=>{setDate(e.target.value);setCursor(null);setClassId('');}} /></label>
    <button type="button" className="secondary" onClick={()=>void read.refresh()} disabled={read.loading}>{ui('Refresh attendance')}</button>
    {read.error?<p className="error" role="alert">{ui(read.error)}</p>:!value?<p role="status">{ui('Checking saved attendance evidence…')}</p>:<>
      <div className="attendance-counts"><span><b>{value.summary.finalized_registers}</b>{ui('Finalized registers')}</span><span><b>{value.summary.classes-value.summary.finalized_registers}</b>{ui('Not finalized')}</span><span className="present"><b>{value.summary.present}</b>{ui('Present')}</span><span className="absent"><b>{value.summary.absent}</b>{ui('Absent')}</span><span className="late"><b>{value.summary.late}</b>{ui('Late')}</span></div>
      <p>{ui('{0} of {1} current students have saved classroom records.',[value.summary.saved,value.summary.students])}</p>
      <p>{ui('{0} students have unresolved review flags; {1} legacy saved registers.',[value.summary.unresolved,value.summary.legacy_registers])}</p>
      <p>{ui('{0} unresolved card receipts received on this date. Identity and class are not established.',[value.unresolved_card_receipts])}</p>
      <p className="hint">{ui('Unknown, inactive, unassigned or ambiguous card receipts cannot be attached to a named class from this evidence.')}</p>
      <div className="history-list">{value.classes.map(c=><p key={c.id}><span>{classDisplay(c,ui)}</span><span>{ui(c.state==='finalized'?'Finalized':c.state==='draft'?'Draft':c.state==='legacy_saved'?'Legacy saved':'Unmarked')} · {c.saved}/{c.students} · {ui('{0} need review',[c.unresolved])}</span></p>)}</div>
      <p>{ui('Showing {0} classes on this page; {1} active classes in total.',[value.classes.length,value.summary.classes])}</p>
      {cursor&&<button type="button" className="secondary" onClick={()=>{setCursor(null);setClassId('');}}>{ui('First classes')}</button>}
      {value.has_more&&<button type="button" className="secondary" onClick={()=>{setCursor(value.classes.at(-1)!.id);setClassId('');}}>{ui('More classes')}</button>}
      {!!value.classes.length&&<div className="m2-class-picker"><label htmlFor="principal-class-review">{ui('Class exception review')}</label><select id="principal-class-review" value={classId} onChange={e=>setClassId(e.target.value)}><option value="">{ui('Choose a class to review')}</option>{value.classes.map(c=><option key={c.id} value={c.id}>{classDisplay(c,ui)}</option>)}</select></div>}
      {classId&&<StaffAttendanceReview key={`${classId}:${value.attendance_date}`} classId={classId} date={value.attendance_date} />}
    </>}
  </section>;
}
