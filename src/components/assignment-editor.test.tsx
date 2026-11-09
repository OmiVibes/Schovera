// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AssignmentEditor } from './assignment-editor';
import { I18nProvider } from '@/lib/i18n-provider';
const mocks = vi.hoisted(() => ({rpc:vi.fn(async()=>({error:{message:'homework changed'}}))}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({rpc:mocks.rpc})}));
it('preserves an open edit snapshot across background updates and reports stale edits',async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const original={id:'fictional',subject:'Science',title:'Original homework',description:'Original instructions',due_date:'2099-01-01',updated_at:'2026-10-21T00:00:00Z'};
  try{
    await act(async()=>root.render(<I18nProvider><AssignmentEditor assignment={original} onSaved={()=>{}}/></I18nProvider>));
    await act(async()=>host.querySelector('button')!.click());
    await act(async()=>root.render(<I18nProvider><AssignmentEditor assignment={{...original,title:'Other session edit',updated_at:'2026-10-21T01:00:00Z'}} onSaved={()=>{}}/></I18nProvider>));
    expect((host.querySelector('input[name=title]') as HTMLInputElement).value).toBe(original.title);
    await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(mocks.rpc).toHaveBeenCalledWith('edit_class_assignment',expect.objectContaining({p_expected_updated_at:original.updated_at,p_title:original.title}));
    expect(host.querySelector('[role=alert]')?.textContent).toContain('another session');
  }finally{await act(async()=>root.unmount());host.remove();}
});
