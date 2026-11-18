// Operator-only fixture lifecycle. Never imported into Next/application routes.
import {existsSync,readFileSync,writeFileSync,lstatSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID,createPrivateKey,createPublicKey} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {prepareManualFixture,manualPaths,cleanManualFixture} from '../manual-demo.mjs';
import {assertLocalTestEnvironment} from '../lib/local-test-env.mjs';
import {assertLoopbackApiUrl} from '../rfid-gateway/local-v2-transport.mjs';
import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';
import {assertGatewayRuntime} from '../rfid-gateway/runtime-guard.mjs';
import {hashReaderKey} from '../rfid-gateway/ingress.mjs';
import {peekCapabilitySelector} from '../rfid-simulator/event-v2.ts';
import {UsbCaptureRefusal,verifyUsbBinding,enrollmentDigest} from './capture.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const refuse=code=>{throw new UsbCaptureRefusal(code);};
export function assertUsbQa() {
  if(existsSync(path.join(root,'.env.local')))refuse('use_isolated_qa_without_private_env');
  if(path.resolve(process.cwd())!==path.resolve(root))refuse('run_from_approved_qa_root');
  assertLocalTestEnvironment();assertGatewayRuntime();
  if(process.env.SCHOVERA_ARDUINO_TEST_MODE!=='synthetic')refuse('explicit_synthetic_usb_mode_required');
}
export function regularPrivate(file,max=128*1024) {
  const relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))refuse('owned_path_required');
  let current=root;
  for(const component of relative.split(path.sep)){current=path.join(current,component);if(lstatSync(current).isSymbolicLink())refuse('linked_owned_path_refused');}
  const stat=lstatSync(file);if(!stat.isFile()||stat.size>max||realpathSync(file)!==path.join(realpathSync(root),relative))refuse('owned_file_refused');
  try{return JSON.parse(readFileSync(file,'utf8'));}catch{refuse('owned_file_invalid');}
}
export const must=async query=>{const r=await query;if(r.error)refuse('owned_local_authority_operation_failed');return r.data;};
const boundedLocalFetch=(url,options={})=>fetch(url,{...options,redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)});
export function adminClient(){assertUsbQa();return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedLocalFetch}});}
function ownedPaths(){regularPrivate(path.join(root,'.local/schovera-manual-demo/current.json'));const p=manualPaths();return {...p,ownerPath:path.join(p.runDirectory,'m7c-owner.json'),sessionPath:path.join(p.runDirectory,'m7c-session.json'),databasePath:path.join(p.runDirectory,'reader-gateway.sqlite')};}

export async function prepareUsbFixture({onCreated}={}) {
  assertUsbQa();let created;
  const fixture=await prepareManualFixture({onCreated:f=>{
    created=f.runId;const p=ownedPaths();
    writeFileSync(p.ownerPath,JSON.stringify({version:1,mode:'m7c_synthetic_usb',runId:f.runId,ownerId:randomUUID(),phase:'preparing'}),{flag:'wx',mode:0o600});
    onCreated?.(f.runId);
  }});
  if(fixture.runId!==created)refuse('fixture_ownership_mismatch');
  const p=ownedPaths(),owner=regularPrivate(p.ownerPath),enrollment=regularPrivate(p.enrollmentPath),admin=adminClient();
  const selector=peekCapabilitySelector(enrollment.capability);
  if(!selector||selector.school_id!==fixture.schoolId)refuse('assignment_capability_refused');
  const key=await must(admin.from('rfid_capability_signing_keys').select('verification_public_key,active').eq('key_id',selector.key_id).eq('school_id',fixture.schoolId).single());
  const assignment=await must(admin.from('student_credentials').select('school_id,student_id,credential_ref,credential_version,revoked_at').eq('id',enrollment.assignmentId).eq('school_id',fixture.schoolId).single());
  const device=await must(admin.from('school_devices').select('school_id,hardware_type,verification_public_key,active').eq('id',enrollment.deviceId).eq('school_id',fixture.schoolId).single());
  if(!key.active||assignment.student_id!==fixture.students[0].id||assignment.revoked_at||assignment.credential_ref!==enrollment.credentialRef
    ||assignment.credential_version!==1||!device.active||device.hardware_type!=='local_simulator'
    ||createPublicKey(createPrivateKey(enrollment.devicePrivateKey)).export({type:'spki',format:'pem'}).toString()!==device.verification_public_key)refuse('synthetic_enrollment_mismatch');
  const now=Date.now();
  const scope={version:1,mode:'m7c_synthetic_usb',runId:fixture.runId,ownerId:owner.ownerId,schoolId:fixture.schoolId,
    principalId:fixture.accounts.principal.id,studentId:fixture.students[0].id,sessionId:randomUUID(),createdAt:now,expiresAt:now+15*60_000,
    enrollmentSha256:enrollmentDigest(enrollment),keyId:selector.key_id,capabilityPublicKey:key.verification_public_key};
  verifyUsbBinding(scope,enrollment);
  writeFileSync(p.sessionPath,JSON.stringify(scope),{flag:'wx',mode:0o600});
  writeFileSync(p.ownerPath,JSON.stringify({...owner,schoolId:fixture.schoolId,phase:'ready'}),{mode:0o600});
  const store=openGatewayDatabase(p.databasePath);try{store.registerReader({readerId:enrollment.readerId,deviceId:enrollment.deviceId,tokenHash:hashReaderKey(enrollment.readerKey),now:new Date().toISOString()});}finally{store.close();}
  return {runId:fixture.runId,sessionId:scope.sessionId,synthetic:true,expiresAt:new Date(scope.expiresAt).toISOString(),firmwarePersistence:false};
}

