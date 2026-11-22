import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { StringDecoder } from 'node:string_decoder';

export function validateLinuxOptions(v) {
  if (!v || Object.keys(v).sort().join(',') !== ['platform','port','usbId','seconds','dtr','resetRiskAccepted','monitorClosedConfirmed'].sort().join(',')
    || v.platform !== 'linux' || !/^\/dev\/serial\/by-id\/[A-Za-z0-9_.:+-]{1,200}$/.test(v.port ?? '')
    || !/^[0-9a-f]{4}:[0-9a-f]{4}:[A-Za-z0-9_.+-]{1,128}$/.test(v.usbId ?? '')
    || !Number.isInteger(v.seconds) || v.seconds < 1 || v.seconds > 30 || !['on','off'].includes(v.dtr)
    || v.resetRiskAccepted !== true || v.monitorClosedConfirmed !== true) throw Error('explicit_linux_selection_required');
  return Object.freeze({...v});
}
function launch(args) {
  if (process.platform !== 'linux') throw Error('linux_capture_only');
  return spawn('/usr/bin/python3', ['-I','-B',fileURLToPath(new URL('./linux-readonly.py', import.meta.url)), ...args],
    {shell:false, env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe']});
}

/** No serial command or payload write API. CLOSE is private process control only. */
export class ReadOnlyLinuxTransport extends EventEmitter {
  constructor(options, {spawnWorker = launch} = {}) {
    super(); this.options = validateLinuxOptions(options); this.spawnWorker = spawnWorker;
    this.started = false; this.closing = false; this.exited = false; this.opened = false; this.workerConfirmed = false;
    this.exitPromise = new Promise(resolve => {this.resolveExit = resolve;});
  }
  start() {
    if (this.started || this.closing) throw Error('transport_already_started');
    this.started = true; const o = this.options;
    try {this.child = this.spawnWorker([o.port,o.usbId,String(o.seconds),o.dtr,'ack-reset-risk','monitor-closed']);}
    catch {this.exited = true;this.resolveExit({exited:true,workerConfirmed:false});this.emit('failure','worker_start_failed');return;}
    let buffer = ''; const decoder = new StringDecoder('utf8');
    this.child.stdout.on('data', bytes => {
      for (const char of decoder.write(bytes)) {
        if (char === '\n') {const line=buffer;buffer='';if(line)this.record(line);}
        else if (buffer.length >= 4096) {buffer='';this.refuse();return;}
        else buffer += char;
      }
    });
    this.child.stderr.on('data',()=>{});
    this.child.on('error',()=>this.refuse('worker_start_failed'));
    this.child.stdin.on('error',()=>{if(!this.closing)this.refuse('worker_control_failed');});
    this.child.on('close',code=>{this.exited=true;this.resolveExit({exited:true,workerConfirmed:this.workerConfirmed});this.emit('exit',{code});});
  }
  record(line) {
    try {
      const v=JSON.parse(line), keys=Object.keys(v).sort().join(',');
      if (v.type==='opened' && keys==='baud,dtr,handshake,port,rts,type' && !this.opened && !this.closing
        && v.port===this.options.port && v.baud===115200 && v.dtr===this.options.dtr && v.rts==='off' && v.handshake==='none') {
        this.opened=true;this.emit('opened');return;
      }
      if (v.type==='bytes' && keys==='data,type' && this.opened && !this.closing && typeof v.data==='string'
        && v.data.length<=344 && /^[A-Za-z0-9+/]+={0,2}$/.test(v.data)) {
        const bytes=Buffer.from(v.data,'base64');if(!bytes.length||bytes.length>256||bytes.toString('base64')!==v.data)throw Error();
        this.emit('bytes',bytes);return;
      }
      if (v.type==='error' && keys==='code,type' && ['identity_mismatch','preflight_refused','serial_disconnected','port_busy_denied_or_unavailable'].includes(v.code)) {
        this.emit('failure',v.code);return;
      }
      if (v.type==='closed' && keys==='reason,type' && ['failure','deadline','disconnect','stdin_closed','stop_requested'].includes(v.reason)) {
        this.workerConfirmed=true;this.emit('closed',v.reason);return;
      }
      if(this.closing && v.type==='bytes')return;
      throw Error();
    } catch {this.refuse();}
  }
  refuse(code='worker_protocol_refused') {if(!this.exited){this.emit('failure',code);this.forceKill();}}
  forceKill() {this.closing=true;if(this.child&&!this.exited){try{this.child.kill();}catch{/* Report exit evidence separately. */}}}
  close() {
    if(this.closePromise)return this.closePromise;
    this.closing=true;if(!this.child||this.exited)return Promise.resolve({exited:true,workerConfirmed:this.workerConfirmed});
    try{this.child.stdin.end('CLOSE\n');}catch{this.forceKill();}
    this.closePromise=(async()=>{
      let kill,limit;
      try{return await Promise.race([this.exitPromise,new Promise(resolve=>{
        kill=setTimeout(()=>this.forceKill(),200);limit=setTimeout(()=>resolve({exited:false}),450);
      })]);}finally{clearTimeout(kill);clearTimeout(limit);if(!this.exited){this.forceKill();this.child.stdin.destroy();this.child.stdout.destroy();this.child.stderr.destroy();this.child.unref?.();}}
    })();return this.closePromise;
  }
}
