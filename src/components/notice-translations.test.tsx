// @vitest-environment jsdom
import React, { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n-provider';
import { ParentSpeechController, type SpeechUtteranceLike } from '@/lib/parent-speech';
import { displayedCommunication, type CommunicationSource, type ReviewedTranslation } from '@/lib/communication-translations';
import { NoticeContent } from './notice-translations';

const fixture = vi.hoisted(() => ({ rows: new Map<string, unknown>(), reads: [] as string[] }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: () => {
  let id = ''; let language = '';
  const builder = { select: () => builder, abortSignal: () => builder,
    eq: (key: string, value: string) => { if (key.endsWith('_id')) id = value; if (key === 'language') language = value; return builder; },
    maybeSingle: async () => { fixture.reads.push(`${id}:${language}`); return { data: fixture.rows.get(`${id}:${language}`) ?? null, error: null }; } };
  return builder;
} }) }));
let host: HTMLDivElement; let root: Root;
const source: CommunicationSource = { kind: 'update', id: 'synthetic-a', title: 'Original title', body: 'Original body 10:00' };
function setup() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
}
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); fixture.rows.clear(); fixture.reads.length = 0; });

it('does not replace an original with a draft or a missing translation', () => {
  for (const status of ['draft', 'in_review', 'needs_review'] as const) {
    expect(displayedCommunication(source, { status } as ReviewedTranslation).body).toBe(source.body);
  }
  expect(displayedCommunication(source, null).title).toBe(source.title);
});

it('switches approved languages, speaks the visible text, stops on language/source changes, escapes text and falls back honestly', async () => {
  setup();
  const spoken: SpeechUtteranceLike[] = [];
  const cancel = vi.fn();
  const controller = new ParentSpeechController(() => ({ synthesis: {
    speaking: false, paused: false, getVoices: () => [{ lang: 'en-IN' }, { lang: 'hi-IN' }, { lang: 'mr-IN' }],
    speak: (utterance) => { spoken.push(utterance); utterance.onstart?.(); }, cancel, pause: vi.fn(), resume: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }, createUtterance: (text) => ({ text, lang: '', voice: null, onstart: null, onend: null, onerror: null }) }));
  function Harness({ value, duplicate = false }: { value: CommunicationSource; duplicate?: boolean }) {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    return <I18nProvider><NoticeContent source={value} speech={{ controller, state }} />{duplicate && <NoticeContent source={value} speech={{ controller, state }} />}</I18nProvider>;
  }
  await act(async () => root.render(<Harness value={source} />));
  expect(fixture.reads).toEqual([]);
  expect((host.querySelector('.parent-speech-button') as HTMLButtonElement).disabled).toBe(true);
  const change = async (value: string) => { await act(async () => { const select = host.querySelector('.notice-language-toolbar select') as HTMLSelectElement; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }); };
  fixture.rows.set('synthetic-a:hi', { id: 'hi', title: 'सूचना', body: 'पुस्तकालय नौ बजे खुलता है। <img src=x>', language: 'hi', status: 'approved' });
  await change('hi');
  expect(host.textContent).toContain('School-approved translation');
  expect(host.querySelector('img')).toBeNull();
  await act(async () => { (host.querySelector('.parent-speech-button') as HTMLButtonElement).click(); });
  expect(spoken[0].text).toContain('पुस्तकालय'); expect(spoken[0].lang).toBe('hi-IN');
  const before = cancel.mock.calls.length;
  fixture.rows.set('synthetic-a:mr', { id: 'mr', title: 'सूचना', body: 'वाचनालय नऊ वाजता उघडते.', language: 'mr', status: 'approved' });
  await change('mr'); expect(cancel.mock.calls.length).toBeGreaterThan(before);
  await act(async () => { (host.querySelector('.parent-speech-button') as HTMLButtonElement).click(); });
  expect(spoken[1].lang).toBe('mr-IN'); expect(spoken[1].text).toContain('वाचनालय');
  await change('en'); expect(host.textContent).toContain('reviewed translation is unavailable'); expect(host.textContent).toContain(source.body);
  await act(async () => root.render(<Harness value={{ ...source, id: 'synthetic-b', title: 'Child B', body: 'Only child B text' }} />));
  expect(host.textContent).not.toContain('वाचनालय'); expect(host.textContent).not.toContain(source.body); expect(host.textContent).toContain('Only child B text');
  expect((host.querySelector('.notice-language-toolbar select') as HTMLSelectElement).value).toBe('original');
  await act(async () => root.render(<Harness value={source} duplicate />));
  await change('hi');
  await act(async () => { (host.querySelector('.parent-speech-button') as HTMLButtonElement).click(); });
  expect([...host.querySelectorAll('button')].filter((button) => button.textContent === 'Pause')).toHaveLength(1);
});
