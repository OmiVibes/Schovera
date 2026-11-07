import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {POST as speech} from '@/app/api/communication/speech/route';
import {POST as translate} from '@/app/api/communication/translate/route';
beforeEach(()=>{
  vi.stubEnv('SCHOVERA_TEST_MODE','local');vi.stubEnv('SCHOVERA_HOSTED_DEMO','false');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','synthetic-public-test-key');
  vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Denied request must not reach any service.');}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe.each([['speech',speech],['translation',translate]] as const)('%s local boundary',(_,handler)=>{
  const request=(headers:Record<string,string>={})=>new Request('http://127.0.0.1:3104/api/communication/test',{method:'POST',headers:{host:'127.0.0.1:3104',origin:'http://127.0.0.1:3104',...headers},body:'{}'});
  it('rejects a hosted database before any Auth/model request',async()=>{
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://synthetic-hosted.supabase.co');
    expect((await handler(request())).status).toBe(404);expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects hosted mode and a forged external host',async()=>{
    expect((await handler(request({host:'schovera.vercel.app'}))).status).toBe(404);
    vi.stubEnv('SCHOVERA_HOSTED_DEMO','true');expect((await handler(request())).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requires local mode and same-origin browser calls',async()=>{
    expect((await handler(request({origin:'https://example.invalid'}))).status).toBe(403);
    vi.stubEnv('SCHOVERA_TEST_MODE','');expect((await handler(request())).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requires authentication without exposing response caches',async()=>{
    const result=await handler(request());expect(result.status).toBe(401);expect(result.headers.get('cache-control')).toBe('no-store');expect(fetch).not.toHaveBeenCalled();
  });
});
