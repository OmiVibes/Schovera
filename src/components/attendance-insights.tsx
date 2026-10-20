'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n-provider';
import { classroomInsights } from '@/lib/attendance-insights';
import { loadAttendanceInsights } from '@/lib/attendance-insights-data';

type Props = { role: 'teacher' | 'principal'; profileId: string; schoolId: string; classId?: string; revision?: string };
type Dataset = Awaited<ReturnType<typeof loadAttendanceInsights>>;
export function AttendanceInsights(props: Props) {
  return <Insights key={`${props.role}:${props.profileId}:${props.schoolId}:${props.classId ?? 'school'}`} {...props} />;
}
function Insights({ role, profileId, schoolId, classId, revision }: Props) {
  const { t } = useI18n(); const id = useId();
  const db = useMemo(() => createClient(), []);
  const [result, setResult] = useState<{ key: string; data: Dataset | null; error: boolean; offline: boolean } | null>(null);
  const [offline, setOffline] = useState(false); const [refresh, setRefresh] = useState(0);
  const [choice, setChoice] = useState(''); const [page, setPage] = useState(0);
  const requestKey = `${refresh}:${revision ?? ''}`;
  useEffect(() => {
    const reload = () => { if (document.visibilityState !== 'hidden') { setOffline(!navigator.onLine); setRefresh((v) => v + 1); } };
    const disconnected = () => { setOffline(true); };
    window.addEventListener('focus', reload); window.addEventListener('online', reload); window.addEventListener('offline', disconnected); document.addEventListener('visibilitychange', reload);
    return () => { window.removeEventListener('focus', reload); window.removeEventListener('online', reload); window.removeEventListener('offline', disconnected); document.removeEventListener('visibilitychange', reload); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void (async () => {
      if (!navigator.onLine) return { key: requestKey, data: null, error: false, offline: true };
      try { return { key: requestKey, data: await loadAttendanceInsights(db, profileId, schoolId, role, classId, controller.signal), error: false, offline: false }; }
      catch { return { key: requestKey, data: null, error: true, offline: false }; }
    })().then((next) => { if (active) { setResult(next); setPage(0); } });
    return () => { active = false; controller.abort(); };
  }, [db, profileId, schoolId, role, classId, requestKey]);
  const current = result?.key === requestKey ? result : null;
  const data = offline ? null : current?.data;
  const loading = !current && !offline;
  const error = current?.error;
  const disconnected = offline || current?.offline;
  const summaries = useMemo(() => data?.classes.map((c) => ({ ...c, result: classroomInsights(data.students, data.records, c.id, data.range) })) ?? [], [data]);
  const selected = summaries.find((c) => c.id === choice) ?? summaries[0];
  return <section className="attendance-insights" data-testid="attendance-insights" aria-labelledby={`${id}-title`}>
    <header><h2 id={`${id}-title`}>{t('insights.title')}</h2><button type="button" disabled={loading || offline} onClick={() => setRefresh((v) => v + 1)}>{t('insights.refresh')}</button></header>
    <p className="insights-notice">{t('insights.advisory')}</p><p>{t('insights.limitations')}</p>
    {disconnected ? <p role="status">{t('insights.offline')}</p> : loading ? <p role="status">{t('common.loading')}</p> : error ? <p role="alert">{t('insights.error')}</p> : data && <>
      <p>{t('insights.range')}: <time>{data.range.from}</time> – <time>{data.range.to}</time> · {data.timezone}</p>
      <p className="hint">{t('insights.rules')}</p>
      {role === 'principal' && <div className="insights-classes">{summaries.map((c) => <article key={c.id}><h3>{c.grade}{c.division}</h3><p>{t('insights.recordedDates')}: {c.result.dates.length} · {t('insights.followupCount')}: {c.result.followup} · {t('insights.improvedCount')}: {c.result.improved}</p><p>{c.result.quality ? t('insights.incomplete') : !c.result.enough ? t('insights.insufficient') : t('insights.coverageCaution')}</p></article>)}</div>}
      {summaries.length > 0 ? <><label htmlFor={`${id}-class`}>{t('insights.class')}</label><select id={`${id}-class`} value={selected?.id ?? ''} onChange={(e) => { setChoice(e.target.value); setPage(0); }}>{summaries.map((c) => <option key={c.id} value={c.id}>{c.grade}{c.division}</option>)}</select>
        {selected && <>
          <p>{t('insights.recordedDates')}: {selected.result.dates.join(', ') || '—'}</p>
          {selected.result.quality && <p role="status" className="insights-notice">{t('insights.incomplete')}</p>}
          {!selected.result.enough && <p role="status">{t('insights.insufficient')}</p>}
          {selected.result.enough && !selected.result.followup && <p role="status">{t('insights.noPatterns')}</p>}
          <details><summary>{t('insights.coverage')}</summary><p>{t('insights.coverageCaution')}</p><ul>{selected.result.coverage.map((day) => <li key={day.date}>{day.date}: {day.recorded}/{day.expected} {t('insights.cells')}</li>)}</ul></details>
          <div className="insights-students">{selected.result.students.slice(page * 30, page * 30 + 30).map((s) => <article key={s.id}>
            <h3>{s.full_name}</h3>
            <p>{t('insights.absenceCount')}: {s.absenceDates.length}/{selected.result.recent.length}</p>
            {s.patterns.some((p) => p !== 'improvement') && <h4>{t('insights.followup')}</h4>}
            {s.patterns.map((pattern) => <p key={pattern}>{t(`insights.${pattern}`)}</p>)}
            {s.patterns.length > 0 && <p>{t('insights.absenceDates')}: {s.absenceDates.join(', ') || '—'}</p>}
            <details><summary>{t('insights.records')}</summary><ul>{s.evidence.map((e) => <li key={e.date}><time>{e.date}</time>: {t(e.status === 'missing' || e.status === 'conflict' ? `insights.${e.status}` : `attendance.${e.status}`)}</li>)}</ul>{!s.evidence.length && <p>{t('insights.empty')}</p>}</details>
          </article>)}</div>
          {selected.result.students.length > 30 && <nav aria-label={t('insights.pages')}><button disabled={!page} onClick={() => setPage((v) => v - 1)}>{t('insights.previous')}</button><span>{page + 1}/{Math.ceil(selected.result.students.length / 30)}</span><button disabled={(page + 1) * 30 >= selected.result.students.length} onClick={() => setPage((v) => v + 1)}>{t('insights.next')}</button></nav>}
        </>}
      </> : <p>{t('insights.empty')}</p>}
    </>}
  </section>;
}
