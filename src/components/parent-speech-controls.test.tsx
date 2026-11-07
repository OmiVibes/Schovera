// @vitest-environment jsdom
import { act, createElement, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParentSpeechControls, useParentSpeech } from './parent-speech-controls';
import { ParentSpeechController, type SpeechEnvironment, type SpeechUtteranceLike } from '@/lib/parent-speech';
import { I18nProvider, LanguageSelector } from '@/lib/i18n-provider';
import { translate } from '@/lib/i18n';

let root: Root | undefined;
let host: HTMLDivElement | undefined;

function ScopeHarness({ scope, getEnvironment, onController }: { scope: string; getEnvironment: () => SpeechEnvironment | null; onController: (controller: ReturnType<typeof useParentSpeech>['controller']) => void }) {
  const { controller } = useParentSpeech(scope, getEnvironment);
  onController(controller);
  return createElement('div', { 'data-testid': 'scope' }, scope);
}

function ControlsHarness({ controller }: { controller: ParentSpeechController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return createElement(I18nProvider, null, createElement('div', null,
    createElement(LanguageSelector),
    createElement(ParentSpeechControls, { noticeId: 'synthetic-notice', text: 'Synthetic original notice', controller, state }),
  ));
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe('Parent speech lifecycle scope', () => {
  it('stops on child/section changes and on component unmount (role switch or logout)', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const cancel = vi.fn();
    const synthesis = {
      speaking: false,
      paused: false,
      getVoices: () => [{ lang: 'en-IN' }],
      speak: vi.fn((utterance: SpeechUtteranceLike) => utterance.onstart?.()),
      cancel,
      pause: vi.fn(),
      resume: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const getEnvironment: () => SpeechEnvironment = () => ({
      synthesis,
      createUtterance: (text) => ({ text, lang: '', voice: null, onstart: null, onend: null, onerror: null }),
    });
    let controller: ReturnType<typeof useParentSpeech>['controller'];
    const onController = (value: typeof controller) => { controller = value; };

    await act(async () => { root?.render(createElement(ScopeHarness, { scope: 'parent:child-a:updates', getEnvironment, onController })); });
    expect(host.textContent).toContain('child-a');
    await act(async () => { await controller?.play('a-notice', 'Notice for child A', 'auto'); });
    expect(synthesis.speak).toHaveBeenCalledOnce();
    await act(async () => { root?.render(createElement(ScopeHarness, { scope: 'parent:child-b:updates', getEnvironment, onController })); });
    expect(cancel).toHaveBeenCalled();
    cancel.mockClear();
    await act(async () => { await controller?.play('b-notice', 'Notice for child B', 'auto'); });
    await act(async () => { root?.render(createElement(ScopeHarness, { scope: 'parent:child-b:notices', getEnvironment, onController })); });
    expect(cancel).toHaveBeenCalled();
    cancel.mockClear();
    await act(async () => { await controller?.play('notice', 'A notice', 'auto'); });
    await act(async () => { root?.unmount(); root = undefined; });
    expect(cancel).toHaveBeenCalled();
  });

  it('renders localized keyboard-accessible controls and speaks only after a user action', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const played: string[] = [];
    const synthesis = {
      speaking: false,
      paused: false,
      getVoices: () => [{ lang: 'en-IN' }, { lang: 'hi-IN' }, { lang: 'mr-IN' }],
      speak: vi.fn((utterance: SpeechUtteranceLike) => { played.push(utterance.text); utterance.onstart?.(); }),
      cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
    const controller = new ParentSpeechController(() => ({
      synthesis,
      createUtterance: (text) => ({ text, lang: '', voice: null, onstart: null, onend: null, onerror: null }),
    }));
    await act(async () => {
      root?.render(createElement(ControlsHarness, { controller }));
    });
    expect(host.querySelector('[aria-label="Notice language"]')).not.toBeNull();
    expect(host.textContent).toContain(translate('en', 'speech.listenShort'));
    const listen = host.querySelector('button');
    expect(listen?.textContent).toBe(translate('en', 'speech.listenShort'));
    expect(listen?.getAttribute('aria-label')).toBe(translate('en', 'speech.listen'));
    listen?.focus();
    expect(document.activeElement).toBe(listen);
    expect(played).toEqual([]);
    await act(async () => { listen?.click(); });
    expect(played).toEqual(['Synthetic original notice']);
    expect(host.textContent).toContain(translate('en', 'speech.playing'));
    await act(async () => { controller.stop(); });

    const displayLanguage = host.querySelector('.language-selector select') as HTMLSelectElement;
    for (const language of ['hi', 'mr'] as const) {
      await act(async () => {
        displayLanguage.value = language;
        displayLanguage.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(host.textContent).toContain(translate(language, 'speech.listenShort'));
      expect(host.querySelector('button')?.textContent).toBe(translate(language, 'speech.listenShort'));
      expect(host.querySelector('button')?.getAttribute('aria-label')).toBe(translate(language, 'speech.listen'));
    }
    await act(async () => { root?.unmount(); root = undefined; });
  });
});
