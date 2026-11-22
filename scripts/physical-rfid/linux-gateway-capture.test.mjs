import {it,expect,vi,afterEach} from 'vitest';import {EventEmitter} from 'node:events';
import {runLinuxGatewayCapture} from './linux-gateway-capture.mjs';
import {runReadOnlyCapture} from './capture-readonly.mjs';
import {parseFrame} from './protocol.mjs';
const opts={platform:'linux',port:'/dev/serial/by-id/usb-TEST',usbId:'1a86:7523:TEST',seconds:30,dtr:'off',resetRiskAccepted:true,monitorClosedConfirmed:true};
class Mock extends EventEmitter{start=vi.fn();forceKill=vi.fn();close=vi.fn(async()=>({exited:true,workerConfirmed:true}));}
afterEach(()=>vi.useRealTimers());
it('forwards only complete frames to the injected trusted capture and closes within the bound',async()=>{
  vi.useFakeTimers();const t=new Mock(),capture={capture:vi.fn(()=>({code:'local_observation_committed',durable:true,duplicate:false}))},reports=[];
  const p=runLinuxGatewayCapture(opts,capture,{createTransport:()=>t,report:r=>reports.push(r),processSignals:new EventEmitter()});t.emit('opened');t.emit('bytes',Buffer.from('SCHOVERA_SCAN,FA:CE:'));t.emit('bytes',Buffer.from('B0:0C,1\n'));
  await vi.advanceTimersByTimeAsync(30000);expect(await p).toMatchObject({durableObservationReports:1,captureFailure:null,exitCode:0,source:'mock_serial_gateway'});expect(capture.capture).toHaveBeenCalledTimes(1);expect(JSON.stringify(reports)).not.toContain('FA:CE:B0:0C');expect(t.close).toHaveBeenCalledTimes(1);
});
it('stops on capture rejection instead of continuing, acknowledging or dropping it silently',async()=>{
  const t=new Mock(),capture={capture:vi.fn(()=>{throw Error('PRIVATE_UID_SENTINEL');})},reports=[];
  const p=runLinuxGatewayCapture(opts,capture,{createTransport:()=>t,report:r=>reports.push(r),processSignals:new EventEmitter()});t.emit('opened');t.emit('bytes',Buffer.from('SCHOVERA_SCAN,FA:CE:B0:0C,1\nSCHOVERA_SCAN,FA:CE:B0:0C,2\n'));
  expect(await p).toMatchObject({reason:'capture_held_or_failed',captureFailure:'capture_held_or_failed',exitCode:1,durableObservationReports:0});expect(capture.capture).toHaveBeenCalledTimes(1);expect(JSON.stringify(reports)).not.toContain('PRIVATE_UID_SENTINEL');expect(t.close).toHaveBeenCalledTimes(1);
});
it('reports the one-event budget stop distinctly and succeeds only after confirmed close',async()=>{
  const t=new Mock(),capture={capture:vi.fn(()=>({code:'local_observation_committed',durable:true,duplicate:false}))};
  const p=runLinuxGatewayCapture(opts,capture,{createTransport:()=>t,report:()=>{},processSignals:new EventEmitter(),maxNewEvents:1});
  t.emit('opened');t.emit('bytes',Buffer.from('SCHOVERA_SCAN,FA:CE:B0:0C,1\n'));
  expect(await p).toMatchObject({reason:'capture_budget_reached',captureBudgetReached:true,newDurableEvents:1,exitCode:0});
  expect(t.close).toHaveBeenCalledTimes(1);
});
it('never forwards data to the gateway before exact port-open confirmation',async()=>{
  const t=new Mock(),capture={capture:vi.fn()};
  const p=runLinuxGatewayCapture(opts,capture,{createTransport:()=>t,report:()=>{},processSignals:new EventEmitter()});
  t.emit('bytes',Buffer.from('SCHOVERA_SCAN,FA:CE:B0:0C,1\n'));
  expect(await p).toMatchObject({captureFailure:'bytes_before_open_confirmation',exitCode:1});expect(capture.capture).not.toHaveBeenCalled();
});

it('bounded gateway and read-only observer parse the same fragmented frames near the deadline',async()=>{
  async function exercise(mode){
    vi.useFakeTimers();
    const t=new Mock(),seen=[];
    const capture={capture:vi.fn(line=>{
      const frame=parseFrame(line);seen.push(frame.type);
      return {code:frame.type==='legacy_scan'?'synthetic_scan_accepted':'indication',
        durable:frame.type==='legacy_scan',duplicate:false};
    })};
    const pending=mode==='readonly'
      ?runReadOnlyCapture(opts,{createTransport:()=>t,report:()=>{},processSignals:new EventEmitter()})
      :runLinuxGatewayCapture(opts,capture,{createTransport:()=>t,report:()=>{},processSignals:new EventEmitter()});
    t.emit('opened');
    const initial=Buffer.from('SCHOVERA_RFID_READY\r\nFirmware Version: 0x82 = (unknown)\r\n');
    t.emit('bytes',initial.subarray(0,13));t.emit('bytes',initial.subarray(13));
    await vi.advanceTimersByTimeAsync(28900);
    const scan=Buffer.from('SCHOVERA_SCAN,A1:B2:C3:D4,32923\r\n');
    t.emit('bytes',scan.subarray(0,9));t.emit('bytes',scan.subarray(9,24));t.emit('bytes',scan.subarray(24));
    await vi.advanceTimersByTimeAsync(1100);
    return {result:await pending,capture,seen};
  }
  const observed=await exercise('readonly');
  vi.useRealTimers();
  const bounded=await exercise('bounded');
  expect(observed.result).toMatchObject({reason:'deadline',validScanFrames:1,bootOrReadyIndications:1,firmwareVersionIndications:1,exitCode:0});
  expect(bounded.result).toMatchObject({reason:'deadline',durableObservationReports:1,newDurableEvents:1,captureFailure:null,exitCode:0});
  expect(bounded.seen).toEqual(['legacy_ready','legacy_version','legacy_scan']);
  expect(bounded.capture.capture).toHaveBeenCalledTimes(3);
});

it('both paths accept a scan at 29.6 seconds and stop at the full post-open 30-second deadline',async()=>{
  async function exercise(mode){
    vi.useFakeTimers();
    const t=new Mock(),capture={capture:vi.fn(()=>({durable:true,duplicate:false}))};
    const pending=mode==='readonly'
      ?runReadOnlyCapture(opts,{createTransport:()=>t,report:()=>{},processSignals:new EventEmitter()})
      :runLinuxGatewayCapture(opts,capture,{createTransport:()=>t,report:()=>{},processSignals:new EventEmitter(),maxNewEvents:1});
    t.emit('opened');
    await vi.advanceTimersByTimeAsync(29600);
    t.emit('bytes',Buffer.from('SCHOVERA_SCAN,A1:B2:C3:D4,32923\n'));
    if(mode==='readonly'){
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(400);
    }
    const result=await pending;
    return {result,capture};
  }
  const observed=await exercise('readonly');
  vi.useRealTimers();
  const bounded=await exercise('bounded');
  expect(observed.result).toMatchObject({reason:'deadline',validScanFrames:1,exitCode:0});
  expect(bounded.result).toMatchObject({reason:'capture_budget_reached',newDurableEvents:1,captureFailure:null,exitCode:0});
  expect(bounded.capture.capture).toHaveBeenCalledTimes(1);
});
