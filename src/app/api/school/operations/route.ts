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
    if(!['lease','capture','status','sync'].includes(body.action))throw new Error('invalid_request');
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
    let client: SupabaseClient|undefined;
    if(body.action==='status'&&body.lease) {
      const claims=verifyLease(signingKey,body.lease);actor=claims.actor_id;school=claims.school_id;
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
    if(body.action==='sync') {
      await replayOperations(store,actor,school,async (operation: unknown,hash: string)=>{
        const result=await client!.rpc('replay_school_operation',{p_envelope:operation,p_payload_hash:hash});
        if(result.error) {
          const message=result.error.message;
          throw new Error(message.includes('attendance_conflict')?'attendance_conflict':message.includes('not_authorized')||message.includes('not authorized')?'not_authorized':message.includes('operation_conflict')||message.includes('idempotency conflict')?'operation_conflict':message.includes('invalid')?'invalid_operation':'connection_lost');
        }
        return result.data;
      },{force:body.retry===true});
    }
    const rows=store.rows(actor,school).map((r:{operation_id:string;kind:string;state:string;local_received_at:string;error:string|null;receipt:string|null})=>({operation_id:r.operation_id,kind:r.kind,state:r.state,local_received_at:r.local_received_at,error:r.error,receipt:r.receipt?JSON.parse(r.receipt):null}));
    return response({simulation:true,mode:store.mode(),rows});
  } catch(error) {
    const code=error instanceof Error?error.message:'unavailable';
    const safe=['invalid_request','request_too_large','invalid_lease','lease_expired','invalid_operation','invalid_attendance','invalid_update','queue_full','operation_conflict','attendance_already_pending'];
    return response({error:safe.includes(code)?code:'School operations unavailable. No local save was confirmed.'},safe.includes(code)?409:503);
  } finally {store?.close();}
}
