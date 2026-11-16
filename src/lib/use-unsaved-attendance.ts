'use client';
import { useCallback, useEffect } from 'react';

/** Native Back/Forward navigation cannot reliably be cancelled by App Router.
 * Guard reload/close, ordinary in-app links, sign-out and explicit context edits.
 */
export function useUnsavedAttendance(dirty:boolean,question:string,discard:()=>void) {
  const confirmLeave=useCallback(()=>{
    if(!dirty)return true;
    if(!window.confirm(question))return false;
    discard();return true;
  },[dirty,question,discard]);
  useEffect(()=>{
    if(!dirty)return;
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    const leave=(event:Event)=>{if(!confirmLeave())event.preventDefault();};
    const click=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;
      if(!link||link.target==='_blank')return;
      const destination=new URL(link.href,location.href);
      if(destination.origin===location.origin&&destination.pathname===location.pathname&&destination.search===location.search)return;
      if(!confirmLeave()){event.preventDefault();event.stopPropagation();}
    };
    window.addEventListener('beforeunload',unload);window.addEventListener('schovera:before-workspace-leave',leave);document.addEventListener('click',click,true);
    return()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('schovera:before-workspace-leave',leave);document.removeEventListener('click',click,true);};
  },[dirty,confirmLeave]);
  return confirmLeave;
}
