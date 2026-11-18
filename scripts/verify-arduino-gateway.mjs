// Owned fictional acceptance only. No production env, reset or physical RFID.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync,spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
import {assertUsbQa,prepareUsbFixture,loadUsbFixture,cleanUsbFixture,adminClient,freshAuthority,must} from './arduino-gateway/context.mjs';
import {TrustedUsbCapture} from './arduino-gateway/capture.mjs';
import {actorClient} from './manual-demo.mjs';
import {openGatewayDatabase} from './rfid-gateway/storage.mjs';
import {LocalSupabaseV2Transport} from './rfid-gateway/local-v2-transport.mjs';
import {schoolToday} from '../src/lib/school-date.mjs';
import {listSerialPorts,validateSelection} from './arduino-local/windows-serial.mjs';

assertUsbQa();const args=process.argv.slice(2);
const usb=args.length===5&&args[0]==='--usb'&&args[1]==='--port'&&args[3]==='--confirm-pnp-id';
if(args.length&&!usb)throw Error('Use no arguments for explicit simulation, or --usb --port COMn --confirm-pnp-id <exact descriptor>');
if(usb)validateSelection(args[2],args[4]);
const env=Object.fromEntries(['PATH','Path','PATHEXT','SystemRoot','WINDIR','ComSpec','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{SCHOVERA_TEST_URL:process.env.SCHOVERA_TEST_URL,SCHOVERA_ARDUINO_TEST_MODE:'synthetic'});
const base=process.env.SCHOVERA_TEST_URL,admin=adminClient(),day=schoolToday();
const output=path.resolve('.local','m7c-acceptance-'+randomUUID());mkdirSync(output,{recursive:true});
const record={started:new Date().toISOString(),source:usb?'actual_usb_serial':'simulated_serial',rfidScanVerified:false,checks:[],passed:false};
let runId,context,browser,physical,physicalExit=null,firmwareMayHold=false,firmwareReleased=false;
const rawCli=(command,extra=[])=>spawnSync(process.execPath,['--env-file=.env.test.local','scripts/arduino-gateway/cli.mjs',command,'--confirm-run',runId,...extra],{env,encoding:'utf8',windowsHide:true,timeout:45000});
function cli(command,extra=[]){const r=rawCli(command,extra);assert.equal(r.status,0,`Owned ${command} command must succeed; raw private output withheld`);const lines=r.stdout.split(/\r?\n/).filter(l=>l.startsWith('{'));return JSON.parse(lines.at(-1));}
function failedCli(command,extra=[]){const r=rawCli(command,extra);assert.notEqual(r.status,0,`Owned ${command} must be refused`);return r;}
function row(id){const store=openGatewayDatabase(context.p.databasePath);try{return store.getEvent(context.enrollment.deviceId,id);}finally{store.close();}}
const attendance=()=>must(admin.from('attendance_records').select('id,student_id,status').eq('school_id',context.scope.schoolId).eq('attendance_date',day));
const gates=()=>must(admin.from('school_entry_events').select('id,device_event_id,student_id').eq('school_id',context.scope.schoolId));
const check=message=>{record.checks.push(message);console.log('PASS: '+message);};
const wait=async(predicate,label)=>{const until=Date.now()+20000;while(Date.now()<until){if(predicate())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out waiting for '+label);};
async function login(role){const bc=await browser.newContext({viewport:{width:390,height:844}});await bc.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost','[::1]'].includes(u.hostname)||['data:','blob:','about:'].includes(u.protocol)?r.continue():r.abort();});const page=await bc.newPage();page.setDefaultTimeout(20000);page.on('pageerror',()=>record.runtimeErrors=(record.runtimeErrors??0)+1);await page.goto(base);await page.getByLabel('Email',{exact:true}).fill(context.fixture.accounts[role].email);await page.getByLabel('Password',{exact:true}).fill(context.fixture.accounts[role].password);await page.getByRole('button',{name:'Sign in securely',exact:true}).click();await page.locator('.role-'+context.fixture.accounts[role].role).waitFor();await page.goto(base+'/'+context.fixture.accounts[role].role+'/attendance');return page;}
try{
  if(usb)assert.ok((await listSerialPorts()).some(p=>p.port===args[2]&&p.pnpId===args[4]),'Explicitly confirmed port descriptor must still be present');
  await prepareUsbFixture({onCreated:id=>{runId=id;}});context=loadUsbFixture(runId);
  const auditBefore=await must(admin.from('audit_events').select('id,event_type,actor_id,target_id').eq('school_id',context.scope.schoolId));
  assert.equal((await attendance()).length,0);assert.equal((await gates()).length,0);
  const parent=await actorClient(context.fixture.accounts.parent),teacher=await actorClient(context.fixture.accounts.teacher),principal=await actorClient(context.fixture.accounts.principal),unlinked=await actorClient(context.fixture.accounts.unlinkedParent);
  let first;
  if(usb){
    const events=[];physical=spawn(process.execPath,['--env-file=.env.test.local','scripts/arduino-gateway/cli.mjs','connect','--confirm-run',runId,'--port',args[2],'--confirm-pnp-id',args[4]],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let buffer='';physical.on('close',code=>{physicalExit=code;});physical.stderr.on('data',()=>{});
    physical.stdout.on('data',chunk=>{buffer+=chunk;while(buffer.includes('\n')){const at=buffer.indexOf('\n'),line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const value=JSON.parse(line);events.push(value);}catch{}}});
    await wait(()=>events.some(e=>e.event==='serial_opened')||physicalExit!==null,'selected USB open');assert.equal(physicalExit,null,'Actual serial process must remain open');
    physical.stdin.write('status\n');await wait(()=>events.some(e=>e.code==='status_synthetic_ram_only'),'physical STATUS');
    firmwareMayHold=true;physical.stdin.write('arm\n');await wait(()=>events.some(e=>e.event==='local_gateway_receipt')||physicalExit!==null||events.some(e=>e.code==='arm_refused'),'actual incoming bytes and durable receipt');
    first=events.find(e=>e.event==='local_gateway_receipt');assert.ok(first?.durable,'No physical success without actual received bytes and committed receipt');
    assert.ok(events.some(e=>e.event==='synthetic_acquisition_bytes_received'&&e.source==='usb_serial'));assert.equal(first.destinationDelivered,false);
    const original=row(first.receipt.event_id);assert.equal(original.local_receipt_id,first.receipt.local_receipt_id);
    assert.ok(failedCli('sync').stdout.includes('gateway_worker_busy'));assert.equal(row(first.receipt.event_id).queue_state,'pending');
    physical.stdin.write('retry\n');await wait(()=>events.some(e=>e.event==='local_gateway_receipt'&&e.receipt.duplicate===true),'physical duplicate retry');
    const repeat=events.find(e=>e.event==='local_gateway_receipt'&&e.receipt.duplicate===true);assert.equal(repeat.receipt.local_receipt_id,first.receipt.local_receipt_id);
    assert.ok(row(first.receipt.event_id).canonical_payload===original.canonical_payload,'Original immutable bytes must match');
    physical.stdin.write('release '+first.receipt.event_id+'\n');await wait(()=>events.some(e=>e.event==='firmware_ram_released_by_operator'),'explicit post-commit RAM release');firmwareReleased=true;
    physical.stdin.end('close\n');await wait(()=>physicalExit!==null,'USB close');assert.equal(physicalExit,0);
    writeFileSync(path.join(output,'usb-events.json'),JSON.stringify({events,rfidScanVerified:false},null,2));
    check('actual selected USB ARM -> authenticated SQLite ingress -> exact durable local receipt; same-ID physical RETRY; competing worker refused; explicit release only after receipt');
  }else{
    first=cli('simulate');assert.equal(first.source,'simulated_serial');const repeat=cli('repeat',['--event-id',first.receipt.event_id]);assert.equal(repeat.receipt.duplicate,true);assert.equal(repeat.receipt.local_receipt_id,first.receipt.local_receipt_id);
    const store=openGatewayDatabase(context.p.databasePath),held=new TrustedUsbCapture({store,scope:context.scope,enrollment:context.enrollment,authorize:freshAuthority(context)});try{assert.ok(failedCli('sync').stdout.includes('gateway_worker_busy'));}finally{held.close();store.close();}
    check('explicit simulated Serial capture -> existing authenticated ingress/SQLite; exact duplicate and independent competing-worker denial');
  }
  const eventId=first.receipt.event_id,original=row(eventId);assert.equal(first.receipt.outcome,'recorded_locally');assert.equal(first.durable,true);assert.equal(original.queue_state,'pending');assert.equal((await attendance()).length,0);assert.equal((await gates()).length,0);
  cli('sync',['--simulate-outage']);assert.equal(row(eventId).queue_state,'pending');assert.equal((await gates()).length,0);
  const uncertain=cli('sync',['--lose-response-once']);assert.equal(uncertain.confirmed.length,0);assert.equal(row(eventId).queue_state,'pending');assert.equal(row(eventId).remote_receipt_id,null);assert.equal((await gates()).length,1);
  const delivered=cli('sync');assert.equal(delivered.confirmed.length,1);assert.equal(delivered.confirmed[0].databaseVerified,true);assert.equal(delivered.confirmed[0].destinationDelivered,true);
  const saved=row(eventId);assert.equal(saved.queue_state,'delivered');assert.equal(saved.local_receipt_id,original.local_receipt_id);assert.ok(saved.canonical_payload===original.canonical_payload,'Reopened signed v2 bytes must remain identical');
  cli('sync');assert.equal((await gates()).length,1);assert.equal((await attendance()).length,0);
  const receipts=await must(admin.from('device_event_receipts').select('id,payload_hash,received_at,device_event_id,outcome').eq('device_id',context.enrollment.deviceId));assert.equal(receipts.length,1);assert.equal(receipts[0].id,saved.remote_receipt_id);assert.equal(receipts[0].payload_hash,saved.payload_hash);
  assert.deepEqual(await must(admin.from('audit_events').select('id,event_type,actor_id,target_id').eq('school_id',context.scope.schoolId)),auditBefore,'Gate delivery must not create classroom-save audits');
  check('separate process reopen, offline retry, real destination acceptance with simulated lost response, immutable replay and matched database receipt; no duplicate gate or classroom row');
  record.receiptExample={event_id:eventId,local_receipt_id:original.local_receipt_id,remote_receipt_id:saved.remote_receipt_id,outcome:'accepted',destination:'loopback_local_server'};
  const real=new LocalSupabaseV2Transport({target:base,devicePrivateKey:context.enrollment.devicePrivateKey}),event=JSON.parse(saved.canonical_payload);
  await assert.rejects(new LocalSupabaseV2Transport({target:base,devicePrivateKey:generateKeyPairSync('ed25519').privateKey}).send(event));
  await assert.rejects(real.send({...event,observed_at:new Date(Date.parse(event.observed_at)+1).toISOString()}));
  await assert.rejects(real.send({...event,credential_ref:'synthetic-unmatched-assignment'}));assert.equal((await gates()).length,1);
  assert.equal((await must(unlinked.from('school_entry_events').select('id').eq('school_id',context.scope.schoolId))).length,0);
  const denial=await parent.rpc('issue_rfid_assignment_capability_claims',{p_assignment_id:context.enrollment.assignmentId,p_device_id:context.enrollment.deviceId,p_key_id:context.scope.keyId,p_public_key:context.scope.capabilityPublicKey});assert.ok(denial.error);
  check('actual signed API rejects wrong key, changed-content replay and assignment mismatch; unlinked Parent and non-Principal issuance denied');
  browser=await chromium.launch({channel:'chrome',headless:true});const teacherPage=await login('teacher'),register=teacherPage.locator('.teacher-attendance-register');
  await teacherPage.getByText('Gate evidence recorded; classroom attendance is not confirmed',{exact:true}).waitFor();
  const article=register.locator('.m2-exception').filter({hasText:'Synthetic Child A'});await article.getByRole('button',{name:'Review without changing attendance',exact:true}).click();
  await article.getByLabel('What did you check?',{exact:true}).fill('Synthetic USB evidence checked separately from classroom presence');await article.getByRole('button',{name:'Record staff review',exact:true}).click();
  await register.getByText('Review recorded. Classroom attendance was not changed.',{exact:true}).waitFor();assert.equal((await attendance()).length,0);
  await register.locator('.roster-row').filter({hasText:'Synthetic Child A'}).getByRole('button',{name:'Present',exact:true}).click();await register.getByRole('button',{name:'Save draft',exact:true}).click();
  await register.getByText('Draft saved. Parents cannot see draft attendance.',{exact:true}).waitFor();assert.equal((await attendance()).length,0);
  const parentPage=await login('parent');await parentPage.locator('.child-switcher select').selectOption(context.scope.studentId);
  assert.equal((await must(parent.from('attendance_records').select('id').eq('student_id',context.scope.studentId).eq('attendance_date',day))).length,0);
  const draft=await parent.from('attendance_registers').select('id').eq('class_id',context.fixture.classes[0].id).eq('attendance_date',day);assert.ok(draft.error||draft.data.length===0);
  const beforeConfirm=await must(parent.rpc('parent_classroom_confirmation',{p_student_id:context.scope.studentId}));assert.equal(beforeConfirm.available,false);
  await register.getByRole('button',{name:'Finalize attendance',exact:true}).click();await register.getByText('Teacher-confirmed attendance',{exact:false}).waitFor();
  const confirmed=await attendance();assert.equal(confirmed.length,1);assert.equal(confirmed[0].status,'present');assert.equal(confirmed[0].student_id,context.scope.studentId);
  const snap=await must(teacher.rpc('class_attendance_snapshot',{p_class_id:context.fixture.classes[0].id,p_attendance_date:day}));assert.equal(snap.state,'finalized');assert.equal(snap.revision,2);assert.equal(snap.confirmed_by,context.fixture.accounts.teacher.id);assert.ok(Date.parse(snap.confirmed_at));
  const changes=await must(admin.from('attendance_changes').select('actor_id,register_id,student_id,revision,previous_status,new_status,reason').eq('school_id',context.scope.schoolId).eq('register_id',snap.register_id));assert.equal(changes.length,1);assert.equal(changes[0].register_id,snap.register_id);assert.equal(changes[0].actor_id,context.fixture.accounts.teacher.id);assert.equal(changes[0].revision,2);
  await parentPage.reload();await parentPage.getByText(`Current class: Teacher-saved attendance is available for ${day}.`,{exact:true}).waitFor();assert.equal((await must(parent.rpc('parent_classroom_confirmation',{p_student_id:context.scope.studentId}))).available,true);
  const overview=await must(principal.rpc('principal_attendance_review',{p_attendance_date:day,p_limit:40}));assert.equal(overview.summary.students,2);assert.equal(overview.summary.saved,1);assert.equal(overview.summary.present,1);assert.equal(overview.summary.classes,2);
  const communication=await must(principal.rpc('principal_communication_page',{p_filter:'all',p_limit:40}));assert.equal(communication.summary.total_count,1);assert.equal(communication.summary.important_count,1);assert.equal(communication.summary.acknowledged_count,0);
  const principalPage=await login('principal');await principalPage.getByText('Classroom attendance overview',{exact:true}).waitFor();
  for(const [role,page]of [['teacher',teacherPage],['parent',parentPage],['principal',principalPage]]){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,role+'.png'),fullPage:true,animations:'disabled'});}
  check('real three-portal UI: staff evidence review changes no attendance; draft hidden from Parent; separate Teacher finalization creates one traceable revision; authorized Parent and exact Principal totals');
  const pending=cli('simulate'),pendingId=pending.receipt.event_id;await must(principal.rpc('revoke_student_credential',{p_credential_id:context.enrollment.assignmentId}));
  const blocked=failedCli('simulate');assert.ok(blocked.stdout.includes('fresh_host_authorization_'));
  const revoked=cli('sync');assert.equal(revoked.confirmed[0].outcome,'unresolved');assert.equal(revoked.confirmed[0].destinationDelivered,false);assert.equal(row(pendingId).queue_state,'attention');assert.equal((await gates()).length,1);assert.deepEqual(await attendance(),confirmed);
  const retry=cli('repeat',['--event-id',pendingId]);assert.equal(retry.receipt.duplicate,true);assert.equal(retry.receipt.local_receipt_id,pending.receipt.local_receipt_id);
  {const store=openGatewayDatabase(context.p.databasePath);try{store.revokeReader(context.enrollment.readerId);}finally{store.close();}}
  assert.ok(failedCli('simulate').stdout.includes('reader_unauthorized'));assert.equal(row(pendingId).queue_state,'attention');assert.equal(row(eventId).queue_state,'delivered');
  assert.equal(record.runtimeErrors??0,0);check('revoked assignment blocks new ARM/capture; already committed original receives unresolved attention without wrong-child attribution; local reader revocation preserves queue and classroom history');
  record.passed=true;
}finally{
  await browser?.close();
  if(physical&&physicalExit===null){physical.stdin.end('close\n');await Promise.race([new Promise(resolve=>physical.once('close',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);if(physical.exitCode===null)execFileSync('taskkill',['/PID',String(physical.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
  if(runId){
    if(usb&&firmwareMayHold&&!firmwareReleased){record.fixtureRetainedForHardwareRecovery=true;console.log('Owned physical-test fixture retained; pending firmware was not cleared or discarded. Inspect its private journal before recovery.');}
    else {await cleanUsbFixture(runId,{discardPending:true});record.ownedFixtureCleaned=true;}
  }
  record.finished=new Date().toISOString();writeFileSync(path.join(output,'result.json'),JSON.stringify(record,null,2));console.log('M7C acceptance evidence: '+output);
}
