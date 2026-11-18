// @vitest-environment jsdom
import React,{act,useEffect} from 'react';import {createRoot} from 'react-dom/client';import {it,vi,expect} from 'vitest';import {useRealtimeResync} from './use-realtime-resync';
it('closes the first-query/subscription gap with a finite coalesced reconciliation window',async()=>{
 (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 vi.useFakeTimers();const host=document.createElement('div'),root=createRoot(host),refresh=vi.fn(async()=>{});let api:ReturnType<typeof useRealtimeResync>|undefined;
 function Probe(){api=useRealtimeResync(refresh);return null;}
 try{await act(async()=>root.render(<Probe/>));await act(async()=>{api!.onChannelStatus('SUBSCRIBED');await vi.advanceTimersByTimeAsync(5100);});expect(refresh).toHaveBeenCalledTimes(4);
  await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});expect(refresh).toHaveBeenCalledTimes(4);
  await act(async()=>{window.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(100);});expect(refresh).toHaveBeenCalledTimes(5);
  await act(async()=>root.unmount());await vi.advanceTimersByTimeAsync(10000);expect(refresh).toHaveBeenCalledTimes(5);
 }finally{vi.useRealTimers();host.remove();}
});
it('does not leave recovery frozen after Strict Mode setup/cleanup replay',async()=>{
 (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 vi.useFakeTimers();const root=createRoot(document.createElement('div')),refresh=vi.fn(async()=>{});
 function Probe(){const {onChannelStatus}=useRealtimeResync(refresh);useEffect(()=>{onChannelStatus('SUBSCRIBED');},[onChannelStatus]);return null;}
 try{await act(async()=>root.render(<React.StrictMode><Probe/></React.StrictMode>));await act(async()=>{await vi.advanceTimersByTimeAsync(5100);});expect(refresh).toHaveBeenCalledTimes(4);await act(async()=>root.unmount());}finally{vi.useRealTimers();}
});
it('reconciles a visible online return, coalesces focus and removes visibility listeners on unmount',async()=>{
 (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 vi.useFakeTimers();const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden'),online=vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
 const host=document.createElement('div'),root=createRoot(host),refresh=vi.fn(async()=>{});let stopped=false;
 function Probe(){useRealtimeResync(refresh);return null;}
 try{
  await act(async()=>root.render(<Probe/>));
  await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(100);});expect(refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');online.mockReturnValue(false);
  await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(100);});expect(refresh).not.toHaveBeenCalled();
  online.mockReturnValue(true);
  await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(100);});expect(refresh).toHaveBeenCalledTimes(1);
  await act(async()=>root.unmount());stopped=true;
  await act(async()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(10000);});expect(refresh).toHaveBeenCalledTimes(1);
 }finally{if(!stopped)await act(async()=>root.unmount());visibility.mockRestore();online.mockRestore();vi.useRealTimers();host.remove();}
});
it('reads persisted changes on a late rejoin even while the earlier recovery window is active',async()=>{
 (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
 vi.useFakeTimers();const host=document.createElement('div'),root=createRoot(host);let persisted=0,rendered=0;
 const refresh=vi.fn(async()=>{rendered=persisted;});let api:ReturnType<typeof useRealtimeResync>|undefined;
 function Probe(){api=useRealtimeResync(refresh);return null;}
 try{
  await act(async()=>root.render(<Probe/>));
  await act(async()=>{api!.onChannelStatus('SUBSCRIBED');await vi.advanceTimersByTimeAsync(4700);});
  expect(refresh).toHaveBeenCalledTimes(4);expect(rendered).toBe(0);
  // The last scheduled read finished, but its 5-second window is still active.
  // An interruption loses the change; a successful rejoin must read it now.
  persisted=1;
  await act(async()=>{api!.onChannelStatus('CHANNEL_ERROR');api!.onChannelStatus('SUBSCRIBED');await vi.advanceTimersByTimeAsync(100);});
  expect(rendered).toBe(1);expect(refresh).toHaveBeenCalledTimes(5);
  await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
  expect(refresh).toHaveBeenCalledTimes(5);
 }finally{await act(async()=>root.unmount());vi.useRealTimers();host.remove();}
});
