// @vitest-environment jsdom
import React, { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n-provider';
import { ParentSpeechController, type SpeechEnvironment, type SpeechUtteranceLike } from '@/lib/parent-speech';
import { ParentSpeechControls } from './parent-speech-controls';
let root: Root; let host: HTMLDivElement; let controller: ParentSpeechController;
const spoken: SpeechUtteranceLike[] = [];
const cancel = vi.fn();
function mount(language?: 'hi', available = true, text = 'Generic classroom notice') {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const environment: SpeechEnvironment = { synthesis: { speaking: false, paused: false, getVoices: () => [{ lang: 'en-IN' }, { lang: 'hi-IN' }, { lang: 'mr-IN' }, { lang: 'ko-KR' }], speak: u => { spoken.push(u); u.onstart?.(); }, cancel, pause: vi.fn(), resume: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }, createUtterance: text => ({ text, lang: '', voice: null, onstart: null, onend: null, onerror: null }) };
  controller = new ParentSpeechController(() => available ? environment : null);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  function Harness() { const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot); return <I18nProvider><p>Original message remains readable.</p><ParentSpeechControls noticeId="synthetic" text={text} language={language} requireLanguageChoice controller={controller} state={state} /></I18nProvider>; }
  return act(async () => root.render(<Harness />));
}
afterEach(async () => { if (root) await act(async () => root.unmount()); controller?.dispose(); host?.remove(); spoken.length = 0; cancel.mockClear(); });
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!;
async function choose(value: string) { await act(async () => { const select = host.querySelector('select')!; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }); }
it('shows one simple language choice for originals, then Listen/Pause/Resume/Stop', async () => {
  await mount(); expect((host.querySelector('select') as HTMLSelectElement).value).toBe('en'); expect(button('Listen').disabled).toBe(false);
  await choose('en'); await act(async () => button('Listen').click()); expect(spoken).toHaveLength(1); expect(spoken[0].lang).toBe('en-IN');
  await act(async () => button('Pause').click()); expect(button('Resume')).toBeTruthy();
  await act(async () => button('Resume').click()); await act(async () => button('Stop').click()); expect(controller.getSnapshot().phase).toBe('idle');
});
it('still requires a language choice for ambiguous Devanagari originals', async () => {
  await mount(undefined, true, 'शाळेची सूचना');
  expect((host.querySelector('select') as HTMLSelectElement).value).toBe('auto');
  expect(button('Listen').disabled).toBe(true);
  await choose('mr'); await act(async () => button('Listen').click()); expect(spoken[0].lang).toBe('mr-IN');
});
it('plays known approved-language text without a second disabled language selector', async () => {
  await mount('hi'); expect(host.querySelector('select')).toBeNull(); expect(button('Listen').disabled).toBe(false);
  await act(async () => button('Listen').click()); expect(spoken[0].lang).toBe('hi-IN');
});
it('selects Korean for Korean original text without translating or replacing it', async () => {
  const original = '안녕하세요. 학교 알림을 읽어 드립니다.';
  await mount(undefined, true, original);
  expect((host.querySelector('select') as HTMLSelectElement).value).toBe('ko');
  expect(host.querySelector('option[value=ko]')?.textContent).toContain('한국어');
  await act(async () => button('Listen').click());
  expect(spoken[0].text).toBe(original); expect(spoken[0].lang).toBe('ko-KR');
});
it('stops playback when the user changes the original language', async () => {
  await mount(); await choose('mr'); await act(async () => button('Listen').click()); expect(spoken[0].lang).toBe('mr-IN');
  await choose('hi'); expect(controller.getSnapshot().phase).toBe('idle'); expect(cancel).toHaveBeenCalled();
});
it('keeps text and an honest unavailable message when speech is unsupported', async () => {
  await mount(undefined, false); await choose('en'); await act(async () => button('Listen').click());
  expect(controller.getSnapshot().messageKey).toBe('speech.unsupported'); expect(host.textContent).toContain('Original message remains readable.'); expect(spoken).toHaveLength(0);
});
