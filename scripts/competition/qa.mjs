// This helper is invoked only in the already-approved QA checkout with its own
// explicit --env-file. No developer environment or unowned fixture is adopted.
import assert from 'node:assert/strict';import {existsSync,writeFileSync} from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createClient} from '@supabase/supabase-js';
import {qaDirectory,stateFile,safeQa,readState,minimalEnvironment} from './guard.mjs';import {assertLocalTestEnvironment} from '../lib/local-test-env.mjs';import {readManualFixture,manualPaths,cleanManualFixture} from '../manual-demo.mjs';import {schoolToday} from '../../src/lib/school-date.mjs';import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';
safeQa();assert.equal(process.cwd(),qaDirectory,'Use the approved QA checkout');assertLocalTestEnvironment();const [action,owner]=process.argv.slice(2),state=readState();if(!state||state.owner!==owner)throw Error('Owned competition workflow required');
const env=minimalEnvironment();function run(command,extra=[]){return execFileSync(process.execPath,['--env-file=.env.test.local','scripts/attendance-demo/cli.mjs',command,...extra],{cwd:qaDirectory,env,encoding:'utf8',windowsHide:true,timeout:60000});}
function save(s){writeFileSync(stateFile,JSON.stringify(s,null,2),{mode:0o600});}
function fixture(){const f=readManualFixture();if(f.runId!==state.fixtureRun||f.competition?.owner!==owner||f.code!==`MANUAL-${f.runId}`)throw Error('Fixture ownership mismatch; refusing to adopt or change it.');return f;}
function update(f){writeFileSync(manualPaths().manifestPath,JSON.stringify(f,null,2),{mode:0o600});}
const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=async q=>{const r=await q;if(r.error)throw Error('Owned competition database check failed');return r.data;};
if(action==='prepare'){
 if(state.fixtureRun){const f=fixture();if(f.m2Attendance?.date!==schoolToday())throw Error('Owned rehearsal is dated. Clean it explicitly before preparing a new date.');console.log('Owned fixture already prepared; no duplicate school/students created.');}
 else{
  if(existsSync(path.join(qaDirectory,'.local/schovera-manual-demo/current.json')))throw Error('Unowned rehearsal exists; preserved.');
  let prepared=false;try{run('prepare');prepared=true;}finally{if(existsSync(path.join(qaDirectory,'.local/schovera-manual-demo/current.json'))){const f=readManualFixture();f.competition={owner,prepared,created_at:new Date().toISOString()};state.fixtureRun=f.runId;save(state);update(f);}}
  if(!prepared)throw Error('Partial owned fixture retained for explicit review/cleanup');console.log('Owned fictional school and three role sign-ins prepared privately.');
 }
}else if(action==='credentials'){
 const f=fixture();console.log('PRIVATE FICTIONAL LOCAL LOGINS — do not include these in screenshots, Git or pitch documents');for(const role of ['teacher','parent','principal'])console.log(`${role}: ${f.accounts[role].email}  ${f.accounts[role].password}`);
}else if(action==='status'){
 if(!state.fixtureRun)console.log(JSON.stringify({ready:false,reason:'no_owned_fixture'}));else{const f=fixture(),s=await must(admin.from('schools').select('id,code').eq('id',f.schoolId).single());if(s.code!==f.code)throw Error('School ownership mismatch');const students=await must(admin.from('students').select('id').eq('school_id',f.schoolId));const logins={};
  for(const role of ['teacher','parent','principal']){const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const r=await c.auth.signInWithPassword(f.accounts[role]);if(r.error)throw Error('Owned role sign-in failed');const profile=await c.from('profiles').select('role,school_id').eq('id',r.data.user.id).single();logins[role]=profile.data?.role===role&&profile.data?.school_id===f.schoolId;await c.auth.signOut({scope:'local'});if(!logins[role])throw Error('Owned role scope failed');}
  console.log(JSON.stringify({ready:f.competition.prepared&&Object.values(logins).every(Boolean),attendanceDateCurrent:f.m2Attendance.date===schoolToday(),students:students.length,day:f.m2Attendance.date,logins,rehearsed:!!f.competition.completed,physicalHardware:false}));}
}else if(action==='rehearse'){
 const f=fixture();if(!f.competition.prepared||f.m2Attendance.date!==schoolToday())throw Error('Fresh, complete owned rehearsal required');const {rehearseCompetition}=await import('./rehearse.mjs');const result=await rehearseCompetition(f,{run,update});console.log(JSON.stringify(result));
}else if(action==='clean'){
 const f=fixture(),discard=process.argv.includes('--discard-pending');let pending=0;const gateway=path.join(manualPaths().runDirectory,'reader-gateway.sqlite');if(existsSync(gateway)){const s=openGatewayDatabase(gateway);try{pending+=Number(s.db.prepare("SELECT COUNT(*) AS n FROM gateway_events WHERE queue_state<>'delivered'").get().n);}finally{s.close();}}
 const queue=path.join(qaDirectory,'.local/schovera-rfid-gateway/gateway.sqlite');if(existsSync(queue)){const s=openGatewayDatabase(queue);try{const has=s.db.prepare("SELECT 1 FROM sqlite_master WHERE name='school_operations'").get();if(has)pending+=Number(s.db.prepare("SELECT COUNT(*) AS n FROM school_operations o WHERE school_id=? AND state<>'synced' AND NOT EXISTS(SELECT 1 FROM school_operation_dispositions d WHERE d.operation_id=o.operation_id)").get(f.schoolId).n);}finally{s.close();}}
 if(pending&&!discard)throw Error('Owned pending/attention work retained. Inspect it before explicit clean --discard-pending.');
 if(f.schoolId){const school=await must(admin.from('schools').select('code').eq('id',f.schoolId).single());if(school.code!==f.code)throw Error('School ownership mismatch');}
 if(existsSync(queue)&&f.accounts.teacher?.id){const s=openGatewayDatabase(queue);try{if(s.db.prepare("SELECT 1 FROM sqlite_master WHERE name='school_operations'").get())s.db.prepare('DELETE FROM school_operations WHERE school_id=? AND actor_id=?').run(f.schoolId,f.accounts.teacher.id);}finally{s.close();}}
 if(f.m2Attendance?.version===1&&existsSync(manualPaths().enrollmentPath))run('clean',discard?['--discard-pending']:[]);else await cleanManualFixture();console.log('Owned fictional fixture cleanup verified; private backups retained.');
}else throw Error('Unknown competition QA action');