export function loadUsbFixture(confirmedRun,{allowPreparing=false}={}) {
  assertUsbQa();if(!UUID.test(confirmedRun??''))refuse('explicit_owned_run_confirmation_required');
  const p=ownedPaths(),fixture=regularPrivate(p.manifestPath),owner=regularPrivate(p.ownerPath);
  if(fixture.runId!==confirmedRun||fixture.code!==`MANUAL-${confirmedRun}`||owner.version!==1||owner.mode!=='m7c_synthetic_usb'
    ||owner.runId!==confirmedRun||!UUID.test(owner.ownerId)||(!allowPreparing&&owner.phase!=='ready'))refuse('owned_usb_fixture_required');
  if(allowPreparing&&owner.phase==='preparing')return {p,fixture,owner};
  const scope=regularPrivate(p.sessionPath),enrollment=regularPrivate(p.enrollmentPath);
  if(owner.schoolId!==fixture.schoolId||scope.runId!==confirmedRun||scope.ownerId!==owner.ownerId||scope.schoolId!==fixture.schoolId
    ||scope.principalId!==fixture.accounts.principal.id||scope.studentId!==fixture.students[0].id
    ||enrollment.runId!==confirmedRun)refuse('synthetic_binding_refused');
  const target=assertLoopbackApiUrl(enrollment.target),configured=assertLoopbackApiUrl(process.env.SCHOVERA_TEST_URL||'http://127.0.0.1:3104');
  if(target.origin!==configured.origin)refuse('local_destination_mismatch');
  verifyUsbBinding(scope,enrollment,Date.now(),{existingOnly:true});
  return {p,fixture,owner,scope,enrollment,target};
}

export function freshAuthority(context) {
  let actor;
  return async()=>{
    if(!actor){actor=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedLocalFetch}});
      await must(actor.auth.signInWithPassword({email:context.fixture.accounts.principal.email,password:context.fixture.accounts.principal.password}));}
    const user=await actor.auth.getUser();if(user.error||user.data.user?.id!==context.scope.principalId)return false;
    const profile=await must(actor.from('profiles').select('id,role,school_id,active').eq('id',context.scope.principalId).single());
    if(!profile.active||profile.role!=='principal'||profile.school_id!==context.scope.schoolId)return false;
    const school=await must(actor.from('schools').select('code').eq('id',context.scope.schoolId).single());
    if(school.code!==`MANUAL-${context.scope.runId}`)return false;
    const claims=await must(actor.rpc('issue_rfid_assignment_capability_claims',{
      p_assignment_id:context.enrollment.assignmentId,p_device_id:context.enrollment.deviceId,
      p_key_id:context.scope.keyId,p_public_key:context.scope.capabilityPublicKey}));
    return claims.school_id===context.scope.schoolId&&claims.assignment_id===context.enrollment.assignmentId
      &&claims.assignment_version===1&&claims.credential_ref===context.enrollment.credentialRef&&claims.device_id===context.enrollment.deviceId;
  };
}

export async function cleanUsbFixture(confirmedRun,{discardPending=false}={}) {
  const context=loadUsbFixture(confirmedRun,{allowPreparing:true});
  if(context.owner.phase==='ready'&&existsSync(context.p.databasePath)){
    const store=openGatewayDatabase(context.p.databasePath);try{
      const token=store.acquireWorker();if(!token)refuse('gateway_worker_busy');
      try{const count=store.db.prepare("SELECT COUNT(*) AS n FROM gateway_events WHERE queue_state<>'delivered'").get().n;if(count&&!discardPending)refuse('pending_evidence_requires_explicit_discard');}
      finally{store.releaseWorker(token);}
    }finally{store.close();}
  }
  // Existing lifecycle checks the exact MANUAL run school and generated directory.
  await cleanManualFixture();
  return {cleanedOwnedSyntheticFixture:true,runId:confirmedRun};
}
