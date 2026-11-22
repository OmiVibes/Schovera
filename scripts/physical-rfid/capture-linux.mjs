import {pathToFileURL} from 'node:url';
import {validateLinuxOptions} from './readonly-linux.mjs';
import {runReadOnlyCapture} from './capture-readonly.mjs';

export function parseLinuxArgs(args) {
  const flags=new Set(['--ack-reset-risk','--confirm-monitor-closed']);
  const params=new Set(['--device','--confirm-usb-id','--seconds','--dtr']);const v={};
  for(let i=0;i<args.length;i++){
    const key=args[i];if(key in v||(!flags.has(key)&&!params.has(key)))throw Error('invalid_arguments');
    if(flags.has(key))v[key]=true;else{if(i+1>=args.length)throw Error('invalid_arguments');v[key]=args[++i];}
  }
  if(!/^(?:[1-9]|[12][0-9]|30)$/.test(v['--seconds']??''))throw Error('invalid_duration');
  return validateLinuxOptions({platform:'linux',port:v['--device'],usbId:v['--confirm-usb-id'],seconds:Number(v['--seconds']),
    dtr:v['--dtr'],resetRiskAccepted:v['--ack-reset-risk'],monitorClosedConfirmed:v['--confirm-monitor-closed']});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const result=await runReadOnlyCapture(parseLinuxArgs(process.argv.slice(2)));process.exitCode=result.exitCode;}
  catch{console.error('Linux read-only capture requires explicit --device /dev/serial/by-id/... --confirm-usb-id vendor:product:serial --seconds 1..30 --dtr on|off --ack-reset-risk --confirm-monitor-closed');process.exitCode=2;}
}
