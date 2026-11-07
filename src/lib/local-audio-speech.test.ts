import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import type {SpeechUtteranceLike} from './parent-speech';
vi.mock('./supabase/client',()=>({createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'synthetic-session'}}})}})}));
const audio:FakeAudio[]=[];
class FakeAudio {
  volume=0;muted=true;paused=true;onplaying:(()=>void)|null=null;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;
  rejectPlay=false;
  constructor(public src:string){audio.push(this);}
  play=vi.fn(async()=>{if(this.rejectPlay)throw Error('Playback blocked');this.paused=false;this.onplaying?.();});
  pause=vi.fn(()=>{this.paused=true;});removeAttribute=vi.fn();load=vi.fn();
}
const utterance=():SpeechUtteranceLike=>({text:'Original school message.',lang:'en-IN',voice:null,onstart:vi.fn(),onend:vi.fn(),onerror:vi.fn()});
beforeEach(()=>{
  vi.resetModules();audio.length=0;
  vi.stubGlobal('window',{location:{hostname:'127.0.0.1'}});
  vi.stubGlobal('Audio',FakeAudio);
  vi.stubGlobal('URL',class extends URL { static createObjectURL=vi.fn(()=>'blob:synthetic');static revokeObjectURL=vi.fn(); });
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('synthetic audio',{status:200,headers:{'Content-Type':'audio/wav'}})));
});
afterEach(()=>{vi.unstubAllGlobals();});
const environment=async()=>{const {getLocalAudioSpeechEnvironment}=await import('./local-audio-speech');return getLocalAudioSpeechEnvironment()!;};
describe('local audio speech adapter',()=>{
  it('sends the exact text with caller authentication and starts only on actual media playing',async()=>{
    const env=await environment(),u=utterance();env.synthesis.speak(u);
    expect(u.onstart).not.toHaveBeenCalled();await vi.waitFor(()=>expect(u.onstart).toHaveBeenCalledOnce());
    const request=vi.mocked(fetch).mock.calls[0];expect(request[0]).toBe('/api/communication/speech');
    expect(JSON.parse(request[1]!.body as string)).toEqual({text:u.text,language:'en'});
    expect(request[1]!.headers).toHaveProperty('Authorization','Bearer synthetic-session');
    expect(audio[0].volume).toBe(1);expect(audio[0].muted).toBe(false);
    env.synthesis.cancel();
  });
  it('pauses, resumes and releases the blob on completion',async()=>{
    const env=await environment(),u=utterance();env.synthesis.speak(u);await vi.waitFor(()=>expect(audio).toHaveLength(1));
    env.synthesis.pause();expect(audio[0].paused).toBe(true);env.synthesis.resume();await vi.waitFor(()=>expect(audio[0].paused).toBe(false));
    audio[0].onended?.();expect(u.onend).toHaveBeenCalledOnce();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');expect(audio[0].removeAttribute).toHaveBeenCalledWith('src');
  });
  it('reports blocked resume instead of claiming that audio is still playing',async()=>{
    const env=await environment(),u=utterance();env.synthesis.speak(u);await vi.waitFor(()=>expect(audio).toHaveLength(1));
    env.synthesis.pause();audio[0].rejectPlay=true;env.synthesis.resume();await vi.waitFor(()=>expect(u.onerror).toHaveBeenCalledOnce());
    expect(audio[0].paused).toBe(true);
  });
  it('does not play a late response after Stop or a scope change',async()=>{
    let complete!:(response:Response)=>void;
    vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{complete=resolve;})));
    const env=await environment(),u=utterance();env.synthesis.speak(u);await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());
    env.synthesis.cancel();complete(new Response('late audio'));await new Promise(resolve=>setTimeout(resolve,0));
    expect(audio).toHaveLength(0);expect(u.onstart).not.toHaveBeenCalled();
  });
  it('keeps failures honest when the local service is unavailable',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:503})));
    const env=await environment(),u=utterance();env.synthesis.speak(u);await vi.waitFor(()=>expect(u.onerror).toHaveBeenCalledOnce());
    expect(audio).toHaveLength(0);expect(u.onstart).not.toHaveBeenCalled();
  });
  it('preserves native browser playback on non-local hosts without a local audio request',async()=>{
    const native={};vi.stubGlobal('window',{location:{hostname:'synthetic.example'},speechSynthesis:native});
    vi.stubGlobal('SpeechSynthesisUtterance',class {});
    const env=await environment();expect(env.synthesis).toBe(native);expect(fetch).not.toHaveBeenCalled();
  });
});
