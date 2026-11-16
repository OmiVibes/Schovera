import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'node:path';
import { isLoopbackHostHeader, isLoopbackHttpUrl } from '@/lib/rfid/server';
type OperationsStore=ReturnType<(typeof import('../../../../../scripts/school-operations/store.mjs'))['openOperations']>;

export const runtime = 'nodejs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const response=(value: unknown,status=200)=>Response.json(value,{status,headers});
const directory=()=>path.join(process.cwd(),'.local','schovera-rfid-gateway');
async function bodyOf(request: Request) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('invalid_request');
  let bytes=0;const chunks=[];const reader=request.body?.getReader();if(!reader)throw new Error('invalid_request');
  for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>96000){await reader.cancel();throw new Error('request_too_large');}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function POST(request: Request) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(process.env.SCHOVERA_SCHOOL_OPERATIONS_MODE!=='local'||process.env.SCHOVERA_TEST_MODE!=='local'||process.env.SCHOVERA_HOSTED_DEMO==='true'||!url||!key||!isLoopbackHttpUrl(url)||!isLoopbackHostHeader(request.headers.get('host')))return response({error:'Local school operations are unavailable.'},404);
  if(request.headers.get('origin')!==`http://${request.headers.get('host')}`)return response({error:'Open this from the school website.'},403);
  let store: OperationsStore|undefined;
  try {
    // Do not initialize Node SQLite for a disabled/hosted application route.
    const {openOperations,localSigningKey,issueLease,verifyLease,prepareOperation,replayOperations}=await import('../../../../../scripts/school-operations/store.mjs');
    const body=await bodyOf(request);
    if(!['lease','capture','status','sync','review-held','resolve-held'].includes(body.action))throw new Error('invalid_request');
    store=openOperations(path.join(directory(),'gateway.sqlite'));
    const signingKey=localSigningKey(directory());
    if(body.action==='capture') {
      const claims=verifyLease(signingKey,body.lease);
      const row=store.insert(prepareOperation(claims,body.operation));
      return response({operation_id:row.operation_id,state:row.state,local_received_at:row.local_received_at},202);
    }
    // A still-valid capture lease can read only its owner's minimized local status
    // when the authority is unavailable. It never authorizes remote mutation.
    let actor: string,school: string;
    let leaseScope: {class_id:string;attendance_date:string}|undefined;
    let client: SupabaseClient|undefined;
    if(body.action==='status'&&body.lease) {
      const claims=verifyLease(signingKey,body.lease);actor=claims.actor_id;school=claims.school_id;leaseScope=claims;
    } else {
      if(store.mode()==='authority-offline')return response({error:'Authority unavailable. Saved work is retained.'},503);
      const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
      if(!token||token.length>12000)return response({error:'Please sign in to sync.'},401);
      client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`},fetch:(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(10000)})}});
      const user=await client.auth.getUser(token);
      if(user.error||!user.data.user)return response({error:'Please sign in to sync.'},401);
      const identity=await client.rpc('school_operation_identity');
      if(identity.error||!identity.data?.actor_id||!identity.data?.school_id)return response({error:'An active Teacher session is required.'},403);
      actor=identity.data.actor_id;school=identity.data.school_id;
    }
    if(body.action==='lease') {
      const snapshot=await client!.rpc('school_operation_baseline',{p_class_id:body.class_id,p_attendance_date:body.attendance_date});
      if(snapshot.error)return response({error:'Assigned class and valid attendance date required.'},403);
      return response({lease:issueLease(signingKey,snapshot.data),expires_at:Date.now()+30*60_000});
    }
    if(body.action==='review-held'||body.action==='resolve-held') {
      const {retainedIntention,sanitizedComparison}=await import('../../../../../scripts/school-operations/held-review.mjs');
      const row=store.rows(actor,school).find((r:{operation_id:string})=>r.operation_id===body.operation_id);
      if(!row)return response({error:'Current assignment and session required. Original work is retained.'},403);
      const original=retainedIntention(row);
      const baseline=await client!.rpc('school_operation_baseline',{p_class_id:row.class_id,p_attendance_date:row.attendance_date});
      if(baseline.error)return response({error:'Current assignment and session required. Original work is retained.'},403);
      if(body.action==='review-held') {
        const [snapshot,roster,prior]=await Promise.all([
          client!.rpc('class_attendance_snapshot',{p_class_id:row.class_id,p_attendance_date:row.attendance_date}),
          client!.from('students').select('id,full_name').eq('class_id',row.class_id).eq('school_id',school).eq('active',true).limit(501),
          client!.rpc('held_school_operation_resolution',{p_original_id:row.operation_id})]);
        if(snapshot.error||roster.error||prior.error||!roster.data||roster.data.length>500)return response({error:'Authoritative review unavailable. Original work is retained.'},503);
        if(prior.data)store.recordDisposition(row.operation_id,prior.data);
        return response({operation_id:row.operation_id,kind:row.kind,date:row.attendance_date,revision:snapshot.data.revision,state:snapshot.data.state,error:row.error,rows:sanitizedComparison(row,roster.data,snapshot.data),disposition:prior.data});
      }
      if(body.disposition==='new_attendance_write'&&original.kind!=='attendance')throw new Error('invalid_resolution');
      const result=await client!.rpc('resolve_held_school_operation',{p_original_id:row.operation_id,p_original_hash:row.payload_hash,p_class_id:row.class_id,p_attendance_date:row.attendance_date,
        p_request_id:body.request_id,p_disposition:body.disposition,p_expected_revision:body.expected_revision??null,p_records:body.records??null,p_reason:body.reason});
      if(result.error){const code=['attendance_conflict','operation_conflict','attendance_reason_required','not_authorized','invalid_resolution','operation_already_synced'].find(c=>result.error.message.includes(c));return response({error:code??'Resolution unavailable. Original work is retained.'},code==='not_authorized'?403:409);}
      store.recordDisposition(row.operation_id,result.data);return response({resolution:result.data});
    }
    if(body.action==='sync') {
      await replayOperations(store,actor,school,async (operation: unknown,hash: string)=>{
        const result=await client!.rpc('replay_school_operation',{p_envelope:operation,p_payload_hash:hash});
        if(result.error) {
          const message=result.error.message;
          const attendanceError=['attendance_conflict','attendance_review_required','attendance_reason_required','attendance_already_finalized','attendance_revision_required','operation_resolved'].find(code=>message.includes(code));
          throw new Error(attendanceError??(message.includes('not_authorized')||message.includes('not authorized')?'not_authorized':message.includes('operation_conflict')||message.includes('idempotency conflict')?'operation_conflict':message.includes('invalid')?'invalid_operation':'connection_lost'));
        }
        return result.data;
      },{force:body.retry===true});
    }
    const ownStore=store;
    const rows=store.rows(actor,school).filter((r:{class_id:string;attendance_date:string;kind:string})=>!leaseScope||(r.class_id===leaseScope.class_id&&(r.kind!=='attendance'||r.attendance_date===leaseScope.attendance_date))).map((r:{operation_id:string;kind:string;state:string;class_id:string;attendance_date:string;local_received_at:string;error:string|null;receipt:string|null})=>({operation_id:r.operation_id,kind:r.kind,state:r.state,class_id:r.class_id,attendance_date:r.attendance_date,local_received_at:r.local_received_at,error:r.error,receipt:r.receipt?JSON.parse(r.receipt):null,disposition:ownStore.disposition(r.operation_id)}));
    return response({simulation:true,mode:store.mode(),rows});
  } catch(error) {
    const code=error instanceof Error?error.message:'unavailable';
    const safe=['invalid_request','request_too_large','invalid_lease','lease_expired','invalid_operation','invalid_attendance','invalid_update','queue_full','operation_conflict','attendance_already_pending','held_operation_required','stored_payload_corrupt','invalid_resolution'];
    return response({error:safe.includes(code)?code:'School operations unavailable. No local save was confirmed.'},safe.includes(code)?409:503);
  } finally {store?.close();}
}
