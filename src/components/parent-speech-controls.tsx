'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useI18n } from '@/lib/i18n-provider';
import {
  detectNoticeLanguage,
  koreanVoiceNeedsKoreanText,
  ParentSpeechController,
  type NoticeLanguageChoice,
} from '@/lib/parent-speech';
import { getLocalAudioSpeechEnvironment } from '@/lib/local-audio-speech';

export function useParentSpeech(scope: string, getEnvironment = getLocalAudioSpeechEnvironment) {
  const controller = useMemo(() => new ParentSpeechController(getEnvironment), [getEnvironment]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    controller.stop();
  }, [controller, scope]);
  useEffect(() => () => controller.dispose(), [controller]);

  return { controller, state };
}

export function ParentSpeechControls({
  noticeId,
  text,
  language,
  requireLanguageChoice = false,
  disabled = false,
  controller,
  state,
}: {
  noticeId: string;
  text: string;
  language?: Exclude<NoticeLanguageChoice, 'auto'>;
  requireLanguageChoice?: boolean;
  disabled?: boolean;
  controller: ParentSpeechController;
  state: ReturnType<ParentSpeechController['getSnapshot']>;
}) {
  const { t } = useI18n();
  const isActive = state.noticeId === noticeId && state.phase !== 'idle';
  const [choice, setChoice] = useSpeechChoice(noticeId, detectNoticeLanguage(text) ?? 'auto');
  const needsChoice = requireLanguageChoice && !language && choice === 'auto';
  const koreanMismatch = koreanVoiceNeedsKoreanText(text, language ?? choice);
  useEffect(() => () => {
    if (controller.getSnapshot().noticeId === noticeId) controller.stop();
  }, [controller, noticeId, text, language]);

  return (
    <div className="parent-speech-controls" data-has-language-choice={!language} role="group" aria-label={t('speech.controls')}>
      {!language && <label className="parent-speech-language">
        <span>{t('speech.listenIn')}</span>
        <select value={choice} onChange={(event) => { controller.stop(); setChoice(event.target.value as NoticeLanguageChoice); }} aria-label={t('speech.language')}>
          <option value="auto">{t('speech.chooseShort')}</option>
          <option value="en">{t('speech.english')}</option>
          <option value="hi">{t('speech.hindi')}</option>
          <option value="mr">{t('speech.marathi')}</option>
          <option value="ko">{t('speech.korean')}</option>
        </select>
      </label>}
      {!isActive || state.phase === 'unavailable' || state.phase === 'error' ? (
        <button type="button" className="parent-speech-button" aria-label={t('speech.listen')} onClick={() => void controller.play(noticeId, text, language ?? choice)} disabled={disabled || !text.trim() || needsChoice || koreanMismatch}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg>{t('speech.listenShort')}
        </button>
      ) : (
        <>
          {state.phase === 'speaking' ? (
            <button type="button" className="parent-speech-button" onClick={() => controller.pause()}>{t('speech.pause')}</button>
          ) : state.phase === 'paused' ? (
            <button type="button" className="parent-speech-button" onClick={() => controller.resume()}>{t('speech.resume')}</button>
          ) : (
            <button type="button" className="parent-speech-button" disabled>{t('speech.startingButton')}</button>
          )}
        </>
      )}
      <button type="button" className="parent-speech-stop" disabled={!isActive || state.phase === 'unavailable' || state.phase === 'error'} onClick={() => controller.stop()}>{t('speech.stop')}</button>
      <span className="parent-speech-status" role="status" aria-live="polite">
        {t(koreanMismatch ? 'speech.koreanTextRequired' : needsChoice ? 'speech.chooseLanguage' : isActive && state.messageKey ? state.messageKey : 'speech.voiceHint')}
      </span>
    </div>
  );
}

function useSpeechChoice(noticeId: string, initialChoice: NoticeLanguageChoice): [NoticeLanguageChoice, (value: NoticeLanguageChoice) => void] {
  // A fresh control starts with conservative detection; no notice text is persisted.
  const [selection, setSelection] = useState({ noticeId, choice: initialChoice });
  const choice = selection.noticeId === noticeId ? selection.choice : initialChoice;
  const setChoice = (next: NoticeLanguageChoice) => setSelection({ noticeId, choice: next });
  return [choice, setChoice];
}
