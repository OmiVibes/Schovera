import {it,expect,afterEach} from 'vitest';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {SerialLines} from './serial-lines.mjs';
import {SerialBridge} from './serial-bridge.mjs';
import {postValidation,loadHostAccess,validateAccess,ENDPOINT} from './validation-client.mjs';
import {WindowsSerial,safeDeviceCommand,validateSelection} from './windows-serial.mjs';
import {createDryRunServer} from './server.mjs';
import {DryRunSession} from './protocol.mjs';

const cleanup=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
const access=()=>({endpoint:ENDPOINT,sessionId:randomUUID(),token:'b'.repeat(64)});
const message=(a,patch={})=>JSON.stringify({schema:'schovera.arduino.acquisition',version:1,kind:'synthetic',device:'uno-r4-wifi-phase1',
  session_id:a.sessionId,acquisition_id:randomUUID(),sequence:1,observed_at:'2026-11-18T09:00:00.000Z',event_type:'check_in',...patch});
const result=text=>{const v=JSON.parse(text);return {outcome:'validated_only',acquisition:{acquisitionId:v.acquisition_id,sequence:v.sequence,observedAt:v.observed_at,eventType:'check_in'},synthetic:true,durable:false,destinationDelivered:false,physicalHardwareVerified:false,duplicate:false,sequence_state:'in_order'};};
function fixture(options={}){const a=access(),reports=[],writes=[],sent=[];const bridge=new SerialBridge({access:a,
  write:async line=>writes.push(line),report:v=>reports.push(v),send:async text=>{sent.push(text);return result(text);},...options});return {a,bridge,reports,writes,sent};}
async function serve(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3187,'127.0.0.1',resolve);});cleanup.push(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));}

