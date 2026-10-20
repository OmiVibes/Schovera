'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n-provider';
import { languageOptions, type Language } from '@/lib/i18n';
import { displayedCommunication, sourceColumn, type CommunicationSource, type ReviewedTranslation } from '@/lib/communication-translations';
import type { ParentSpeechController } from '@/lib/parent-speech';
import { ParentSpeechControls } from './parent-speech-controls';

type Speech = { controller: ParentSpeechController; state: ReturnType<ParentSpeechController['getSnapshot']> };
export function NoticeContent(props: { source: CommunicationSource; speech?: Speech }) {
  return <TranslationView key={`${props.source.kind}:${props.source.id}:${props.source.title}:${props.source.body}`} {...props} />;
}

function TranslationView({ source, speech }: { source: CommunicationSource; speech?: Speech }) {
  const { t } = useI18n();
  const db = useMemo(() => createClient(), []);
  const [choice, setChoice] = useState<Language | 'original'>('original');
  const [revision, setRevision] = useState(0);
  const queryKey = `${source.kind}:${source.id}:${choice}:${revision}`;
  const column = sourceColumn(source);
  const sourceId = source.id;
  const [result, setResult] = useState<{ key: string; data: ReviewedTranslation | null; failed: boolean } | null>(null);
  useEffect(() => {
    if (choice === 'original') return;
    let active = true;
    const abort = new AbortController();
    void (async () => {
      const { data, error } = await db.from('communication_translations')
        .select('id,language,title,body,status,updated_at').eq(column, sourceId)
        .eq('language', choice).eq('status', 'approved').abortSignal(abort.signal).maybeSingle();
      if (active) setResult({ key: queryKey, data: error ? null : data, failed: Boolean(error) });
    })();
    return () => { active = false; abort.abort(); };
  }, [db, column, sourceId, choice, queryKey]);
  useEffect(() => {
    const refresh = () => { speech?.controller.stop(); setRevision((value) => value + 1); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, [speech?.controller]);
  const current = choice !== 'original' && result?.key === queryKey ? result : null;
  const translated = current?.data?.status === 'approved' && current.data.language === choice ? current.data : null;
  const content = displayedCommunication(source, translated);
  const choose = (language: Language | 'original') => { speech?.controller.stop(); setChoice(language); };
  return <div className="notice-language-view" data-testid="notice-language-view">
    <div className="notice-language-toolbar">
      <label>{t('translation.language')}<select value={choice} onChange={(event) => choose(event.target.value as Language | 'original')}>
        <option value="original">{t('translation.original')}</option>
        {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select></label>
      {choice !== 'original' && <><button type="button" onClick={() => choose('original')}>{t('translation.viewOriginal')}</button><button type="button" onClick={() => { speech?.controller.stop(); setRevision((value) => value + 1); }}>{t('common.retry')}</button></>}
    </div>
    <p className="hint notice-language-status" role="status">{choice === 'original' ? t('translation.originalUnknown') : !current ? t('translation.loading') : current.failed ? t('translation.loadError') : translated ? t('translation.approved') : t('translation.unavailable')}</p>
    <div lang={content.language} className="notice-visible-text"><h3>{content.title}</h3><p>{content.body}</p></div>
    {speech && <ParentSpeechControls noticeId={`${source.kind}:${source.id}`} text={`${content.title}. ${content.body}`} language={content.language} controller={speech.controller} state={speech.state} />}
  </div>;
}

export function TranslationManager({ source, canApprove = false }: { source: CommunicationSource; canApprove?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <details className="translation-manager" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{t('translation.manage')}</summary>
    {open && <TranslationEditor key={`${source.kind}:${source.id}:${source.title}:${source.body}`} source={source} canApprove={canApprove} />}
  </details>;
}

function TranslationEditor({ source, canApprove }: { source: CommunicationSource; canApprove: boolean }) {
  const { t } = useI18n();
  const db = useMemo(() => createClient(), []);
  const [language, setLanguage] = useState<Language>('hi');
  const [revision, setRevision] = useState(0);
  const key = `${language}:${revision}`;
  const column = sourceColumn(source);
  const sourceId = source.id;
  const [loaded, setLoaded] = useState<{ key: string; row: ReviewedTranslation | null; error: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await db.from('communication_translations').select('id,language,title,body,status,updated_at')
        .eq(column, sourceId).eq('language', language).maybeSingle();
      if (active) setLoaded({ key, row: data, error: Boolean(error) });
    })();
    return () => { active = false; };
  }, [db, column, sourceId, language, key]);
  return <div className="translation-editor">
    <p className="hint">{t('translation.workflow')}</p>
    <label>{t('translation.language')}<select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>{languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>
    {loaded?.key !== key ? <p role="status">{t('translation.loading')}</p> : loaded.error ? <p role="alert">{t('translation.loadError')}</p> : <DraftForm key={key} source={source} language={language} row={loaded.row} canApprove={canApprove} onSaved={() => setRevision((value) => value + 1)} />}
    <button type="button" onClick={() => setRevision((value) => value + 1)}>{t('common.retry')}</button>
  </div>;
}

function DraftForm({ source, language, row, canApprove, onSaved }: { source: CommunicationSource; language: Language; row: ReviewedTranslation | null; canApprove: boolean; onSaved: () => void }) {
  const { t } = useI18n();
  const db = useMemo(() => createClient(), []);
  const [title, setTitle] = useState(row?.title ?? '');
  const [body, setBody] = useState(row?.body ?? '');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dirty = title !== row?.title || body !== row?.body;
  async function act(action: 'save' | 'submit' | 'approve') {
    if (busy) return;
    setBusy(true); setFailed(false);
    const { error } = await db.rpc('manage_communication_translation', {
      p_source_kind: source.kind, p_source_id: source.id, p_language: language, p_action: action,
      p_expected_title: source.title, p_expected_body: source.body, p_title: title, p_body: body,
      p_expected_updated_at: row?.updated_at ?? null,
    });
    setBusy(false);
    if (error) setFailed(true); else onSaved();
  }
  return <form onSubmit={(event) => { event.preventDefault(); void act('save'); }}>
    <p role="status">{t(`translation.${row?.status ?? 'draft'}`)}</p>
    <div className="translation-preview-grid">
      <section><h4>{t('translation.original')}</h4><b>{source.title}</b><p>{source.body}</p></section>
      <section lang={language}><h4>{t('translation.preview')}</h4><label>{t('translation.title')}<input value={title} required minLength={3} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label><label>{t('translation.body')}<textarea value={body} required minLength={3} maxLength={3000} onChange={(event) => setBody(event.target.value)} rows={5} /></label></section>
    </div>
    <p className="hint">{t('translation.saveWarning')}</p>
    {failed && <p role="alert" className="error">{t('translation.saveError')}</p>}
    <div className="translation-actions"><button type="submit" disabled={busy}>{t('translation.save')}</button>
      {row?.status === 'draft' && <button type="button" disabled={busy || dirty} onClick={() => void act('submit')}>{t('translation.submit')}</button>}
      {canApprove && row?.status === 'in_review' && <><label><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />{t('translation.confirm')}</label><button type="button" disabled={busy || dirty || !reviewed} onClick={() => void act('approve')}>{t('translation.approve')}</button></>}
    </div>
  </form>;
}
