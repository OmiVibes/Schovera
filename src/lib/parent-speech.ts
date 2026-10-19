export type NoticeLanguage = 'en' | 'hi' | 'mr';
export type NoticeLanguageChoice = NoticeLanguage | 'auto';
export type PlaybackPhase = 'idle' | 'loading' | 'speaking' | 'paused' | 'unavailable' | 'error';

export type PlaybackState = {
  noticeId: string | null;
  phase: PlaybackPhase;
  messageKey: 'speech.starting' | 'speech.playing' | 'speech.paused' | 'speech.empty' | 'speech.chooseLanguage' | 'speech.noVoice' | 'speech.unsupported' | 'speech.failed' | null;
};

export interface SpeechVoice {
  lang: string;
  name?: string;
}

export interface SpeechUtteranceLike {
  text: string;
  lang: string;
  voice: SpeechVoice | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export interface SpeechSynthesisLike {
  speaking: boolean;
  paused: boolean;
  getVoices(): SpeechVoice[];
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  addEventListener(type: 'voiceschanged', listener: EventListener): void;
  removeEventListener(type: 'voiceschanged', listener: EventListener): void;
}

export type SpeechEnvironment = {
  synthesis: SpeechSynthesisLike;
  createUtterance(text: string): SpeechUtteranceLike;
};

export function detectNoticeLanguage(text: string): NoticeLanguage | null {
  if (!text.trim()) return null;
  // Latin script is a conservative English default. Devanagari is shared by
  // Hindi and Marathi, so it must not be guessed from script alone.
  if (/[\u0900-\u097f]/u.test(text)) return null;
  if (/[A-Za-z]/u.test(text)) return 'en';
  return null;
}

export function resolveNoticeLanguage(
  text: string,
  choice: NoticeLanguageChoice,
): NoticeLanguage | null {
  return choice === 'auto' ? detectNoticeLanguage(text) : choice;
}

export function selectNoticeVoice(
  voices: SpeechVoice[],
  language: NoticeLanguage,
): SpeechVoice | null {
  const prefix = language === 'en' ? 'en' : language;
  const matching = voices.filter((voice) => voice.lang.toLowerCase().split(/[-_]/u)[0] === prefix);
  if (language === 'en') {
    return matching.find((voice) => voice.lang.toLowerCase() === 'en-in')
      ?? matching.find((voice) => voice.lang.toLowerCase().startsWith('en-'))
      ?? matching[0]
      ?? null;
  }
  const locale = language === 'hi' ? 'hi-in' : 'mr-in';
  return matching.find((voice) => voice.lang.toLowerCase() === locale)
    ?? matching.find((voice) => voice.lang.toLowerCase().startsWith(`${language}-`))
    ?? matching[0]
    ?? null;
}

const emptyState: PlaybackState = { noticeId: null, phase: 'idle', messageKey: null };

export class ParentSpeechController {
  private state = emptyState;
  private generation = 0;
  private listeners = new Set<() => void>();
  private currentEnvironment: SpeechEnvironment | null = null;
  private cancelVoiceWait: (() => void) | null = null;

  constructor(private readonly getEnvironment: () => SpeechEnvironment | null) {}

  getSnapshot = (): PlaybackState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(state: PlaybackState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  private invalidate(andCancel = true) {
    this.generation += 1;
    this.cancelVoiceWait?.();
    this.cancelVoiceWait = null;
    if (andCancel) this.currentEnvironment?.synthesis.cancel();
    this.currentEnvironment = null;
    return this.generation;
  }

  async play(noticeId: string, text: string, choice: NoticeLanguageChoice) {
    const generation = this.invalidate();
    if (!text.trim()) {
      this.update({ noticeId, phase: 'unavailable', messageKey: 'speech.empty' });
      return;
    }
    const language = resolveNoticeLanguage(text, choice);
    if (!language) {
      this.update({ noticeId, phase: 'unavailable', messageKey: 'speech.chooseLanguage' });
      return;
    }
    const environment = this.getEnvironment();
    if (!environment) {
      this.update({ noticeId, phase: 'unavailable', messageKey: 'speech.unsupported' });
      return;
    }

    this.currentEnvironment = environment;
    this.update({ noticeId, phase: 'loading', messageKey: 'speech.starting' });
    const voice = await this.waitForVoice(environment.synthesis, language, generation);
    if (generation !== this.generation) return;
    if (!voice) {
      this.currentEnvironment = null;
      this.update({ noticeId, phase: 'unavailable', messageKey: 'speech.noVoice' });
      return;
    }

    try {
      const utterance = environment.createUtterance(text);
      utterance.lang = voice.lang;
      utterance.voice = voice;
      utterance.onstart = () => {
        if (generation === this.generation) this.update({ noticeId, phase: 'speaking', messageKey: 'speech.playing' });
      };
      utterance.onend = () => {
        if (generation === this.generation) {
          this.currentEnvironment = null;
          this.update(emptyState);
        }
      };
      utterance.onerror = () => {
        if (generation === this.generation) {
          this.currentEnvironment = null;
          this.update({ noticeId, phase: 'error', messageKey: 'speech.failed' });
        }
      };
      environment.synthesis.speak(utterance);
    } catch {
      if (generation === this.generation) {
        this.currentEnvironment = null;
        this.update({ noticeId, phase: 'error', messageKey: 'speech.failed' });
      }
    }
  }

  pause() {
    if (this.state.phase !== 'speaking' || !this.currentEnvironment) return;
    this.currentEnvironment.synthesis.pause();
    this.update({ ...this.state, phase: 'paused', messageKey: 'speech.paused' });
  }

  resume() {
    if (this.state.phase !== 'paused' || !this.currentEnvironment) return;
    this.currentEnvironment.synthesis.resume();
    this.update({ ...this.state, phase: 'speaking', messageKey: 'speech.playing' });
  }

  stop() {
    this.invalidate();
    this.update(emptyState);
  }

  dispose() {
    this.stop();
    this.listeners.clear();
  }

  private waitForVoice(synthesis: SpeechSynthesisLike, language: NoticeLanguage, generation: number): Promise<SpeechVoice | null> {
    const current = () => generation === this.generation;
    const find = () => selectNoticeVoice(synthesis.getVoices(), language);
    const immediate = find();
    if (immediate) return Promise.resolve(immediate);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (voice: SpeechVoice | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        synthesis.removeEventListener('voiceschanged', onVoicesChanged);
        this.cancelVoiceWait = null;
        resolve(voice);
      };
      const onVoicesChanged: EventListener = () => {
        if (!current()) return finish(null);
        const voice = find();
        if (voice) finish(voice);
      };
      const timeout = setTimeout(() => finish(current() ? find() : null), 1500);
      this.cancelVoiceWait = () => finish(null);
      synthesis.addEventListener('voiceschanged', onVoicesChanged);
      // Check once after registration to close the race with async voice loading.
      onVoicesChanged(new Event('voiceschanged'));
    });
  }
}

export function getBrowserSpeechEnvironment(): SpeechEnvironment | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return null;
  return {
    synthesis: window.speechSynthesis as unknown as SpeechSynthesisLike,
    createUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as SpeechUtteranceLike,
  };
}
