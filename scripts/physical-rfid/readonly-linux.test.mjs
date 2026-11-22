import {it,expect,vi,afterEach} from 'vitest';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ReadOnlyLinuxTransport,validateLinuxOptions} from './readonly-linux.mjs';
import {parseLinuxArgs} from './capture-linux.mjs';
import {runReadOnlyCapture} from './capture-readonly.mjs';
const opts={platform:'linux',port:'/dev/serial/by-id/usb-TEST_ONLY',usbId:'1a86:7523:TEST_ONLY',seconds:30,dtr:'off',resetRiskAccepted:true,monitorClosedConfirmed:true};
afterEach(()=>vi.useRealTimers());
function mock(){
  const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();const control=[];
  c.stdin=new Writable({write(v,_,done){control.push(String(v));done();}});
  c.kill=vi.fn(()=>{queueMicrotask(()=>c.emit('close',1));});c.unref=vi.fn();
  const spawn=vi.fn(()=>c);const t=new ReadOnlyLinuxTransport(opts,{spawnWorker:spawn});const errors=[];t.on('failure',e=>errors.push(e));
  return {t,c,spawn,control,errors,emit:v=>c.stdout.write(JSON.stringify(v)+'\n')};
}
const opened={type:'opened',port:opts.port,baud:115200,dtr:'off',rts:'off',handshake:'none'};
it('requires exact by-id path, USB identity and all safety confirmations',()=>{
  expect(validateLinuxOptions(opts)).toEqual(opts);
  for(const patch of [{port:'/dev/ttyUSB0'},{port:'/dev/serial/by-id/../../ttyUSB0'},{usbId:'guess'},{seconds:31},{dtr:'auto'},{resetRiskAccepted:false},{monitorClosedConfirmed:false}])expect(()=>validateLinuxOptions({...opts,...patch})).toThrow();
  expect(parseLinuxArgs(['--device',opts.port,'--confirm-usb-id',opts.usbId,'--seconds','30','--dtr','off','--ack-reset-risk','--confirm-monitor-closed'])).toEqual(opts);
  expect(()=>parseLinuxArgs(['--device',opts.port,'--device',opts.port])).toThrow();
});
it('passes fixed argv to a mocked worker and cannot write serial payloads',async()=>{
  const f=mock();f.t.start();expect(f.spawn).toHaveBeenCalledWith([opts.port,opts.usbId,'30','off','ack-reset-risk','monitor-closed']);
  expect(f.t.write).toBeUndefined();f.emit(opened);const pending=f.t.close();f.emit({type:'closed',reason:'stop_requested'});f.c.emit('close',0);
  expect(await pending).toEqual({exited:true,workerConfirmed:true});expect(f.control).toEqual(['CLOSE\n']);
});
it('bounds and validates IPC without forwarding stderr or raw failures',async()=>{
  for(const v of [{...opened,port:'/dev/ttyUSB1'},{type:'bytes',data:'A'.repeat(400)},{type:'error',code:'PRIVATE_CARD_SENTINEL'}]){
    const f=mock();f.t.start();f.c.stderr.write('PRIVATE_CARD_SENTINEL');f.emit(v);await f.t.close();expect(f.errors).toEqual(['worker_protocol_refused']);
  }
});
it('handles fragmented observations, timeout and closure through the shared bounded controller',async()=>{
  vi.useFakeTimers();const t=new EventEmitter();const reports=[];
  t.start=()=>{};t.close=async()=>({exited:true,workerConfirmed:true});t.forceKill=()=>{};
  const pending=runReadOnlyCapture(opts,{createTransport:()=>t,report:r=>reports.push(r),processSignals:new EventEmitter()});
  t.emit('opened');const line=Buffer.from('SCHOVERA_SCAN,FA:CE:B0:0C,100\n');
  t.emit('bytes',line.subarray(0,12));t.emit('bytes',line.subarray(12));
  await vi.advanceTimersByTimeAsync(30000);const r=await pending;expect(r).toMatchObject({validScanFrames:1,serialPayloadWrites:0,backendWritten:false,reason:'deadline'});expect(JSON.stringify(reports)).not.toContain('FA:CE:B0:0C');
});
it('reports disconnect and identity errors without selecting another port',async()=>{
  for(const code of ['serial_disconnected','identity_mismatch']){
    const f=mock();const pending=runReadOnlyCapture(opts,{createTransport:()=>f.t,report:()=>{},processSignals:new EventEmitter()});f.emit(opened);f.emit({type:'error',code});expect(await pending).toMatchObject({reason:code,exitCode:1});expect(f.spawn).toHaveBeenCalledTimes(1);
  }
});
it('compiles Python and tests its pure validation only; never executes main or any port access',()=>{
  const file=fileURLToPath(new URL('./linux-readonly.py',import.meta.url));
  const result=spawnSync(process.platform==='win32'?'python':'/usr/bin/python3',['-I','-B','-c',`import ast,sys\ns=open(sys.argv[1],encoding='utf-8').read(); tree=ast.parse(s); assert not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in ('write','writev') and isinstance(n.func.value,ast.Name) and n.func.value.id=='os' for n in ast.walk(tree)); ns={'__name__':'mock_only'};exec(compile(s,sys.argv[1],'exec'),ns);v=ns['validate_selection'];v('/dev/serial/by-id/usb-TEST','1a86:7523:TEST',30,'off'); refused=0\nfor a in [('/dev/ttyUSB0','1a86:7523:TEST',30,'off'),('/dev/serial/by-id/usb-TEST','bad',30,'off'),('/dev/serial/by-id/usb-TEST','1a86:7523:TEST',31,'off')]:\n try:v(*a)\n except ValueError:refused+=1\nassert refused==3;print('PURE_HELPERS_ONLY')`,file],{encoding:'utf8',windowsHide:true,timeout:10000});
  expect(result.status).toBe(0);expect(result.stdout).toContain('PURE_HELPERS_ONLY');
  expect(readFileSync(file,'utf8')).not.toMatch(/import (?:requests|sqlite3|serial)\b/);
});
