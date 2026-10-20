'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useI18n } from '@/lib/i18n-provider';
import {
  getBrowserSpeechEnvironment,
  ParentSpeechController,
  type NoticeLanguageChoice,
} from '@/lib/parent-speech';

export function useParentSpeech(scope: string, getEnvironment = getBrowserSpeechEnvironment) {
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
  controller,
  state,
}: {
  noticeId: string;
  text: string;
  language?: Exclude<NoticeLanguageChoice, 'auto'>;
  requireLanguageChoice?: boolean;
  controller: ParentSpeechController;
  state: ReturnType<ParentSpeechController['getSnapshot']>;
}) {
  const { t } = useI18n();
  const isActive = state.noticeId === noticeId && state.phase !== 'idle';
  const [choice, setChoice] = useSpeechChoice(noticeId);
  const needsChoice = requireLanguageChoice && !language && choice === 'auto';
  useEffect(() => () => {
    if (controller.getSnapshot().noticeId === noticeId) controller.stop();
  }, [controller, noticeId, text, language]);

  return (
    <div className="parent-speech-controls" role="group" aria-label={t('speech.controls')}>
      <label className="parent-speech-language">
        <span>{t('speech.language')}</span>
        <select value={language ?? choice} disabled={Boolean(language)} onChange={(event) => { controller.stop(); setChoice(event.target.value as NoticeLanguageChoice); }} aria-label={t('speech.language')}>
          <option value="auto">{t('speech.auto')}</option>
          <option value="en">{t('speech.english')}</option>
          <option value="hi">{t('speech.hindi')}</option>
          <option value="mr">{t('speech.marathi')}</option>
        </select>
      </label>
      {!isActive || state.phase === 'unavailable' || state.phase === 'error' ? (
        <button type="button" className="parent-speech-button" onClick={() => void controller.play(noticeId, text, language ?? choice)} disabled={!text.trim() || needsChoice}>
          {t('speech.listen')}
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
          <button type="button" className="parent-speech-stop" onClick={() => controller.stop()}>{t('speech.stop')}</button>
        </>
      )}
      {isActive && state.messageKey && (
        <span className="parent-speech-status" role="status" aria-live="polite">{t(state.messageKey)}</span>
      )}
      {needsChoice && <span className="parent-speech-status" role="status">{t('speech.chooseLanguage')}</span>}
    </div>
  );
}

function useSpeechChoice(noticeId: string): [NoticeLanguageChoice, (value: NoticeLanguageChoice) => void] {
  // A fresh control starts with conservative detection; no notice text is persisted.
  const [selection, setSelection] = useState({ noticeId, choice: 'auto' as NoticeLanguageChoice });
  const choice = selection.noticeId === noticeId ? selection.choice : 'auto';
  const setChoice = (next: NoticeLanguageChoice) => setSelection({ noticeId, choice: next });
  return [choice, setChoice];
}
