import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectNoticeLanguage,
  ParentSpeechController,
  selectNoticeVoice,
  type SpeechEnvironment,
  type SpeechSynthesisLike,
  type SpeechUtteranceLike,
  type SpeechVoice,
} from './parent-speech';

class MockSynthesis extends EventTarget implements SpeechSynthesisLike {
  speaking = false;
  paused = false;
  voices: SpeechVoice[] = [];
  utterances: SpeechUtteranceLike[] = [];
  cancel = vi.fn(() => { this.speaking = false; this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  resume = vi.fn(() => { this.paused = false; });
  speak = vi.fn((utterance: SpeechUtteranceLike) => { this.utterances.push(utterance); });
  getVoices = vi.fn(() => this.voices);
}

function mockEnvironment(voices: SpeechVoice[] = [{ lang: 'en-IN', name: 'Indian English' }]) {
  const synthesis = new MockSynthesis();
  synthesis.voices = voices;
  const environment: SpeechEnvironment = {
    synthesis,
    createUtterance: (text) => ({ text, lang: '', voice: null, onstart: null, onend: null, onerror: null }),
  };
  return { synthesis, environment, controller: new ParentSpeechController(() => environment) };
}

afterEach(() => vi.useRealTimers());

describe('parent notice speech policy and controller', () => {
  it('detects Latin English but never guesses Hindi versus Marathi from Devanagari', () => {
    expect(detectNoticeLanguage('School will remain closed tomorrow.')).toBe('en');
    expect(detectNoticeLanguage('कल विद्यालय बंद रहेगा')).toBeNull();
    expect(detectNoticeLanguage('उद्या शाळा बंद राहील')).toBeNull();
    expect(detectNoticeLanguage('')).toBeNull();
  });

  it('prefers en-IN and falls back only to another English voice', () => {
    expect(selectNoticeVoice([{ lang: 'en-US' }, { lang: 'en-IN' }], 'en')?.lang).toBe('en-IN');
    expect(selectNoticeVoice([{ lang: 'en-GB' }], 'en')?.lang).toBe('en-GB');
    expect(selectNoticeVoice([{ lang: 'fr-FR' }], 'en')).toBeNull();
  });

  it.each([
    ['Hindi', 'hi', 'hi-IN'],
    ['Marathi', 'mr', 'mr-IN'],
  ] as const)('requires an exact %s family voice', async (_label, language, locale) => {
    const { controller, synthesis } = mockEnvironment([{ lang: language === 'hi' ? 'en-IN' : 'hi-IN' }]);
    await controller.play('notice-1', 'नोटिस का मूल पाठ', language);
    expect(synthesis.speak).not.toHaveBeenCalled();
    expect(controller.getSnapshot().messageKey).toBe('speech.noVoice');

    const withVoice = mockEnvironment([{ lang: locale }]);
    await withVoice.controller.play('notice-2', 'मूळ सूचना मजकूर', language);
    expect(withVoice.synthesis.speak).toHaveBeenCalledTimes(1);
    expect(withVoice.synthesis.utterances[0].lang).toBe(locale);
  });

  it('keeps unsupported browsers on an honest text fallback', async () => {
    const controller = new ParentSpeechController(() => null);
    await controller.play('notice', 'Read this text', 'auto');
    expect(controller.getSnapshot().messageKey).toBe('speech.unsupported');
  });

  it('asks for a language for ambiguous script and performs no application network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { controller, synthesis } = mockEnvironment([{ lang: 'hi-IN' }, { lang: 'mr-IN' }]);
    await controller.play('notice', 'शाळेची सूचना उद्या लागू होईल', 'auto');
    expect(controller.getSnapshot().messageKey).toBe('speech.chooseLanguage');
    expect(synthesis.speak).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('waits for asynchronous voice initialization and then starts only a matching voice', async () => {
    const { controller, synthesis } = mockEnvironment([]);
    const pending = controller.play('notice', 'सूचना का मूल पाठ', 'hi');
    expect(synthesis.speak).not.toHaveBeenCalled();
    synthesis.voices = [{ lang: 'hi-IN' }];
    synthesis.dispatchEvent(new Event('voiceschanged'));
    await pending;
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
    expect(synthesis.utterances[0].voice?.lang).toBe('hi-IN');
  });

  it('does not claim playback before the browser emits start, and supports pause/resume/stop', async () => {
    const { controller, synthesis } = mockEnvironment();
    await controller.play('notice', 'Original message exactly.', 'auto');
    expect(controller.getSnapshot().messageKey).toBe('speech.starting');
    synthesis.utterances[0].onstart?.();
    expect(controller.getSnapshot().messageKey).toBe('speech.playing');
    controller.pause();
    expect(synthesis.pause).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe('paused');
    controller.resume();
    expect(synthesis.resume).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().phase).toBe('speaking');
    controller.stop();
    expect(synthesis.cancel).toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe('idle');
  });

  it('cancels/replaces an earlier notice and ignores stale asynchronous voice results', async () => {
    const { controller, synthesis } = mockEnvironment();
    await controller.play('first', 'First notice', 'auto');
    const firstUtterance = synthesis.utterances[0];
    await controller.play('second', 'Second notice', 'auto');
    expect(synthesis.cancel).toHaveBeenCalled();
    firstUtterance.onend?.();
    expect(controller.getSnapshot().noticeId).toBe('second');
    expect(synthesis.utterances).toHaveLength(2);
  });

  it('rejects empty text and safely handles very long original text without truncating it', async () => {
    const { controller, synthesis } = mockEnvironment();
    await controller.play('empty', ' \n ', 'auto');
    expect(controller.getSnapshot().messageKey).toBe('speech.empty');
    const longText = 'Notice. '.repeat(20_000);
    await controller.play('long', longText, 'auto');
    expect(synthesis.utterances[0].text).toBe(longText);
  });

  it('cancels pending voice initialization when another card takes over', async () => {
    vi.useFakeTimers();
    const { controller, synthesis } = mockEnvironment([]);
    const pendingHindi = controller.play('hindi', 'मूल हिंदी पाठ', 'hi');
    synthesis.voices = [{ lang: 'en-IN' }];
    await controller.play('english', 'English notice', 'auto');
    synthesis.voices = [{ lang: 'hi-IN' }];
    synthesis.dispatchEvent(new Event('voiceschanged'));
    await pendingHindi;
    expect(synthesis.utterances).toHaveLength(1);
    expect(synthesis.utterances[0].text).toBe('English notice');
    vi.runOnlyPendingTimers();
  });
});
