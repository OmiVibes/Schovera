'use client';
import { createClient } from './supabase/client';
import { getBrowserSpeechEnvironment, type SpeechEnvironment, type SpeechUtteranceLike } from './parent-speech';

let environment: SpeechEnvironment | null = null;
export function getLocalAudioSpeechEnvironment(): SpeechEnvironment | null {
  if (typeof window === 'undefined') return null;
  if (!['127.0.0.1','localhost','[::1]'].includes(window.location.hostname)) return getBrowserSpeechEnvironment();
  if (environment) return environment;
  let audio: HTMLAudioElement | null = null;
  let abort: AbortController | null = null;
  let objectUrl: string | null = null;
  let activeUtterance: SpeechUtteranceLike | null = null;
  let generation = 0;
  const stop = () => {
    generation++;
    abort?.abort(); abort = null;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    activeUtterance = null;
  };
  const synthesis = {
    get speaking() { return Boolean(audio && !audio.paused); },
    get paused() { return Boolean(audio?.paused); },
    // The server selects only a real installed voice of the requested language.
    getVoices: () => ['en-IN','hi-IN','mr-IN','ko-KR'].map(lang => ({ lang, name: 'Local audio' })),
    speak(utterance: SpeechUtteranceLike) {
      stop(); const current = generation;
      activeUtterance = utterance;
      abort = new AbortController();
      void (async () => {
        try {
          const { data } = await createClient().auth.getSession();
          if (current !== generation) return;
          if (!data.session?.access_token) throw new Error('SIGN_IN_REQUIRED');
          const response = await fetch('/api/communication/speech', { method: 'POST', headers: { 'Content-Type':'application/json', Authorization:`Bearer ${data.session.access_token}` },
            body: JSON.stringify({ text: utterance.text, language: utterance.lang.split(/[-_]/)[0] }), signal: abort!.signal });
          if (!response.ok) throw new Error('AUDIO_UNAVAILABLE');
          const blob = await response.blob();
          if (current !== generation) return;
          objectUrl = URL.createObjectURL(blob);
          audio = new Audio(objectUrl); audio.volume = 1; audio.muted = false;
          audio.onplaying = () => { if (current === generation) utterance.onstart?.(); };
          audio.onended = () => { if (current === generation) { stop(); utterance.onend?.(); } };
          audio.onerror = () => { if (current === generation) { stop(); utterance.onerror?.(); } };
          await audio.play();
        } catch {
          if (current === generation) { stop(); utterance.onerror?.(); }
        }
      })();
    },
    cancel: stop,
    pause() { audio?.pause(); },
    resume() {
      const current = generation, utterance = activeUtterance;
      if (audio) void audio.play().catch(() => { if (current === generation) { stop(); utterance?.onerror?.(); } });
    },
    addEventListener() {}, removeEventListener() {},
  };
  environment = { synthesis, createUtterance: text => ({ text, lang:'', voice:null, onstart:null, onend:null, onerror:null }), startTimeoutMs: 45000 };
  return environment;
}
