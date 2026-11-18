import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StringDecoder} from 'node:string_decoder';

const worker=fileURLToPath(new URL('./windows-serial.ps1',import.meta.url));
const errors=new Set(['selection_refused','operator_command_refused','serial_disconnected','serial_worker_failed','serial_busy_denied_or_unavailable']);
export function validateSelection(port,pnpId) {
  if(typeof port!=='string'||!/^COM[1-9][0-9]{0,4}$/.test(port)||typeof pnpId!=='string'
    ||pnpId.length>256||! /^(USB|FTDIBUS)\\[A-Za-z0-9_&+\\.-]+$/.test(pnpId))throw Error('explicit_port_and_exact_pnp_confirmation_required');
}
export function safeDeviceCommand(line) {
  const uuid='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
  return typeof line==='string'&&line.length<=256&&(line==='STATUS'||line==='RETRY'
    ||new RegExp('^CLEAR '+uuid+'$').test(line)
    ||new RegExp('^ARM '+uuid+' '+uuid+' [1-9][0-9]{0,9} 20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$').test(line));
}
function launch(args) {
  if(process.platform!=='win32')throw Error('windows_serial_only');
  const names=['PATH','Path','PATHEXT','SystemRoot','WINDIR','ComSpec','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE'];
  const env=Object.fromEntries(names.filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const executable=path.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  return spawn(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',worker,...args],
    {env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
}
export class WindowsSerial extends EventEmitter {
  constructor({port,pnpId,list=false,spawnWorker=launch}={}) {
    super();if(!list)validateSelection(port,pnpId);
    this.child=spawnWorker(list?['-Action','List']:['-Action','Open','-Port',port,'-ConfirmPnpId',pnpId]);
    this.closed=false;this.opened=false;let buffer='';const decoder=new StringDecoder('utf8');
    this.child.stdout.on('data',chunk=>{
      for(const character of decoder.write(chunk)){
        if(character==='\n'){const line=buffer.trim();buffer='';if(line)this.record(line,list,port);}
        else if(buffer.length>=16384){this.fail('serial_worker_output_refused');return;}
        else buffer+=character;
      }
    });
    // PowerShell diagnostics can contain paths/text. Do not relay raw stderr.
    this.child.stderr.on('data',()=>{});
    this.child.on('error',()=>this.fail('serial_worker_unavailable'));
    this.child.on('close',code=>{clearTimeout(this.startup);this.closed=true;this.emit('closed',code);});
    this.child.stdin.on('error',()=>this.fail('serial_write_failed'));
    this.startup=setTimeout(()=>this.fail('serial_startup_timeout'),10000);
  }
  fail(code) {if(this.closed)return;this.closed=true;clearTimeout(this.startup);this.emit('failure',code);this.child.kill();}
  record(text,list,port) {
    try {
      const value=JSON.parse(text);
      if(value.type==='error'&&errors.has(value.code)){this.emit('failure',value.code);return;}
      if(list&&value.type==='ports'&&Array.isArray(value.ports)&&value.ports.length<=256){
        for(const p of value.ports){if(!/^COM[1-9][0-9]{0,4}$/.test(p.port))throw Error();for(const k of ['pnpId','name','manufacturer'])if(p[k]!==null&&(typeof p[k]!=='string'||p[k].length>256||/[\x00-\x1f\x7f]/.test(p[k])))throw Error();}
        clearTimeout(this.startup);this.emit('ports',value.ports);return;
      }
      if(!list&&value.type==='opened'&&value.port===port&&value.baud===115200){this.opened=true;clearTimeout(this.startup);this.emit('opened');return;}
      if(!list&&this.opened&&value.type==='bytes'&&typeof value.data==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)){
        const bytes=Buffer.from(value.data,'base64');if(bytes.length>256||bytes.toString('base64')!==value.data)throw Error();this.emit('bytes',bytes);return;
      }
      throw Error();
    } catch {this.fail('serial_worker_output_refused');}
  }
  write(line) {
    if(this.closed||this.closing||!this.opened||!safeDeviceCommand(line))return Promise.reject(Error('serial_command_refused_or_closed'));
    return new Promise((resolve,reject)=>this.child.stdin.write(JSON.stringify({type:'command',line})+'\n',error=>error?reject(Error('serial_write_failed')):resolve()));
  }
  close() {if(!this.closed&&!this.closing){this.closing=true;this.child.stdin.end('{"type":"close"}\n');const timer=setTimeout(()=>this.child.kill(),2000);timer.unref();}}
}
export function listSerialPorts() {
  return new Promise((resolve,reject)=>{const transport=new WindowsSerial({list:true});let received=false;
    transport.once('ports',ports=>{received=true;resolve(ports);});
    transport.once('failure',code=>reject(Error(code)));
    transport.once('closed',()=>{if(!received)reject(Error('serial_discovery_failed'));});
  });
}