it('frames partial and combined actual byte chunks; separates DIAG from JSON',()=>{
  const lines=[],decoder=new SerialLines(v=>lines.push(v));decoder.push(Buffer.from('DIAG synthetic_only; no_reader; RAM_only; no_gateway_delivery\r\n{"a":'));
  decoder.push(Buffer.from('1}\n'));expect(lines).toEqual([{type:'diag',code:'status_synthetic_ram_only'},{type:'candidate',text:'{"a":1}'}]);
});
it('bounds oversized/NUL/non-ASCII lines and resynchronizes at a newline',()=>{
  const lines=[],decoder=new SerialLines(v=>lines.push(v));for(const bad of [Buffer.alloc(513,65),Buffer.from([0,65]),Buffer.from([255])])decoder.push(Buffer.concat([bad,Buffer.from('\n')]));
  decoder.push(Buffer.from('DIAG no_pending_synthetic_message\n'));expect(lines.slice(0,3).every(v=>v.type==='rejected')).toBe(true);expect(lines[3].code).toBe('device_has_no_pending_message');
});
it('accepts split CRLF framing but never repairs an embedded CR inside acquisition bytes',()=>{
  const lines=[],decoder=new SerialLines(v=>lines.push(v));decoder.push(Buffer.from('DIAG no_pending_synthetic_message\r'));decoder.push(Buffer.from('\n{"se\rssion":1}\n'));
  expect(lines).toEqual([{type:'diag',code:'device_has_no_pending_message'},{type:'rejected',code:'invalid_or_oversized_serial_line'}]);
});
it('does not echo fake DIAG secrets, UID data or shell text to operator reports',()=>{
  const f=fixture();const secret='NEVER_ECHO_THIS_PRIVATE_TEST_SENTINEL';
  for(const text of ['DIAG '+secret,'& powershell '+secret,message(f.a,{raw_uid:secret}),message(f.a,{student_id:secret}),message(f.a,{kind:'physical'})])f.bridge.feed(Buffer.from(text+'\n'));
  expect(f.sent).toHaveLength(0);expect(JSON.stringify(f.reports)).not.toContain(secret);expect(f.writes).toHaveLength(0);
});
it('retains exact Serial identity/time/body across lost validation and retry',async()=>{
  let calls=0;const captured=[];const f=fixture({send:async text=>{captured.push(text);if(++calls===1)throw Error('receiver_unavailable_or_response_lost');return {...result(text),duplicate:true,sequence_state:undefined};}});
  const text=message(f.a);f.bridge.feed(Buffer.from(text+'\n'));await f.bridge.inFlight;
  expect(f.reports.at(-1).event).toBe('validation_unconfirmed');await f.bridge.command('retry-validation');
  expect(captured).toEqual([text,text]);expect(f.reports.at(-1)).toMatchObject({event:'validated_only',duplicate:true,durable:false,destinationDelivered:false});
});
it('coalesces in-flight duplicates and refuses competing observations without a growing outbox',async()=>{
  let finish;const f=fixture({send:text=>new Promise(resolve=>{finish=()=>resolve(result(text));})});const text=message(f.a);
  f.bridge.feed(Buffer.from(text+'\n'+text+'\n'+message(f.a,{sequence:2})+'\n'));expect(f.bridge.pending.text).toBe(text);
  expect(f.reports.some(v=>v.event==='serial_rejected')).toBe(true);finish();await f.bridge.inFlight;expect(f.bridge.pending.validated).toBe(true);
});
it('recognizes identical retries and rejects conflicting replay/sequence reuse after explicit discard',async()=>{
  const f=fixture(),text=message(f.a);const id=JSON.parse(text).acquisition_id;f.bridge.feed(Buffer.from(text+'\n'));await f.bridge.inFlight;
  f.bridge.feed(Buffer.from(message(f.a,{acquisition_id:id,sequence:2})+'\n'));expect(f.sent).toEqual([text]);
  await f.bridge.command('discard '+id);f.bridge.feed(Buffer.from('DIAG discarded_synthetic_RAM_only\n'));
  f.bridge.feed(Buffer.from(message(f.a)+'\n'));expect(f.sent).toEqual([text]);
  f.bridge.feed(Buffer.from(text+'\n'));await f.bridge.inFlight;expect(f.sent).toEqual([text,text]);
});
it('validates ordering without inventing a scan or automatically clearing firmware work',async()=>{
  const f=fixture();for(const sequence of [4,2]){const text=message(f.a,{sequence});f.bridge.feed(Buffer.from(text+'\n'));await f.bridge.inFlight;
    expect(f.bridge.pending.ordering).toBe(sequence===4?'gap':'out_of_order');await f.bridge.command('discard '+JSON.parse(text).acquisition_id);f.bridge.feed(Buffer.from('DIAG discarded_synthetic_RAM_only\n'));}
  expect(f.writes.every(v=>v.startsWith('CLEAR '))).toBe(true);
});
it('sends closed-grammar ARM/RETRY/STATUS; repeated ARM awaiting bytes retains identity',async()=>{
  const f=fixture();await f.bridge.command('arm');await f.bridge.command('arm');expect(f.writes[0]).toBe(f.writes[1]);
  expect(f.reports.every(v=>v.event!=='synthetic_serial_received')).toBe(true);
  await f.bridge.command('status');await f.bridge.command('retry');expect(f.writes.slice(2)).toEqual(['STATUS','RETRY']);
  expect(f.writes.every(safeDeviceCommand)).toBe(true);expect(f.writes.join('')).not.toContain(f.a.token);
  await expect(f.bridge.command('powershell.exe anything')).rejects.toThrow();
});
it('retains uncertainty on reboot, discards partial bytes on disconnect and never auto-reopens',async()=>{
  const f=fixture(),text=message(f.a);f.bridge.feed(Buffer.from(text+'\n'));await f.bridge.inFlight;
  f.bridge.feed(Buffer.from('DIAG Schovera M7A UNO R4 WiFi; synthetic only; RFID not implemented\n'+text.slice(0,20)));
  expect(f.bridge.pending.text).toBe(text);expect(f.reports.some(v=>v.event==='device_boot_observed')).toBe(true);
  f.bridge.disconnected();f.bridge.feed(Buffer.from(text.slice(20)+'\n'));await expect(f.bridge.command('arm')).rejects.toThrow('select_and_confirm');expect(f.writes).toHaveLength(0);
});
it('refuses expired local capture sessions and requires a new operator-controlled host session',async()=>{
  let now=0;const f=fixture({now:()=>now});now=15*60_000;await expect(f.bridge.command('arm')).rejects.toThrow('expired');f.bridge.feed(Buffer.from(message(f.a)+'\n'));expect(f.sent).toHaveLength(0);
});
it('accepts only private host access files in the owned receiver session path',()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'schovera-m7b-access-'));cleanup.push(()=>{if(path.dirname(root)!==os.tmpdir()||!path.basename(root).startsWith('schovera-m7b-access-'))throw Error('Unsafe cleanup');rmSync(root,{recursive:true});});
  const a=access(),dir=path.join(root,'.local/arduino-dry-run',a.sessionId);mkdirSync(dir,{recursive:true});const file=path.join(dir,'host-access.json');writeFileSync(file,JSON.stringify(a));
  expect(loadHostAccess(file,root)).toEqual(a);expect(()=>loadHostAccess('elsewhere.json',root)).toThrow();
  for(const patch of [{endpoint:'http://remote.example/'},{endpoint:ENDPOINT+'?token=anything'},{token:'wrong'},{sessionId:randomUUID(),extra:'not_allowed'}])expect(()=>validateAccess({...a,...patch})).toThrow();
});
it('uses the actual localhost validator with Origin/auth, exact retry and expiry rules',async()=>{
  const a=access();let now=0;const {server}=createDryRunServer({...a,now:()=>now});await serve(server);const text=message(a);
  expect((await postValidation(text,a)).duplicate).toBe(false);expect((await postValidation(text,a)).duplicate).toBe(true);
  await expect(postValidation(text,{...a,token:'a'.repeat(64)})).rejects.toThrow('authorization');
  const invalid=await fetch(ENDPOINT,{method:'POST',headers:{Origin:'https://untrusted.example',Authorization:'Bearer '+a.token,'Content-Type':'application/json'},body:text});expect(invalid.status).toBe(403);
  now=15*60_000;await expect(postValidation(text,a)).rejects.toThrow('session_or_schema');
});
it('survives a lost HTTP response through exact retry without inventing a durable receipt',async()=>{
  const a=access(),session=new DryRunSession(a.sessionId);let first=true;const received=[];
  const server=http.createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{received.push(body);const value=session.accept(body);if(first){first=false;res.destroy();}else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}});});await serve(server);
  const text=message(a);await expect(postValidation(text,a)).rejects.toThrow();expect((await postValidation(text,a)).duplicate).toBe(true);expect(received).toEqual([text,text]);
});
it('rejects misleading durable/delivered responses and redirects without contacting another host',async()=>{
  const a=access();let mode='durable';const text=message(a);const server=http.createServer((req,res)=>{req.resume();if(mode==='redirect'){res.writeHead(302,{Location:'http://untrusted.example/'});res.end();}else res.end(JSON.stringify({...result(text),durable:true}));});await serve(server);
  await expect(postValidation(text,a)).rejects.toThrow('invalid_validation_response');mode='redirect';await expect(postValidation(text,a)).rejects.toThrow('request_refused');
});
it('rejects old receiver sessions after host restart rather than retargeting captured observations',async()=>{
  const a=access(),other={...access(),token:'c'.repeat(64)};const {server}=createDryRunServer(other);await serve(server);await expect(postValidation(message(a),a)).rejects.toThrow('authorization');
  const f=fixture();f.bridge.feed(Buffer.from(message(other)+'\n'));expect(f.sent).toHaveLength(0);
});

