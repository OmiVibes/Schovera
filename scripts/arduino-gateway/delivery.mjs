import {UsbCaptureRefusal} from './capture.mjs';

// Independent proof beyond an HTTP success or a mutable UI counter.
export function verifyDestinationEvidence(context,row,receipt,gate) {
  const fail=()=>{throw new UsbCaptureRefusal('destination_receipt_database_mismatch');};
  if(!row||!receipt||receipt.id!==row.remote_receipt_id||receipt.device_id!==context.enrollment.deviceId
    ||receipt.device_event_id!==row.event_id||receipt.payload_hash!==row.payload_hash
    ||receipt.credential_assignment_id!==context.enrollment.assignmentId
    ||receipt.capability_key_id!==context.scope.keyId||receipt.outcome!==row.remote_outcome
    ||receipt.sequence_state!==row.remote_sequence_state
    ||!Number.isFinite(Date.parse(receipt.received_at))||Date.parse(receipt.received_at)!==Date.parse(row.remote_received_at))fail();
  if(receipt.outcome==='accepted'){
    if(row.queue_state!=='delivered'||!gate||gate.id!==receipt.event_id||gate.school_id!==context.scope.schoolId
      ||gate.student_id!==context.scope.studentId||gate.device_id!==context.enrollment.deviceId
      ||gate.device_event_id!==row.event_id||gate.event_type!==row.event_type||Number(gate.device_sequence)!==Number(row.device_sequence)
      ||Date.parse(gate.observed_at)!==Date.parse(row.observed_at))fail();
    return {event_id:row.event_id,queue_state:row.queue_state,receipt_id:receipt.id,outcome:receipt.outcome,
      databaseVerified:true,destinationDelivered:true,destination:'loopback_local_server',classroomConfirmation:'Teacher action required'};
  }
  if(receipt.outcome!=='unresolved'||row.queue_state!=='attention'||receipt.event_id!==null||gate!==null)fail();
  return {event_id:row.event_id,queue_state:row.queue_state,receipt_id:receipt.id,outcome:receipt.outcome,
    databaseVerified:true,destinationDelivered:false,destination:'loopback_local_server',classroomConfirmation:'Not inferred from unresolved evidence'};
}

export async function queryDestinationEvidence(admin,context,row) {
  const result=await admin.from('device_event_receipts').select('id,device_id,device_event_id,payload_hash,credential_assignment_id,capability_key_id,outcome,sequence_state,received_at,event_id')
    .eq('id',row.remote_receipt_id).eq('device_id',context.enrollment.deviceId).eq('device_event_id',row.event_id).maybeSingle();
  if(result.error||!result.data)throw new UsbCaptureRefusal('destination_database_verification_unavailable');
  let gate=null;
  if(result.data.event_id){const response=await admin.from('school_entry_events').select('id,school_id,student_id,device_id,device_event_id,event_type,device_sequence,observed_at')
    .eq('id',result.data.event_id).eq('school_id',context.scope.schoolId).maybeSingle();if(response.error)throw new UsbCaptureRefusal('destination_database_verification_unavailable');gate=response.data;}
  return verifyDestinationEvidence(context,row,result.data,gate);
}
