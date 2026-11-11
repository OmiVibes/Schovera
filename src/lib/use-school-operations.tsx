'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {useI18n} from './i18n-provider';
import {schoolOperationText} from './school-operation-copy';

type Row={operation_id:string;kind:string;state:string;error:string|null};
export function useSchoolOperations(db:SupabaseClient,actor:string,classId:string,date:string) {
  const {language}=useI18n();
  const supported=process.env.NEXT_PUBLIC_SCHOVERA_SCHOOL_OPERATIONS==='local';
  const [enabled,setEnabled]=useState(false),[available,setAvailable]=useState(false),[rows,setRows]=useState<Row[]>([]),[message,setMessage]=useState('');
  const lease=useRef<{token:string;context:string;expires:number}|null>(null);
  const current=useRef(`${actor}:${classId}:${date}`);const busy=useRef(false);
  const seenReceipts=useRef(new Set<string>());
  const version=useRef(0);
  const context=`${actor}:${classId}:${date}`;
  useEffect(()=>{
    if(!supported)return;
    let active=true;
    void Promise.resolve().then(()=>{if(active)try{setEnabled(localStorage.getItem(`schovera:school-saving:${actor}`)==='enabled');}catch{/* In-memory use remains available when browser storage is blocked. */}});
    return()=>{active=false;};
  },[actor,supported]);
  const call=useCallback(async(body:Record<string,unknown>)=>{
    const session=await db.auth.getSession();
    const result=await fetch('/api/school/operations',{method:'POST',headers:{'Content-Type':'application/json',...(session.data.session?{Authorization:`Bearer ${session.data.session.access_token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const data=await result.json();if(!result.ok)throw new Error(data.error||'School server unavailable.');return data;
  },[db]);
  const prepare=useCallback(async(quiet=false)=>{
    if(!classId)return;
    try {
      const result=await call({action:'lease',class_id:classId,attendance_date:date});
      if(current.current===context){lease.current={token:result.lease,expires:result.expires_at,context};setAvailable(true);if(!quiet)setMessage('Connected — offline saving ready for 30 minutes.');}
    } catch {if(current.current===context&&(!lease.current||lease.current.context!==context||lease.current.expires<=Date.now())){lease.current=null;setAvailable(false);setMessage('Connect and sign in to prepare offline saving.');}}
  },[call,classId,date,context]);
  const refresh=useCallback(async(retry=false)=>{
    if(busy.current)return;busy.current=true;const requestVersion=++version.current;
    try {
      const result=await call({action:'sync',retry});
      if(current.current!==context||requestVersion!==version.current)return;
      setRows(result.rows);
      const pending=result.rows.some((r:Row)=>r.state==='pending'),review=result.rows.some((r:Row)=>r.state==='review');
      const retryNeeded=result.rows.some((r:Row)=>r.error==='retry_needed');
      setMessage(review?'Some saved work needs review. Newer attendance was not replaced.':retryNeeded?'Sync failed — retry needed. Saved work is retained.':pending?'Saved locally — waiting to sync.':'All changes synced.');
      const fresh=result.rows.filter((r:Row)=>r.state==='synced'&&!seenReceipts.current.has(r.operation_id));
      for(const row of fresh)seenReceipts.current.add(row.operation_id);
      if(fresh.length)void prepare(true);
      return result;
    } catch {
      if(lease.current?.context===context&&lease.current.expires>Date.now())try{
        const result=await call({action:'status',lease:lease.current.token});
        if(current.current===context){setRows(result.rows);setMessage(result.rows.some((r:Row)=>r.state==='pending')?'Saved locally — waiting to sync.':'Offline — school server available.');}
      }catch{if(current.current===context)setMessage('School server unavailable. New saves cannot be confirmed.');}
      else if(current.current===context)setMessage('Sign in to sync. Saved work is retained on the school server.');
    } finally {busy.current=false;}
  },[call,context,prepare]);
  useEffect(()=>{
    current.current=context;
    version.current++;
    if(!enabled||!supported)return;
    let active=true;
    void Promise.resolve().then(()=>{if(active){setRows([]);setAvailable(false);void prepare();void refresh();}});
    const timer=setInterval(()=>{if(lease.current?.context===context&&lease.current.expires<=Date.now()){setAvailable(false);void prepare(true);}void refresh();},5000);
    const online=()=>{void refresh();void prepare();};window.addEventListener('online',online);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('online',online);};
  },[context,enabled,prepare,refresh,supported]);
  const enable=async()=>{try{localStorage.setItem(`schovera:school-saving:${actor}`,'enabled');}catch{/* The durable queue is on the school server, not in browser storage. */}setEnabled(true);};
  const attendance=useRef<{identity:string;operation:Record<string,unknown>}|null>(null);
  const save=async(kind:'attendance'|'update',payload:unknown,id?:string,authoredAt?:string)=>{
    const proof=lease.current;
    if(!proof||proof.context!==context||proof.expires<=Date.now()){setAvailable(false);setMessage('Connect and prepare offline saving again. No save was confirmed.');throw new Error('lease_expired');}
    const identity=JSON.stringify({context,kind,payload});
    let operation:Record<string,unknown>;
    if(kind==='attendance'&&attendance.current?.identity===identity)operation=attendance.current.operation;
    else {operation={operation_id:id||crypto.randomUUID(),kind,payload,authored_at:authoredAt||new Date().toISOString()};if(kind==='attendance')attendance.current={identity,operation};}
    let accepted;
    try{accepted=await call({action:'capture',lease:proof.token,operation});}
    catch{setMessage('No new local save was confirmed. Retry the same work or reconnect.');throw new Error('capture_not_confirmed');}
    version.current++;
    setRows(previous=>previous.some(r=>r.operation_id===accepted.operation_id)?previous:[...previous,{operation_id:accepted.operation_id,kind,state:accepted.state,error:null}]);
    setMessage(accepted.state==='synced'?'All changes synced.':'Saved locally — waiting to sync.');
    const refreshed=await refresh();
    if(kind==='attendance'&&refreshed?.rows.some((r:Row)=>r.operation_id===operation.operation_id&&r.state==='synced'))attendance.current=null;
    return accepted;
  };
  return {supported,enabled:enabled&&supported,available,message,rows,enable,retry:async()=>{await prepare(true);await refresh(true);},save,
    acceptedNote:schoolOperationText(language,'Saved on the school server. See School saving for sync status.'),
    failureNote:schoolOperationText(language,'No new local save was confirmed. Check School saving and retry.')};
}

export function SchoolOperationStatus({operations}:{operations:ReturnType<typeof useSchoolOperations>}) {
  const {language}=useI18n();const text=(value:string)=>schoolOperationText(language,value);
  if(!operations.supported)return null;
  return <section className="card school-saving-panel" aria-label={text('Offline school saving')}>
    <strong>{text('School saving')}</strong> <small>{text('Local sync simulation')}</small>
    {!operations.enabled?<p><button type="button" onClick={()=>void operations.enable()}>{text('Enable offline saving')}</button></p>:<>
      <p role="status" aria-live="polite">{text(operations.message||'Preparing offline saving…')}</p>
      {operations.available&&<p>{text('Offline saving ready (30-minute permission).')}</p>}
      {operations.rows.some(r=>r.state==='pending')&&operations.message!=='Saved locally — waiting to sync.'&&<p>{text('Saved locally — waiting to sync.')}</p>}
      <p>{operations.rows.filter(r=>r.state==='pending').length} {text('waiting')} · {operations.rows.filter(r=>r.state==='review').length} {text('need review')}</p>
      <button type="button" onClick={()=>void operations.retry()}>{text('Retry sync')}</button>
      {!operations.available&&<p>{text('New offline saves require a prepared class. Existing saved work is retained.')}</p>}
    </>}
  </section>;
}
