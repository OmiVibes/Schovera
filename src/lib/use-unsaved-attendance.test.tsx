// @vitest-environment jsdom
import React,{act,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {useUnsavedAttendance} from './use-unsaved-attendance';
it('guards links, context exit and reload while dirty; cleans up when saved',async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host),discard=vi.fn();
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  function Probe({dirty}:{dirty:boolean}){const stableDiscard=useCallback(()=>discard(),[]);const leave=useUnsavedAttendance(dirty,'Discard?',stableDiscard);return <button onClick={()=>leave()}>Context</button>;}
  try{
    await act(async()=>root.render(<Probe dirty/>));
    const exit=new Event('schovera:before-workspace-leave',{cancelable:true});window.dispatchEvent(exit);expect(exit.defaultPrevented).toBe(true);expect(discard).not.toHaveBeenCalled();
    const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true);await act(async()=>host.querySelector('button')!.click());expect(discard).toHaveBeenCalledTimes(1);
    await act(async()=>root.render(<Probe dirty={false}/>));const clean=new Event('schovera:before-workspace-leave',{cancelable:true});window.dispatchEvent(clean);expect(clean.defaultPrevented).toBe(false);
  }finally{await act(async()=>root.unmount());host.remove();confirm.mockRestore();}
});
