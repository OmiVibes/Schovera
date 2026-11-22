// Explicit future live-test entry point. Never runs on import or loads dotenv.
import {constants,openSync,closeSync,fstatSync,readFileSync,lstatSync} from 'node:fs';
import {createPrivateKey,createPublicKey,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readReviewedConfig} from './capture-linux-gateway.mjs';
import {parseLinuxArgs} from './capture-linux.mjs';
import {checkApproval,captureOne,deliverOne} from './bounded-gateway.mjs';
import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';
import {LocalSupabaseV2Transport} from '../rfid-gateway/local-v2-transport.mjs';

export function readPrivate(file){
  if(process.platform!=='linux'||!path.isAbsolute(file)||!file.includes('/.local/'))throw Error('private_linux_file_required');
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const st=fstatSync(fd);if(!st.isFile()||st.uid!==process.getuid()||(st.mode&0o077)||st.size>16384)throw Error('private_file_refused');return readFileSync(fd,'utf8');}
  finally{closeSync(fd);}
}
export function parseArgs(args){
  const [mode,...rest]=args;
  const required=['--config','--approval','--database','--confirm-school','--confirm-session','--confirm-device'];
  if(mode==='deliver')required.push('--device-key-file','--target','--receipt-mode');
  if(!['capture','deliver'].includes(mode)||rest.length!==required.length*2)throw Error('explicit_live_scope_required');
  const v={};for(let i=0;i<rest.length;i+=2){if(!required.includes(rest[i])||rest[i] in v||!rest[i+1])throw Error('explicit_live_scope_required');v[rest[i]]=rest[i+1];}
  return {mode,v};
}
export async function main(args){
  const {mode,v}=parseArgs(args);
  const c=readReviewedConfig(v['--config'],v['--confirm-school'],v['--confirm-session']);
  const a=JSON.parse(readPrivate(v['--approval']));checkApproval(a,c);
  if(a.deviceId!==v['--confirm-device'])throw Error('explicit_device_mismatch');
  const options=parseLinuxArgs(['--device',c.serial.port,'--confirm-usb-id',c.serial.usbId,'--seconds',String(c.serial.seconds),'--dtr',c.serial.dtr,'--ack-reset-risk','--confirm-monitor-closed']);
  if(c.serial.resetRiskAccepted!==true||c.serial.monitorClosedConfirmed!==true||c.binding.eventType!=='check_in')throw Error('operator_confirmation_required');
  let transport,loseFirstReceipt=false;
  if(mode==='deliver'){
    if(v['--target']!=='http://127.0.0.1:33106'||!['normal','lose-first-local-receipt'].includes(v['--receipt-mode']))throw Error('delivery_mode_refused');
    const key=createPrivateKey(readPrivate(v['--device-key-file']));
    const pem=createPublicKey(key).export({type:'spki',format:'pem'}).toString();
    if(key.asymmetricKeyType!=='ed25519'||createHash('sha256').update(pem).digest('hex')!==a.devicePublicKeySha256)throw Error('device_key_mismatch');
    transport=new LocalSupabaseV2Transport({target:v['--target'],devicePrivateKey:key});
    loseFirstReceipt=v['--receipt-mode']==='lose-first-local-receipt';
  }
  const file=v['--database'];
  if(!path.isAbsolute(file)||!file.includes('/.local/schovera-rfid-gateway/'))throw Error('existing_gateway_required');
  const st=lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('gateway_permissions_refused');
  const probe=new DatabaseSync(file,{readOnly:true});
  try{if(Number(probe.prepare('PRAGMA user_version').get().user_version)!==2)throw Error('review_existing_gateway_schema');}finally{probe.close();}
  const old=process.umask(0o077);let store;
  try{
    store=openGatewayDatabase(file,{recoverOnOpen:false});
    if(mode==='capture'){
      const result=await captureOne(store,c,a,options,{report:r=>console.log(JSON.stringify(r))});
      console.log(JSON.stringify(result));return result.exitCode;
    }
    const results=await deliverOne(store,transport,c,a,{loseFirstReceipt});
    console.log(JSON.stringify({code:'approved_event_delivery_result',deviceId:a.deviceId,eventId:a.eventId,results}));
    // Fault-injection deliberately leaves work pending and returns nonzero.
    return results.some(r=>r.state!=='delivered_to_local_server')?1:0;
  }finally{store?.close();process.umask(old);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{process.exitCode=await main(process.argv.slice(2));}
  catch{console.error('Bounded physical test refused; review approved scope and retained state. No raw details logged.');process.exitCode=1;}
}
