import { afterEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/teacher-ai/route';
const state=vi.hoisted(()=>({role:'teacher',clients:0}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>{state.clients++;return {auth:{getUser:async()=>({data:{user:{id:'fictional'}},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:state.role,active:true},error:null})})})})};}}));
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();state.role='teacher';state.clients=0;});
const body={kind:'worksheet',grade:'7',subject:'Science',topic:'Simple machines'};
function request(input:unknown=body,auth=true,headers:Record<string,string>={}){
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:54321');vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','synthetic-test-key');vi.stubEnv('SCHOVERA_HOSTED_DEMO','false');
  return new Request('http://127.0.0.1/api/teacher-ai',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer fictional'}:{}),...headers},body:JSON.stringify(input)});
}
it('does not call a backend when hosted drafting is disabled',async()=>{
  const network=vi.spyOn(globalThis,'fetch');const input=request();vi.stubEnv('SCHOVERA_HOSTED_DEMO','true');expect((await POST(input)).status).toBe(503);expect(network).not.toHaveBeenCalled();expect(state.clients).toBe(0);
});
it('still denies anonymous and Parent accounts',async()=>{
  expect((await POST(request(body,false))).status).toBe(401);state.role='parent';expect((await POST(request())).status).toBe(403);
});
it('rejects invalid and unexpected identity fields',async()=>{
  expect((await POST(request({kind:'exam'}))).status).toBe(400);expect((await POST(request({...body,student_id:'untrusted'}))).status).toBe(400);
});
it('bounds declared and streaming request bodies before inference',async()=>{
  expect((await POST(request(body,true,{'content-length':'17000'}))).status).toBe(413);
  expect((await POST(request({...body,details:'x'.repeat(17000)}))).status).toBe(400);
});
