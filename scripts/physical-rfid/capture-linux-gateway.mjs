// Deliberately separate from capture-linux.mjs, which remains DB-free.
import {constants,openSync,readFileSync,closeSync,fstatSync} from 'node:fs';
import path from 'node:path';import {pathToFileURL} from 'node:url';
import {parseLinuxArgs} from './capture-linux.mjs';
import {runLinuxGatewayCapture} from './linux-gateway-capture.mjs';
import {LegacyGatewayCapture,prepareReviewedLocalReader} from './legacy-gateway.mjs';
import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';

export function readReviewedConfig(file,school,session){
  if(process.platform!=='linux'||!path.isAbsolute(file)||!file.includes('/.local/'))throw Error('private_linux_configuration_required');
  const fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const st=fstatSync(fd);
    if(!st.isFile()||st.size>16384||st.uid!==process.getuid()||(st.mode&0o077)!==0)throw Error('private_configuration_permissions_required');
    const c=JSON.parse(readFileSync(fd,'utf8'));
    if(Object.keys(c).sort().join(',')!=='binding,enrollment,serial,version'||c.version!==1||c.binding?.schoolId!==school||c.binding?.sessionId!==session
      ||c.binding?.sourceIdentity!==c.serial?.usbId||c.enrollment?.devicePrivateKey||c.enrollment?.studentId)throw Error('reviewed_scope_mismatch');
    return c;
  }finally{closeSync(fd);}
}
export async function main(args){
  // No dotenv or production credential discovery. No privileged backend key is
  // needed by capture. Approved config contains only the enrolled reader binding.
  const v={};for(let i=0;i<args.length;i+=2){if(!['--config','--confirm-school','--confirm-session','--database'].includes(args[i])||args[i] in v||!args[i+1])throw Error('invalid_arguments');v[args[i]]=args[i+1];}
  if(Object.keys(v).length!==4||!path.isAbsolute(v['--database'])||!v['--database'].includes('/.local/schovera-rfid-gateway/'))throw Error('explicit_existing_gateway_required');
  const c=readReviewedConfig(v['--config'],v['--confirm-school'],v['--confirm-session']);
  const options=parseLinuxArgs(['--device',c.serial.port,'--confirm-usb-id',c.serial.usbId,'--seconds',String(c.serial.seconds),'--dtr',c.serial.dtr,'--ack-reset-risk','--confirm-monitor-closed']);
  // Config records operator confirmations explicitly; they cannot be inferred.
  if(c.serial.resetRiskAccepted!==true||c.serial.monitorClosedConfirmed!==true)throw Error('operator_confirmation_required');
  const oldUmask=process.umask(0o077);
  let store,capture;
  try{
    store=openGatewayDatabase(v['--database']);
    prepareReviewedLocalReader(store,c.enrollment,c.binding);
    capture=new LegacyGatewayCapture({store,enrollment:c.enrollment,binding:c.binding});
    return await runLinuxGatewayCapture(options,capture,{report:r=>console.log(JSON.stringify(r))});
  }finally{capture?.close();store?.close();process.umask(oldUmask);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const result=await main(process.argv.slice(2));console.log(JSON.stringify(result));process.exitCode=result.exitCode;}
  catch{console.error('Physical gateway capture refused; review local configuration, scope, permissions and retained queue. No raw details logged.');process.exitCode=1;}
}
