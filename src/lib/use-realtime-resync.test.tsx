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
