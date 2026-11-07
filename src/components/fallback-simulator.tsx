'use client';

import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { languageOptions, type Language } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-provider';
import { OptionalSection } from '@/components/optional-section';

const subscribe = () => () => {};
const localBrowser = () => ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
function LocalOnly({ children }: { children: ReactNode }) {
  const local = useSyncExternalStore(subscribe, localBrowser, () => false);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!local || process.env.NEXT_PUBLIC_SCHOVERA_FALLBACK_MODE !== 'local' || !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(url)) return null;
  return children;
}

function useLocalApi() {
  const db = useMemo(() => createClient(), []);
  return useMemo(() => async (body?: object, query = '', signal?: AbortSignal) => {
    const { data } = await db.auth.getSession();
    if (!data.session) throw new Error('Authentication required');
    const response = await fetch(`/api/fallback-simulator${query}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal,
    });
    if (!response.ok) throw new Error('Simulation unavailable');
    return response.json();
  }, [db]);
}

export function ParentFallbackPreferences() {
  const { t } = useI18n();
  return process.env.NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO === 'true'
    ? <HostedFallbackExample /> : <LocalOnly><OptionalSection id="notification-simulation-tools" title={t('fallback.preferences')} description={t('fallback.warning')}><Preferences /></OptionalSection></LocalOnly>;
}
function HostedFallbackExample() {
  const { language } = useI18n();
  const copy = {
    en: ['SMS / IVR — illustrative simulation', 'Example only, not your delivery history: SMS delivered; IVR unavailable. No message or call was sent. Consent and dispatch controls are available only in the trainer’s local simulator.'],
    hi: ['SMS / IVR — उदाहरण अनुकरण', 'यह केवल उदाहरण है, आपका वितरण इतिहास नहीं: SMS वितरित; IVR अनुपलब्ध। कोई संदेश या कॉल नहीं भेजा गया। सहमति और भेजने के नियंत्रण केवल प्रशिक्षक के स्थानीय सिम्युलेटर में उपलब्ध हैं।'],
    mr: ['SMS / IVR — उदाहरण अनुकरण', 'हे फक्त उदाहरण आहे, तुमचा वितरण इतिहास नाही: SMS वितरित; IVR अनुपलब्ध. कोणताही संदेश किंवा कॉल पाठवलेला नाही. संमती आणि पाठवण्याची नियंत्रणे फक्त प्रशिक्षकाच्या स्थानिक सिम्युलेटरमध्ये उपलब्ध आहेत.'],
  }[language];
  return <section className="fallback-panel" data-testid="hosted-fallback-example"><h3>{copy[0]}</h3><p>{copy[1]}</p></section>;
}
function Preferences() {
  const { t } = useI18n();
  const api = useLocalApi(); const id = useId();
  const [sms, setSms] = useState(false); const [ivr, setIvr] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<'saved' | 'error' | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api(undefined, '', controller.signal).then((result) => {
      const prefs = result.preferences as { channel: string; opted_in: boolean; preferred_language: Language }[];
      setSms(prefs.some((p) => p.channel === 'sms' && p.opted_in));
      setIvr(prefs.some((p) => p.channel === 'ivr' && p.opted_in));
      setLanguage(prefs[0]?.preferred_language ?? 'en'); setReady(true);
    }).catch(() => { if (!controller.signal.aborted) setFeedback('error'); });
    return () => controller.abort();
  }, [api, revision]);
  return <section className="fallback-panel" aria-labelledby={`${id}-heading`} data-testid="fallback-preferences">
    <h3 id={`${id}-heading`}>{t('fallback.preferences')}</h3><p className="fallback-warning">{t('fallback.warning')}</p>
    <p>{t('fallback.consent')}</p>
    <form onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setFeedback(null);
      try { await api({ op: 'preferences', sms, ivr, language }); setFeedback('saved'); }
      catch { setFeedback('error'); } finally { setBusy(false); }
    }}>
      <fieldset disabled={!ready || busy}><legend>{t('fallback.channels')}</legend>
        <label className="fallback-checkbox"><input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />{t('fallback.smsConsent')}</label>
        <label className="fallback-checkbox"><input type="checkbox" checked={ivr} onChange={(e) => setIvr(e.target.checked)} />{t('fallback.ivrConsent')}</label>
        <label htmlFor={`${id}-language`}>{t('fallback.language')}</label><select id={`${id}-language`} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>{languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select>
        <button type="submit" disabled={busy}>{busy ? t('common.loading') : t('fallback.save')}</button>
      </fieldset>
    </form>
    <p role="status">{feedback ? t(`fallback.${feedback}`) : !ready ? t('common.loading') : null}</p>
    {feedback === 'error' && <button type="button" onClick={() => setRevision((v) => v + 1)}>{t('common.retry')}</button>}
  </section>;
}

type Delivery = { id: string; channel: 'sms' | 'ivr'; language: 'original' | Language; status: 'pending' | 'accepted' | 'delivered' | 'retry_wait' | 'failed' | 'uncertain' | 'blocked'; attempt_count: number; next_attempt_at: string; receipt_ref: string | null };
export function FallbackDispatch(props: { kind: 'update' | 'announcement'; sourceId: string }) {
  return <LocalOnly><Operator key={`${props.kind}:${props.sourceId}`} {...props} /></LocalOnly>;
}
function Operator({ kind, sourceId }: { kind: 'update' | 'announcement'; sourceId: string }) {
  const { t } = useI18n(); const api = useLocalApi(); const id = useId();
  const [open, setOpen] = useState(false); const [revision, setRevision] = useState(0);
  const [review, setReview] = useState<{ eligible_count: number; deliveries: Delivery[] } | null>(null);
  const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState('deliver');
  const query = `?kind=${kind}&source_id=${sourceId}`;
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void api(undefined, query, controller.signal).then(setReview).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [api, open, query, revision]);
  async function action(body: object) {
    setBusy(true); setError(false);
    try { await api(body); setRevision((v) => v + 1); }
    catch { setError(true); } finally { setBusy(false); }
  }
  return <details className="fallback-panel" data-testid="fallback-dispatch" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>{t('fallback.manage')}</summary>
    {open && <><p className="fallback-warning">{t('fallback.warning')}</p><p>{t('fallback.independent')}</p><p>{t('fallback.content')}</p>
      {error && <p role="alert">{t('fallback.error')}</p>}
      {!review ? <p role="status">{t('common.loading')}</p> : <>
        <p role="status">{t('fallback.eligible')}: {review.eligible_count} · {t('fallback.queued')}: {review.deliveries.length}</p>
        {review.deliveries.length > 0 && <p className="hint">{(['pending', 'accepted', 'delivered', 'retry_wait', 'failed', 'uncertain', 'blocked'] as const).filter((status) => review.deliveries.some((d) => d.status === status)).map((status) => `${t(`fallback.status.${status}`)}: ${review.deliveries.filter((d) => d.status === status).length}`).join(' · ')}</p>}
        <div className="fallback-actions"><button type="button" disabled={busy || !review.eligible_count} onClick={() => void action({ op: 'queue', kind, source_id: sourceId })}>{t('fallback.queue')}</button>
          <button type="button" disabled={busy} onClick={() => { setError(false); setRevision((v) => v + 1); }}>{t('fallback.refresh')}</button></div>
        <label htmlFor={`${id}-scenario`}>{t('fallback.scenario')}</label><select id={`${id}-scenario`} value={scenario} onChange={(e) => setScenario(e.target.value)}>
          {(['deliver', 'delay', 'temporary_failure', 'permanent_failure', 'unreachable', 'reject', 'timeout'] as const).map((value) => <option key={value} value={value}>{t(`fallback.${value}`)}</option>)}
        </select>
        {!review.deliveries.length && <p>{t('fallback.empty')}</p>}
        <ul className="fallback-deliveries">{review.deliveries.map((d, index) => <li key={d.id}>
          <p><strong>{t('fallback.item')} {index + 1} · {d.channel.toUpperCase()}</strong> · {d.language === 'original' ? t('translation.original') : languageOptions.find((o) => o.code === d.language)?.label}</p>
          <p><span>{t(`fallback.status.${d.status}`)}</span> · {t('fallback.attempts')}: {d.attempt_count}/5</p>
          {d.receipt_ref && <small>{d.receipt_ref}</small>}
          {!['delivered', 'failed', 'blocked'].includes(d.status) && <><p className="hint">{t('fallback.retryAt')}: {new Date(d.next_attempt_at).toLocaleString()}</p><button type="button" disabled={busy} onClick={() => void action({ op: 'dispatch', delivery_id: d.id, scenario })}>{t('fallback.simulate')}</button></>}
        </li>)}</ul>
      </>}
    </>}
  </details>;
}
