// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { usePrincipalCommunication } from './use-principal-communication';
const school = '12d3f57b-0d1d-48ae-b546-daf69fd11b6b';
const packet = (n: number) => ({school_id: school, summary:{total_count:n,effective_count:n,important_count:n,
  acknowledged_count:0,awaiting_count:n,coverage:n?0:null},updates:[],has_more:false});
it('keeps failed reads unavailable, recovers zero, and discards late old-context responses', async () => {
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  const pending: Array<(value: {data:unknown;error:unknown})=>void> = [];
  const rpc = vi.fn(() => new Promise(resolve => pending.push(resolve)));
  const client = {rpc} as unknown as SupabaseClient;
  let state: ReturnType<typeof usePrincipalCommunication>;
  function Probe({filter}:{filter:'all'|'awaiting'}) { state = usePrincipalCommunication(client,school,filter,40); return null; }
  const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async()=>root.render(<Probe filter="all"/>));
    expect(state!.loading).toBe(true); expect(state!.data).toBeNull();
    await act(async()=>pending.shift()!({data:null,error:{message:'synthetic network failure'}}));
    expect(state!.error).toBeTruthy(); expect(state!.data).toBeNull();
    let retry: Promise<void>; await act(async()=>{retry=state!.refresh();});
    await act(async()=>{pending.shift()!({data:packet(0),error:null});await retry;});
    expect(state!.data?.summary.important_count).toBe(0);expect(state!.error).toBe('');
    await act(async()=>{void state!.refresh();}); const old=pending.shift()!;
    await act(async()=>root.render(<Probe filter="awaiting"/>));
    expect(state!.data).toBeNull();
    await act(async()=>pending.shift()!({data:packet(1002),error:null}));
    await act(async()=>old({data:packet(1),error:null}));
    expect(state!.data?.summary.important_count).toBe(1002);
    expect(rpc.mock.calls.length).toBe(4);
  } finally { await act(async()=>root.unmount()); }
});
