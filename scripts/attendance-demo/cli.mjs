// Operator-only fictional M2 rehearsal. Existing school data is never selected.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createPrivateKey} from 'node:crypto';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {assertLocalTestEnvironment} from '../lib/local-test-env.mjs';
import {prepareManualFixture,readManualFixture,manualPaths,cleanManualFixture,actorClient} from '../manual-demo.mjs';
import {LocalSupabaseV2Transport,syncPendingV2Events,assertLoopbackApiUrl} from '../rfid-gateway/local-v2-transport.mjs';
import {MockReaderAdapter} from './mock-reader.mjs';
import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';
import {captureAcquisition,UnconfiguredPhysicalReader,eventFromAcquisition} from '../rfid-gateway/reader-adapter.mjs';
import {hashReaderKey} from '../rfid-gateway/ingress.mjs';
import {gatewayDiagnostics} from '../rfid-gateway/diagnostics.mjs';
import {RetryableTransportError} from '../rfid-gateway/transport.mjs';
import {schoolToday} from '../../src/lib/school-date.mjs';
assertLocalTestEnvironment();
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=async q=>{const r=await q;if(r.error)throw Error('Owned synthetic rehearsal operation failed');return r.data;};
const command=process.argv[2];
const commands=['prepare','scan','duplicate','separate','delayed','offline','sync','inspect','revoke-card','revoked','revoke-reader','reader-offline','revoke-device','device_revoked','unknown','gap','out_of_order','clean'];
if(!commands.includes(command)||process.argv.slice(3).some(a=>a!=='--discard-pending')||(process.argv.includes('--discard-pending')&&command!=='clean'))throw Error('Choose an attendance:demo command; only clean accepts --discard-pending');
if(command==='prepare') {
  // Existing fixture refusal is intentionally retained; no automatic replacement.
  const fixture=await prepareManualFixture();fixture.m2Attendance={version:1,date:schoolToday(),manualChild:null};
  const paths=manualPaths();writeFileSync(paths.manifestPath,JSON.stringify(fixture,null,2));
  const manual=await must(admin.from('students').insert({school_id:fixture.schoolId,class_id:fixture.classes[0].id,full_name:'Synthetic Manual Fallback',roll_number:'02',active:true}).select('id').single());
  const parent=await must(admin.from('profiles').select('id').eq('school_id',fixture.schoolId).eq('email',fixture.accounts.parent.email).single());
  await must(admin.from('parent_student_links').insert({parent_id:parent.id,student_id:manual.id,relationship_label:'Parent',status:'active'}));
  fixture.m2Attendance.manualChild=manual.id;writeFileSync(paths.manifestPath,JSON.stringify(fixture,null,2));
  console.log('Owned fictional rehearsal prepared: Grade 8-A, Synthetic Child A and Synthetic Manual Fallback. No current-day classroom record was created. Read sign-ins privately with npm run demo:credentials.');
} else {
  const fixture=readManualFixture();if(fixture.m2Attendance?.version!==1||fixture.code!==`MANUAL-${fixture.runId}`)throw Error('Current fixture is not the owned M2 rehearsal; refusing');
  const paths=manualPaths(),enrollment=JSON.parse(readFileSync(paths.enrollmentPath,'utf8'));
  if(enrollment.mode!=='synthetic_local_only'||enrollment.runId!==fixture.runId)throw Error('Owned synthetic enrollment required');
  const target=assertLoopbackApiUrl(enrollment.target);
  if(target.origin!==new URL(process.env.SCHOVERA_TEST_URL||'http://127.0.0.1:3104').origin)throw Error('Target does not match approved local origin');
  const dbPath=path.join(paths.runDirectory,'reader-gateway.sqlite'),store=openGatewayDatabase(dbPath);
  try {
    const registered=store.getReader(enrollment.readerId);
    if(!registered)store.registerReader({readerId:enrollment.readerId,deviceId:enrollment.deviceId,tokenHash:hashReaderKey(enrollment.readerKey),now:new Date().toISOString()});
    else if(registered.device_id!==enrollment.deviceId||registered.token_sha256!==hashReaderKey(enrollment.readerKey))throw Error('Reader enrollment mismatch; preserve for review');
    if(command==='clean') {
      const retained=store.db.prepare("SELECT COUNT(*) AS n FROM gateway_events WHERE queue_state<>'delivered'").get().n;
      if(retained&&!process.argv.includes('--discard-pending'))throw Error('Pending/attention evidence retained. Inspect first; only this owned rehearsal can be cleaned with --discard-pending');
    } else if(command==='inspect') {
      let available=false;try{const r=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(5000)});available=r.ok;}catch{}
      console.log(JSON.stringify({simulation:true,physicalReader:new UnconfiguredPhysicalReader().status(),gateway:gatewayDiagnostics(store,enrollment.readerId,{adapterState:'mock_configured_not_running',serviceAvailable:available})}));
    } else if(command==='reader-offline') {
      const mock=new MockReaderAdapter(enrollment,{available:false});console.log(JSON.stringify({simulation:true,...mock.status()}));
      try{await mock.read('scan',new Date().toISOString());}catch(e){if(e.code!=='reader_offline')throw e;}
    } else if(command==='revoke-reader') {
      store.revokeReader(enrollment.readerId);console.log('Owned mock ingress reader revoked. New capture is refused; prior committed work is retained.');
    } else if(command==='revoke-card'||command==='revoke-device') {
      const principal=await actorClient(fixture.accounts.principal);
      await must(principal.rpc(command==='revoke-card'?'revoke_student_credential':'revoke_school_device',command==='revoke-card'?{p_credential_id:fixture.assignmentId}:{p_device_id:enrollment.deviceId}));
      console.log('Owned synthetic '+(command==='revoke-card'?'credential':'device')+' revoked; no new identity is assigned to retained evidence.');
    } else {
    if(fixture.m2Attendance.date!==schoolToday())throw Error('Rehearsal is dated. Prepare a new owned rehearsal; do not redate existing evidence.');
      let capture=null;
      if(command!=='sync'){
        const scenario=command==='duplicate'?'scan':command,eventPath=path.join(paths.runDirectory,`m3-${scenario}.json`);
        const mock=new MockReaderAdapter(enrollment);
        const legacyPath=path.join(paths.runDirectory,`m2-${scenario}.json`);
        let acquisition;
        if(existsSync(eventPath))acquisition=JSON.parse(readFileSync(eventPath,'utf8'));
        else if(existsSync(legacyPath)){
          // Preserve the exact original M2 event on first adoption of its queue.
          // Never assign the old event ID a new observed timestamp.
          const previous=JSON.parse(readFileSync(legacyPath,'utf8'));
          acquisition={acquisitionId:previous.event_id,sequence:previous.device_sequence,observedAt:previous.observed_at,eventType:previous.event_type};
          const mapped=eventFromAcquisition(acquisition,enrollment);
          if(JSON.stringify(mapped)!==JSON.stringify(previous))throw Error('Existing rehearsal event does not match enrollment; preserve it for review');
        }else acquisition=await mock.read(scenario,new Date(Date.now()-(command==='delayed'?20*60_000:0)).toISOString());
        if(!existsSync(eventPath))writeFileSync(eventPath,JSON.stringify(acquisition),{flag:'wx',mode:0o600});
        // Deliberately mismatched opaque evidence tests a rejection, not a guessed
        // unknown child's identity. It never bypasses signed assignment binding.
        capture=captureAcquisition(store,acquisition,command==='unknown'?{...enrollment,credentialRef:'synthetic-unmatched-reference'}:enrollment);
      }
      const transport=command==='offline'?{async send(){throw new RetryableTransportError('simulated_network_unavailable');}}:new LocalSupabaseV2Transport({target:enrollment.target,devicePrivateKey:createPrivateKey(enrollment.devicePrivateKey)});
      const results=await syncPendingV2Events(store,transport,{force:true});
      console.log(JSON.stringify({syntheticHardware:true,destination:'loopback_local_server',scenario:command,capture:capture?{event_id:capture.event_id,local_receipt_id:capture.local_receipt_id,duplicate:capture.duplicate,queue_state:capture.queue_state,local_received_at:capture.received_at}:null,results,diagnostics:gatewayDiagnostics(store,enrollment.readerId,{adapterState:'mock_reader_active'}),classroomConfirmation:'Teacher action required'}));
    }
  } finally {store.close();}
  if(command==='clean')await cleanManualFixture();
}
