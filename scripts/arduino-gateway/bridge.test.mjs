import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {DurableUsbBridge} from './bridge.mjs';
import {UsbCaptureRefusal,syntheticLine} from './capture.mjs';

function fixture({reject=false}={}){
  const scope={sessionId:randomUUID()},a={acquisitionId:randomUUID(),sequence:1,observedAt:new Date().toISOString(),eventType:'check_in'};
  const intent={acquisition:a,text:syntheticLine(scope.sessionId,a),command:`ARM ${scope.sessionId} ${a.acquisitionId} 1 ${a.observedAt}`};
  const reports=[],writes=[],calls=[],stored=new Set();
  const capture={scope,issueIntent:async()=>intent,receive:async text=>{calls.push(text);if(reject)throw Error('PRIVATE_ERROR_NOT_FOR_LOGS');stored.add(a.acquisitionId);return {receipt:{event_id:a.acquisitionId,local_receipt_id:'unit-placeholder',outcome:'recorded_locally',queue_state:'pending'},durable:true,destinationDelivered:false};},
    receipt:id=>{if(!stored.has(id))throw new UsbCaptureRefusal('no_committed_local_receipt');return {durable:true};},releaseIntent:id=>{capture.receipt(id);calls.push('released');}};
  const bridge=new DurableUsbBridge({capture,write:async line=>writes.push(line),report:v=>reports.push(v),source:'simulated_serial'});
  return {bridge,capture,intent,reports,writes,calls};
}
it('only sends a bounded synthetic ARM and never inserts before incoming bytes',async()=>{
  const f=fixture();await f.bridge.command('arm');expect(f.calls).toEqual([]);expect(f.writes).toEqual([f.intent.command]);expect(f.reports[0].durable).toBe(false);
});
it('frames real-shaped bytes in partial chunks and reports a local receipt without automatic CLEAR',async()=>{
  const f=fixture();f.bridge.feed(Buffer.from(f.intent.text.slice(0,80)));f.bridge.feed(Buffer.from(f.intent.text.slice(80)+'\r\n'));await f.bridge.busy;
  expect(f.calls).toEqual([f.intent.text]);expect(f.reports.at(-1).event).toBe('local_gateway_receipt');expect(f.reports.at(-1).destinationDelivered).toBe(false);expect(f.writes).toEqual([]);
});
it('refuses release before a committed receipt and requires matching explicit release after capture',async()=>{
  const f=fixture();await expect(f.bridge.command('release '+f.intent.acquisition.acquisitionId)).rejects.toThrow('no_committed');expect(f.writes).toEqual([]);
  f.bridge.feed(Buffer.from(f.intent.text+'\n'));await f.bridge.busy;await f.bridge.command('release '+f.intent.acquisition.acquisitionId);
  expect(f.writes).toEqual(['CLEAR '+f.intent.acquisition.acquisitionId]);expect(f.calls).not.toContain('released');
  f.bridge.feed(Buffer.from('DIAG discarded_synthetic_RAM_only\n'));expect(f.calls).toContain('released');expect(f.bridge.pending).toBe(null);
});
it('preserves original received bytes after uncertain capture and never fabricates an ACK',async()=>{
  const f=fixture({reject:true});f.bridge.feed(Buffer.from(f.intent.text+'\n'));await f.bridge.busy;await f.bridge.command('retry-capture');
  expect(f.calls).toEqual([f.intent.text,f.intent.text]);expect(f.writes).toEqual([]);expect(f.reports.at(-1).durable).toBe(false);expect(f.reports.at(-1).firmwareNotCleared).toBe(true);expect(JSON.stringify(f.reports)).not.toContain('PRIVATE_ERROR');
});
it('never prints secret diagnostics, UID/student fields or accepts an unsupported physical claim',()=>{
  const f=fixture();const secret='PRIVATE_UID_AND_KEY_SENTINEL';
  for(const text of ['DIAG '+secret,'& calc.exe',JSON.stringify({...JSON.parse(f.intent.text),raw_uid:secret}),JSON.stringify({...JSON.parse(f.intent.text),student_id:secret}),JSON.stringify({...JSON.parse(f.intent.text),kind:'physical'}),'x'.repeat(513)])f.bridge.feed(Buffer.from(text+'\n'));
  expect(f.calls).toEqual([]);expect(f.writes).toEqual([]);expect(JSON.stringify(f.reports)).not.toContain(secret);
});
it('does not clear queue work or auto-reopen after device boot/disconnect or port renumbering',async()=>{
  const f=fixture();f.bridge.feed(Buffer.from(f.intent.text+'\n'));await f.bridge.busy;f.bridge.feed(Buffer.from('DIAG Schovera M7A UNO R4 WiFi; synthetic only; RFID not implemented\n'));
  expect(f.capture.receipt(f.intent.acquisition.acquisitionId).durable).toBe(true);f.bridge.disconnected();await expect(f.bridge.command('retry')).rejects.toThrow('select_again');expect(f.writes).toEqual([]);
});
it('supports only safe operator commands and keeps replay distinct from a new ARM',async()=>{
  const f=fixture();await f.bridge.command('status');await f.bridge.command('retry');
  for(const text of ['CLEAR anything','ACK fake','release not-a-uuid','powershell.exe test'])await expect(f.bridge.command(text)).rejects.toThrow();
  expect(f.writes).toEqual(['STATUS','RETRY']);expect(f.writes.join(' ')).not.toContain('Bearer');
});
