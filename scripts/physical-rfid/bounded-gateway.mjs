// Reviewed rehearsal guards. No I/O at import and no alternate queue/transport.
import {createHash,createPublicKey} from 'node:crypto';
import {syncPendingV2Events} from '../rfid-gateway/local-v2-transport.mjs';
import {LegacyGatewayCapture,prepareReviewedLocalReader} from './legacy-gateway.mjs';
import {runLinuxGatewayCapture} from './linux-gateway-capture.mjs';
import {canonicalGatewayEvent} from '../rfid-gateway/event-contract.mjs';
import {verifyAssignmentCapability,capabilityMatchesEvent} from '../rfid-simulator/event-v2.ts';
import {hashReaderKey} from '../rfid-gateway/ingress.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sha=s=>createHash('sha256').update(s).digest('hex');
export function checkApproval(a,c){
  if(!a||a.version!==1||a.hardwareType!=='nano_rc522'||a.fictionalOnly!==true||a.maxNewEvents!==1||a.maxRequests!==2
    ||!uuid.test(a.deviceId??'')||!uuid.test(a.schoolId??'')||!uuid.test(a.sessionId??'')||!uuid.test(a.readerId??'')
    ||!/^[a-f0-9]{64}$/.test(a.devicePublicKeySha256??'')||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=Date.now()
    ||a.deviceId!==c.enrollment.deviceId||a.schoolId!==c.binding.schoolId||a.sessionId!==c.binding.sessionId||a.readerId!==c.enrollment.readerId
    ||c.binding.reviewedEnrollment!==true||c.binding.sourceIdentity!=='0403:6001:BG02XZ38'
    ||c.binding.eventType!=='check_in'
    ||c.serial.usbId!==c.binding.sourceIdentity||c.serial.port!=='/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_BG02XZ38-if00-port0')throw Error('physical_approval_refused');
}
export async function captureOne(store,c,a,options,dependencies={}){
  checkApproval(a,c);
  if(options.port!==c.serial.port||options.usbId!==c.serial.usbId||options.platform!=='linux')throw Error('capture_source_mismatch');
  // A durable prior result exhausts this session's budget across process restarts.
  // Refuse before port opening. Never reset or delete its cursor or queue row.
  const exists=store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='physical_legacy_sessions'").get();
  if(exists&&store.db.prepare('SELECT 1 FROM physical_legacy_sessions WHERE session_id=?').get(c.binding.sessionId))throw Error('session_already_prepared_or_used');
  if(Number(store.db.prepare('SELECT COUNT(*) AS n FROM gateway_events WHERE device_id=?').get(a.deviceId).n)!==0)throw Error('physical_device_not_fresh');
  prepareReviewedLocalReader(store,c.enrollment,c.binding);
  const capture=new LegacyGatewayCapture({store,enrollment:c.enrollment,binding:c.binding,requireUnusedSession:true});
  try{return await runLinuxGatewayCapture(options,capture,{...dependencies,maxNewEvents:1});}
  finally{capture.close();}
}
export async function deliverOne(store,transport,c,a,{loseFirstReceipt=false}={}){
  checkApproval(a,c);
  if(!uuid.test(a.eventId??'')||!/^[a-f0-9]{64}$/.test(a.payloadSha256??'')||typeof loseFirstReceipt!=='boolean')throw Error('event_approval_required');
  let selected;
  const select=()=>{
    checkApproval(a,c);
    const row=store.getEvent(a.deviceId,a.eventId);
    if(!row||!['pending','delivered'].includes(row.queue_state)||row.reader_id!==a.readerId||row.payload_hash!==a.payloadSha256
      ||sha(row.canonical_payload)!==a.payloadSha256)throw Error('approved_event_unavailable');
    const event=JSON.parse(row.canonical_payload);
    if(event.schema_version!==2||event.device_id!==a.deviceId||event.event_id!==a.eventId||event.event_type!=='check_in'
      ||event.credential_assignment_id!==c.enrollment.assignmentId||event.credential_assignment_version!==c.enrollment.assignmentVersion
      ||event.credential_ref!==c.enrollment.credentialRef||event.assignment_capability!==c.enrollment.capability)throw Error('immutable_scope_refused');
    const reader=store.getReader(a.readerId);
    if(!reader?.active||reader.device_id!==a.deviceId||reader.token_sha256!==hashReaderKey(c.enrollment.readerKey))throw Error('reader_unauthorized');
    const verified=verifyAssignmentCapability(c.enrollment.capability,createPublicKey(c.binding.capabilityPublicKey),Math.floor(Date.now()/1000));
    if(!verified.ok||!verified.timeValid||verified.claims.school_id!==a.schoolId||!capabilityMatchesEvent(verified.claims,event))throw Error('capability_refused');
    if(row.queue_state==='delivered')return [];
    if(row.attempt_count>=2)throw Error('request_budget_exhausted');
    if(loseFirstReceipt&&row.attempt_count!==0)throw Error('fault_injection_only_on_first_attempt');
    selected=row;return [row];
  };
  // Use the existing worker/receipt/retry implementation, selecting only the exact
  // approved row. Do not recover or mutate unrelated interrupted work.
  const scoped=new Proxy(store,{get(target,key){
    if(key==='recoverInterrupted')return ()=>{};
    if(key==='duePending')return select;
    const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;
  }});
  let sends=0;
  const guarded={async send(event){
    checkApproval(a,c);
    if(++sends!==1||!selected||sha(canonicalGatewayEvent(event))!==a.payloadSha256||event.device_id!==a.deviceId||event.event_id!==a.eventId)throw Error('send_scope_refused');
    return transport.send(event);
  }};
  return syncPendingV2Events(scoped,guarded,{force:true,limit:1,maxAttempts:2,
    ...(loseFirstReceipt?{beforeReceiptCommit(){throw Error('reviewed_lost_local_receipt');}}:{})});
}
