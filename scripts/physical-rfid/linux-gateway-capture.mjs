import {PhysicalSerialLines} from './serial-lines.mjs';
import {runReadOnlyCapture} from './capture-readonly.mjs';
import {ReadOnlyLinuxTransport,validateLinuxOptions} from './readonly-linux.mjs';

/** Bridge only after reviewed mapping. No auto-enrollment, firmware commands or
 * destination writes. The caller owns store/capture lifecycle and syncs later.
 */
export async function runLinuxGatewayCapture(options,capture,{createTransport,report=()=>{},signal,processSignals=process,maxNewEvents=null}={}){
  validateLinuxOptions(options);
  if(maxNewEvents!==null&&maxNewEvents!==1)throw Error('only_one_event_budget_supported');
  const stop=new AbortController();let failure=null,count=0,newCount=0,ending=false,budgetStop=false;
  const source=createTransport?'mock_serial_gateway':'linux_serial_gateway';
  const interrupted=()=>stop.abort(signal?.reason??'cancelled');signal?.addEventListener('abort',interrupted,{once:true});
  if(signal?.aborted)stop.abort();
  const lines=new PhysicalSerialLines(line=>{
    if(ending||failure||stop.signal.aborted)return;
    try{
      if(line.code)throw Error('invalid_serial_frame');
      const receipt=capture.capture(line.text);
      if(receipt.durable)count++;
      if(receipt.durable&&receipt.duplicate===false)newCount++;
      report({...receipt,source,backendWritten:false});
      if(maxNewEvents===1&&newCount>=1){budgetStop=true;stop.abort('capture_budget_reached');}
    }catch{failure='capture_held_or_failed';stop.abort(failure);}
  });
  let transport,opened=false;
  const onOpened=()=>{opened=true;};
  const onClosed=()=>{opened=false;};
  const bytes=value=>{
    if(ending||failure||stop.signal.aborted||transport.closing)return;
    if(!opened){failure='bytes_before_open_confirmation';stop.abort();return;}
    lines.push(value);
  };
  try{
    const result=await runReadOnlyCapture(options,{
      createTransport:()=>{
        transport=createTransport?createTransport(options):new ReadOnlyLinuxTransport(options);
        transport.on('opened',onOpened);transport.on('closed',onClosed);transport.on('exit',onClosed);transport.on('failure',onClosed);transport.on('bytes',bytes);return transport;
      },
      report:r=>report({...r,source,durableObservationReports:count,studentsAssociated:count>0,reviewedEnrollmentUsed:true}),signal:stop.signal,processSignals,
    });
    const budgetClosed=budgetStop&&result.reason==='capture_budget_reached'&&result.closureEvidence==='worker_closed_and_exited';
    return {...result,reason:budgetClosed?'capture_budget_reached':result.reason,source,durableObservationReports:count,newDurableEvents:newCount,captureBudgetReached:budgetStop,studentsAssociated:count>0,reviewedEnrollmentUsed:true,captureFailure:failure,exitCode:failure||(maxNewEvents===1&&newCount!==1)?1:budgetClosed?0:result.exitCode};
  }finally{
    ending=true;transport?.removeListener('bytes',bytes);transport?.removeListener('opened',onOpened);transport?.removeListener('closed',onClosed);transport?.removeListener('exit',onClosed);transport?.removeListener('failure',onClosed);
    lines.reset();signal?.removeEventListener('abort',interrupted);
  }
}