function fakeWorker(){const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.writes=[];
  child.stdin=new Writable({write(chunk,encoding,done){child.writes.push(chunk.toString());done();}});child.kill=()=>{queueMicrotask(()=>child.emit('close',2));return true;};return child;}
const pnp='USB\\VID_2341&PID_1002&MI_01\\TEST-ONLY';
it('requires explicit port and exact PnP confirmation with no shell arguments or raw command passthrough',()=>{
  expect(()=>validateSelection('COM7',pnp)).not.toThrow();for(const pair of [['COM7;calc',pnp],['COM0',pnp],['COM7',''],['COM7','USB\\$(calc)']])expect(()=>validateSelection(...pair)).toThrow();
  for(const line of ['STATUS\nRETRY','WIFI_RETRY','Invoke-Expression test','CLEAR UID123'])expect(safeDeviceCommand(line)).toBe(false);
});
it('handles fake exclusive-port denial and permission errors without trying another port',async()=>{
  const child=fakeWorker(),args=[],events=[];const serial=new WindowsSerial({port:'COM7',pnpId:pnp,spawnWorker:a=>{args.push(a);return child;}});serial.on('failure',c=>events.push(c));
  child.stdout.write('{"type":"error","code":"serial_busy_denied_or_unavailable"}\n');child.emit('close',2);
  expect(events).toEqual(['serial_busy_denied_or_unavailable']);expect(args).toHaveLength(1);await expect(serial.write('STATUS')).rejects.toThrow();
});
it('transports fake bytes, cleans up disconnect and demands fresh explicit selection after renumbering',async()=>{
  const child=fakeWorker(),bytes=[],events=[];const serial=new WindowsSerial({port:'COM7',pnpId:pnp,spawnWorker:()=>child});serial.on('bytes',v=>bytes.push(v));serial.on('failure',v=>events.push(v));
  child.stdout.write('{"type":"opened","port":"COM7","baud":115200}\n');await serial.write('STATUS');
  child.stdout.write(JSON.stringify({type:'bytes',data:Buffer.from('DIAG test\n').toString('base64')})+'\n');expect(bytes[0].toString()).toBe('DIAG test\n');
  child.stdout.write('{"type":"error","code":"serial_disconnected"}\n');child.emit('close',2);expect(events).toEqual(['serial_disconnected']);
  expect(child.writes).toEqual(['{"type":"command","line":"STATUS"}\n']);await expect(serial.write('RETRY')).rejects.toThrow();
});
it('does not leak worker stderr, unknown error payloads, malformed frames or oversized worker output',()=>{
  for(const frame of ['not json\n','{"type":"error","code":"PRIVATE_SENTINEL"}\n','x'.repeat(16386)]){
    const child=fakeWorker(),events=[];const serial=new WindowsSerial({port:'COM7',pnpId:pnp,spawnWorker:()=>child});serial.on('failure',v=>events.push(v));child.stderr.write('PRIVATE_SENTINEL');child.stdout.write(frame);
    expect(events).toEqual(['serial_worker_output_refused']);expect(JSON.stringify(events)).not.toContain('PRIVATE_SENTINEL');
  }
});
it('closes port ownership once when readline, Ctrl+C and worker close overlap',async()=>{
  const child=fakeWorker();const serial=new WindowsSerial({port:'COM7',pnpId:pnp,spawnWorker:()=>child});serial.on('failure',()=>{});
  child.stdout.write('{"type":"opened","port":"COM7","baud":115200}\n');serial.close();serial.close();
  expect(child.writes).toEqual(['{"type":"close"}\n']);await expect(serial.write('STATUS')).rejects.toThrow();child.emit('close',0);
});
it.runIf(process.platform==='win32')('executes the actual CLR input task without blocking the Windows serial polling thread',async()=>{
  const script=fileURLToPath(new URL('./test/serial-input-probe.ps1',import.meta.url));
  const env=Object.fromEntries(['PATH','Path','PATHEXT','SystemRoot','WINDIR','ComSpec','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const child=spawn(path.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',script],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  cleanup.push(()=>child.kill());let output='';child.stderr.on('data',()=>{});
  child.stdout.on('data',d=>{output+=d;if(output.includes('WAITING_WITHOUT_BLOCKING')&&!child.stdin.writableEnded)child.stdin.end('STATUS\n');});
  const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Native input task timed out'));},10000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve(code);});});
  expect(code).toBe(0);expect(output).toContain('PASS_NATIVE_INPUT_TASK');
},15000);
