// Real local-only M3 acceptance through the public rehearsal CLI and gateway.
import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {createPrivateKey,generateKeyPairSync,randomUUID} from 'node:crypto';import path from 'node:path';
import {createClient} from '@supabase/supabase-js';import {chromium} from 'playwright';
import {assertLocalTestEnvironment} from './lib/local-test-env.mjs';import {readManualFixture,manualPaths,cleanManualFixture} from './manual-demo.mjs';
import {openGatewayDatabase} from './rfid-gateway/storage.mjs';import {gatewayDiagnostics} from './rfid-gateway/diagnostics.mjs';import {LocalSupabaseV2Transport} from './rfid-gateway/local-v2-transport.mjs';import {mockReaderEvent} from './attendance-demo/mock-reader.mjs';
assertLocalTestEnvironment();const base=process.env.SCHOVERA_TEST_URL||'http://127.0.0.1:3104';const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const must=async p=>{const r=await p;if(r.error)throw Error(r.error.message);return r.data;};
const env=Object.fromEntries(['PATH','Path','PATHEXT','SystemRoot','WINDIR','ComSpec','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));env.SCHOVERA_TEST_URL=base;
const cli=command=>execFileSync(process.execPath,['--env-file=.env.test.local','scripts/attendance-demo/cli.mjs',command],{env,encoding:'utf8',windowsHide:true,timeout:60000});
const out=path.resolve('.local','reader-readiness-'+randomUUID());mkdirSync(out,{recursive:true});let fixture,browser;
const errors=[];
async function page(role){const context=await browser.newContext({viewport:{width:390,height:844}});await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost','[::1]'].includes(u.hostname)||['data:','blob:','about:'].includes(u.protocol)?r.continue():r.abort();});const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.getByLabel('Email',{exact:true}).fill(fixture.accounts[role].email);await p.getByLabel('Password',{exact:true}).fill(fixture.accounts[role].password);await p.getByRole('button',{name:'Sign in securely',exact:true}).click();await p.locator('.role-'+role).waitFor();await p.goto(base+'/'+role+'/attendance');return p;}
try{
  cli('prepare');fixture=readManualFixture();assert.equal(fixture.m2Attendance.version,1);const enrollment=JSON.parse(readFileSync(manualPaths().enrollmentPath,'utf8'));
  const gate=()=>must(admin.from('school_entry_events').select('id,device_event_id,observed_at,received_at,sequence_state,timestamp_quality').eq('school_id',fixture.schoolId));
  const attendance=()=>must(admin.from('attendance_records').select('id,status').eq('school_id',fixture.schoolId).eq('attendance_date',fixture.m2Attendance.date));
  const diagnostics=()=>{const s=openGatewayDatabase(path.join(manualPaths().runDirectory,'reader-gateway.sqlite'));try{return gatewayDiagnostics(s,enrollment.readerId);}finally{s.close();}};
  assert.equal((await attendance()).length,0);const first=JSON.parse(cli('scan').trim());assert.equal(first.capture.duplicate,false);assert.equal((await gate()).length,1);assert.equal(diagnostics().queue.delivered,1);
  const repeat=JSON.parse(cli('duplicate').trim());assert.equal(repeat.capture.duplicate,true);assert.equal((await gate()).length,1);
  cli('offline');assert.equal((await gate()).length,1);assert.equal(diagnostics().queue.pending,1);cli('inspect');
  // Each CLI invocation is a separate Node process with an independently opened
  // database. Sync therefore proves restart recovery, not an in-memory queue.
  cli('sync');assert.equal(diagnostics().queue.pending,0);assert.equal((await gate()).length,2);assert.equal((await attendance()).length,0);
  const legacy=mockReaderEvent(enrollment,'separate',new Date(Date.now()-90000).toISOString()),legacyBytes=JSON.stringify(legacy);
  await new LocalSupabaseV2Transport({target:base,devicePrivateKey:createPrivateKey(enrollment.devicePrivateKey)}).send(legacy);
  const legacyPath=path.join(manualPaths().runDirectory,'m2-separate.json');writeFileSync(legacyPath,legacyBytes,{flag:'wx',mode:0o600});
  cli('separate');assert.equal(readFileSync(legacyPath,'utf8'),legacyBytes);{const s=openGatewayDatabase(path.join(manualPaths().runDirectory,'reader-gateway.sqlite'));try{assert.deepEqual(JSON.parse(s.getEvent(enrollment.deviceId,legacy.event_id).canonical_payload),legacy);}finally{s.close();}}
  cli('delayed');cli('gap');cli('out_of_order');const saved=await gate();assert.equal(saved.length,6);assert.ok(saved.some(r=>r.sequence_state==='gap'));assert.ok(saved.some(r=>r.sequence_state==='out_of_order'));assert.ok(saved.some(r=>r.timestamp_quality==='clock_uncertain'));
  assert.equal((await attendance()).length,0);console.log('PASS: signed adapter → durable SQLite → process exit/reopen → local v2 API → PostgreSQL; exact duplicate, separate scan, outage/reconnect and ordering/time evidence; no classroom mutation.');
  const wrong=new LocalSupabaseV2Transport({target:base,devicePrivateKey:generateKeyPairSync('ed25519').privateKey});
  await assert.rejects(wrong.send({...mockReaderEvent(enrollment,'revoked',new Date().toISOString()),event_id:randomUUID(),device_sequence:20}),/device_or_capability_revoked/);assert.equal((await gate()).length,6);
  const unknown=JSON.parse(cli('unknown').trim());assert.equal(unknown.results[0].state,'attention_required');assert.equal((await gate()).length,6);assert.equal(diagnostics().unresolvedReceipts,0);
  cli('reader-offline');assert.equal((await gate()).length,6);
  browser=await chromium.launch({channel:'chrome',headless:true});const teacher=await page('teacher'),register=teacher.locator('.teacher-attendance-register');
  await register.getByText('Gate evidence recorded; classroom attendance is not confirmed',{exact:true}).waitFor();await register.getByRole('button',{name:'Finalize attendance',exact:true}).click();await register.getByText('Teacher-confirmed attendance',{exact:false}).waitFor();
  assert.equal((await attendance()).length,2);const parent=await page('parent');await parent.locator('.child-switcher select').selectOption(fixture.students[0].id);await parent.getByText('Current class: Teacher-saved attendance is available for '+fixture.m2Attendance.date+'.',{exact:true}).waitFor();
  const principal=await page('principal');await principal.getByText('Classroom attendance overview',{exact:true}).waitFor();
  for(const [role,p]of [['teacher',teacher],['parent',parent],['principal',principal]]){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await p.screenshot({path:path.join(out,role+'.png'),fullPage:true,animations:'disabled',style:'.application-shell{position:relative!important;top:auto!important}'});}
  const confirmed=await attendance();cli('revoke-card');const revoked=JSON.parse(cli('revoked').trim());assert.equal(revoked.results[0].outcome,'unresolved');assert.equal(diagnostics().unresolvedReceipts,1);assert.equal((await gate()).length,6);assert.deepEqual(await attendance(),confirmed);
  cli('revoke-device');cli('device_revoked');assert.equal((await gate()).length,6);cli('revoke-reader');
  const refused=spawnSync(process.execPath,['--env-file=.env.test.local','scripts/attendance-demo/cli.mjs','scan'],{env,encoding:'utf8',windowsHide:true,timeout:20000});assert.notEqual(refused.status,0);assert.match(refused.stderr,/reader is unknown or revoked/);
  assert.equal(diagnostics().reader,'reader_revoked');const diagnostic=cli('inspect');for(const secret of [enrollment.readerKey,enrollment.devicePrivateKey,enrollment.capability,enrollment.credentialRef])assert.ok(!diagnostic.includes(secret));
  const unclean=spawnSync(process.execPath,['--env-file=.env.test.local','scripts/attendance-demo/cli.mjs','clean'],{env,encoding:'utf8',windowsHide:true,timeout:20000});assert.notEqual(unclean.status,0);assert.match(unclean.stderr,/Pending\/attention evidence retained/);assert.equal(readManualFixture().runId,fixture.runId);
  assert.deepEqual(errors,[]);writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,gateEvents:6,unresolvedReceipts:1,classroomRowsAfterTeacherFinalize:2,processRestarts:true,physicalHardware:false,errors},null,2));console.log('PASS: bad signature/unbound credential refusal, revoked card retained unresolved, device/reader revocation, private operator diagnostics, protected cleanup refusal, Teacher review/finalization and Parent/Principal mobile views.');
} finally {
  await browser?.close();if(fixture){assert.equal(readManualFixture().runId,fixture.runId);await cleanManualFixture();assert.deepEqual(await must(admin.from('schools').select('id').eq('id',fixture.schoolId)),[]);}
  console.log('Owned fictional fixture cleanup verified; captures at '+out);
}
