import readline from 'node:readline';
import {createPrivateKey} from 'node:crypto';
import {assertUsbQa,prepareUsbFixture,loadUsbFixture,freshAuthority,cleanUsbFixture,adminClient} from './context.mjs';
import {TrustedUsbCapture,UsbCaptureRefusal,syntheticLine} from './capture.mjs';
import {DurableUsbBridge} from './bridge.mjs';
import {queryDestinationEvidence} from './delivery.mjs';
import {WindowsSerial,listSerialPorts} from '../arduino-local/windows-serial.mjs';
import {openGatewayDatabase} from '../rfid-gateway/storage.mjs';
import {LocalSupabaseV2Transport,syncPendingV2Events} from '../rfid-gateway/local-v2-transport.mjs';
import {RetryableTransportError,AttentionTransportError} from '../rfid-gateway/transport.mjs';

const report=value=>console.log(JSON.stringify(value));
async function main() {
  assertUsbQa();const [command,...args]=process.argv.slice(2);
  if(command==='prepare'&&!args.length){report(await prepareUsbFixture({onCreated:runId=>report({event:'owned_fixture_preparation_started',runId})}));return;}
  if(command==='list'&&!args.length){report({ports:await listSerialPorts(),hardwareIdentityAuthenticated:false});return;}
  if(args[0]!=='--confirm-run')throw new UsbCaptureRefusal('explicit_owned_run_confirmation_required');
  const runId=args[1];
  if(command==='clean'){
    if(args.length!==2&&!(args.length===3&&args[2]==='--discard-pending'))throw new UsbCaptureRefusal('unsupported_command_arguments');
    report(await cleanUsbFixture(runId,{discardPending:args[2]==='--discard-pending'}));return;
  }
  if(!['connect','simulate','repeat','sync','inspect'].includes(command))throw new UsbCaptureRefusal('unsupported_command');
  if(command==='connect'){
    if(args.length!==6||args[2]!=='--port'||args[4]!=='--confirm-pnp-id')throw new UsbCaptureRefusal('explicit_port_confirmation_required');
  }else if(command==='repeat'){
    if(args.length!==4||args[2]!=='--event-id')throw new UsbCaptureRefusal('explicit_event_id_required');
  }else if(command==='sync'){
    if(args.length!==2&&!(args.length===3&&['--simulate-outage','--lose-response-once'].includes(args[2])))throw new UsbCaptureRefusal('unsupported_command_arguments');
  }else if(args.length!==2)throw new UsbCaptureRefusal('unsupported_command_arguments');
  const context=loadUsbFixture(runId),store=openGatewayDatabase(context.p.databasePath);
  let capture;
  try {
    if(command==='sync'){
      const real=new LocalSupabaseV2Transport({target:context.enrollment.target,devicePrivateKey:createPrivateKey(context.enrollment.devicePrivateKey)});
      let lost=false;const transport=args[2]==='--simulate-outage'?{async send(){throw new RetryableTransportError('simulated_destination_outage');}}
        :args[2]==='--lose-response-once'?{async send(event){const result=await real.send(event);if(!lost){lost=true;throw new RetryableTransportError('simulated_response_lost_after_commit');}return result;}}:real;
      const results=await syncPendingV2Events(store,transport,{force:true});
      const confirmed=[];for(const item of results){const row=store.getEvent(context.enrollment.deviceId,item.event_id);
        if(row?.remote_receipt_id)confirmed.push(await queryDestinationEvidence(adminClient(),context,row));}
      report({synthetic:true,destination:'loopback_local_server',simulation:!!args[2],results,confirmed,summary:store.summary(),automaticClassroomAttendance:false});return;
    }
    capture=new TrustedUsbCapture({store,scope:context.scope,enrollment:context.enrollment,authorize:freshAuthority(context)});
    if(command==='inspect'){
      report({synthetic:true,runId,sourcePersistence:'Arduino RAM only',queue:store.summary(),localReceipts:store.listEvents({limit:10}).map(r=>capture.receipt(r.event_id)),boundedToFirst:10});return;
    }
    if(command==='simulate'){
      const intent=await capture.issueIntent();report({source:'simulated_serial',...(await capture.receive(intent.text))});return;
    }
    if(command==='repeat'){
      capture.receipt(args[3]);const row=store.getEvent(context.enrollment.deviceId,args[3]);
      const line=syntheticLine(context.scope.sessionId,{acquisitionId:row.event_id,sequence:Number(row.device_sequence),observedAt:row.observed_at,eventType:row.event_type});
      report({source:'simulated_serial_replay',...(await capture.receive(line))});return;
    }
    await capture.authorized();
    const serial=new WindowsSerial({port:args[3],pnpId:args[5]});
    const bridge=new DurableUsbBridge({capture,write:line=>serial.write(line),report,source:'usb_serial'});
    const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
    const commands=[];
    serial.on('opened',()=>{report({event:'serial_opened',port:args[3],baud:115200,hardwareIdentityAuthenticated:false,syntheticBinding:true});
      console.log('Commands: status | arm | retry | retry-capture | release <committed acquisition UUID> | close. Release is explicit; no automatic firmware ACK.');});
    serial.on('bytes',bytes=>bridge.feed(bytes));
    serial.on('failure',code=>{report({event:'serial_error',code});process.exitCode=1;input.close();serial.close();});
    input.on('line',line=>{if(line==='close'){input.close();serial.close();return;}
      if(commands.length){report({event:'operator_command_refused',code:'operator_command_in_progress'});return;}
      const pending=bridge.command(line).catch(error=>report({event:'operator_command_refused',code:error instanceof UsbCaptureRefusal?error.code:'serial_command_failed'}));commands.push(pending);
      pending.finally(()=>{const index=commands.indexOf(pending);if(index>=0)commands.splice(index,1);});});
    input.on('close',()=>serial.close());const interrupt=()=>{input.close();serial.close();};process.on('SIGINT',interrupt);
    await new Promise(resolve=>serial.once('closed',resolve));bridge.disconnected();input.close();process.off('SIGINT',interrupt);
    await Promise.allSettled(commands);await bridge.busy;
  }finally{capture?.close();store.close();}
}
try{await main();}catch(error){report({event:'usb_gateway_stopped',code:error instanceof UsbCaptureRefusal?error.code:
  error instanceof AttentionTransportError&&error.errorClass==='gateway_worker_busy'?'gateway_worker_busy':'local_operation_failed_preserve_evidence',durableNotAssumed:true});process.exitCode=1;}
