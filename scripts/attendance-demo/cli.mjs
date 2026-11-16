// Operator-only fictional M2 rehearsal. Existing school data is never selected.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createPrivateKey} from 'node:crypto';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {assertLocalTestEnvironment} from '../lib/local-test-env.mjs';
import {prepareManualFixture,readManualFixture,manualPaths,cleanManualFixture} from '../manual-demo.mjs';
import {LocalSupabaseV2Transport} from '../rfid-gateway/local-v2-transport.mjs';
import {mockReaderEvent} from './mock-reader.mjs';
import {schoolToday} from '../../src/lib/school-date.mjs';
assertLocalTestEnvironment();
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=async q=>{const r=await q;if(r.error)throw Error('Owned synthetic rehearsal operation failed');return r.data;};
const command=process.argv[2];
if(!['prepare','scan','separate','delayed','clean'].includes(command))throw Error('Choose prepare, scan, separate, delayed or clean');
if(command==='prepare') {
  // Existing fixture refusal is intentionally retained; no automatic replacement.
  const fixture=await prepareManualFixture();fixture.m2Attendance={version:1,date:schoolToday(),manualChild:null};
  const paths=manualPaths();writeFileSync(paths.manifestPath,JSON.stringify(fixture,null,2));
  const manual=await must(admin.from('students').insert({school_id:fixture.schoolId,class_id:fixture.classes[0].id,full_name:'Synthetic Manual Fallback',roll_number:'02',active:true}).select('id').single());
  const parent=await must(admin.from('profiles').select('id').eq('school_id',fixture.schoolId).eq('email',fixture.accounts.parent.email).single());
  await must(admin.from('parent_student_links').insert({parent_id:parent.id,student_id:manual.id,relationship_label:'Parent',status:'active'}));
  fixture.m2Attendance.manualChild=manual.id;writeFileSync(paths.manifestPath,JSON.stringify(fixture,null,2));
  console.log('Owned M2 rehearsal prepared: Grade 8-A, Synthetic Child A and Synthetic Manual Fallback. No current-day classroom record was created. Read sign-ins privately with npm run demo:credentials.');
} else {
  const fixture=readManualFixture();if(fixture.m2Attendance?.version!==1||fixture.code!==`MANUAL-${fixture.runId}`)throw Error('Current fixture is not the owned M2 rehearsal; refusing');
  if(command==='clean')await cleanManualFixture();
  else {
    if(fixture.m2Attendance.date!==schoolToday())throw Error('Rehearsal is dated. Prepare a new owned rehearsal; do not redate existing evidence.');
    const paths=manualPaths(),enrollment=JSON.parse(readFileSync(paths.enrollmentPath,'utf8'));
    if(enrollment.mode!=='synthetic_local_only')throw Error('Synthetic enrollment required');
    const eventPath=path.join(paths.runDirectory,`m2-${command}.json`);
    const event=existsSync(eventPath)?JSON.parse(readFileSync(eventPath,'utf8')):mockReaderEvent(enrollment,command,new Date(Date.now()-(command==='delayed'?20*60_000:0)).toISOString());
    if(!existsSync(eventPath))writeFileSync(eventPath,JSON.stringify(event),{flag:'wx',mode:0o600});
    const transport=new LocalSupabaseV2Transport({target:enrollment.target,devicePrivateKey:createPrivateKey(enrollment.devicePrivateKey)});
    const receipt=await transport.send(event);
    console.log(JSON.stringify({syntheticHardware:true,scenario:command,outcome:receipt.outcome,duplicate:receipt.duplicate,classroomConfirmation:'Teacher action required'}));
  }
}
