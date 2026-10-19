'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeResync } from '@/lib/use-realtime-resync';
import { getLocale, type Language } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-provider';
import { schoolToday, shiftSchoolDate } from '@/lib/school-date.mjs';

type Role = 'parent' | 'teacher' | 'principal';
type EntryEvent = {
  id: string;
  event_type: 'check_in' | 'check_out';
  observed_at: string;
  received_at: string;
  sequence_state: 'in_order' | 'gap' | 'out_of_order';
  timestamp_quality: 'within_tolerance' | 'clock_uncertain';
  students?: {
    full_name?: string | null;
    roll_number?: string | null;
    class_id?: string | null;
    classes?: { grade?: string | null; division?: string | null } | null;
  } | null;
};
type DateRange = { from: string; to: string };
type ClassOption = { id: string; grade: string; division: string };

const PAGE_SIZE = 40;
const MAX_ROWS = 200;
const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

function schoolDayStartIso(day: string, timeZone: string) {
  const [year, month, date] = day.split('-').map(Number);
  const wanted = Date.UTC(year, month - 1, date);
  let candidate = wanted;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    candidate += wanted - represented;
  }
  return new Date(candidate).toISOString();
}

function formatDateTime(value: string, language: Language, timeZone: string) {
  return new Date(value).toLocaleString(getLocale(language), {
    dateStyle: 'medium', timeStyle: 'short', timeZone,
  });
}

export function SchoolEntryPanel({
  role,
  profileId,
  schoolId,
  child,
  classes = [],
  classId = '',
  onClassChange,
}: {
  role: Role;
  profileId: string;
  schoolId: string;
  child?: { id: string; full_name: string } | null;
  classes?: ClassOption[];
  classId?: string;
  onClassChange?: (classId: string) => void;
}) {
  const db = useMemo(() => createClient(), []);
  const { language, t } = useI18n();
  const initialEndDate = schoolToday(new Date(), DEFAULT_TIME_ZONE);
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [rangeDraft, setRangeDraft] = useState<DateRange>({ from: shiftSchoolDate(initialEndDate, -6), to: initialEndDate });
  const [range, setRange] = useState<DateRange>({ from: shiftSchoolDate(initialEndDate, -6), to: initialEndDate });
  const [eventType, setEventType] = useState('all');
  const [events, setEvents] = useState<EntryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [checkIns, setCheckIns] = useState(0);
  const [checkOuts, setCheckOuts] = useState(0);
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const loadedCount = useRef(0);
  const filtersTouched = useRef(false);
  const [loadedContext, setLoadedContext] = useState('');
  const currentContext = role === 'parent' ? child?.id || '' : role === 'teacher' ? classId : schoolId;
  const contextKey = `${role}:${profileId}:${currentContext}:${range.from}:${range.to}:${eventType}`;

  useEffect(() => {
    let active = true;
    db.from('schools').select('timezone').eq('id', schoolId).maybeSingle().then(({ data }) => {
      if (!active || !data?.timezone) return;
      try {
        new Intl.DateTimeFormat('en', { timeZone: data.timezone });
      } catch {
        return;
      }
      setTimeZone(data.timezone);
      if (!filtersTouched.current) {
        const end = schoolToday(new Date(), data.timezone);
        const nextRange = { from: shiftSchoolDate(end, -6), to: end };
        setRangeDraft(nextRange);
        setRange(nextRange);
      }
    });
    return () => { active = false; };
  }, [db, schoolId]);

  const fetchPage = useCallback(async (append: boolean) => {
    if (append && inFlight.current) return;
    if ((role === 'parent' && !child?.id) || (role === 'teacher' && !classId)) {
      setEvents([]); setTotal(0); setCheckIns(0); setCheckOuts(0); setLoading(false); return;
    }
    const id = ++requestId.current;
    const offset = append ? loadedCount.current : 0;
    if (offset >= MAX_ROWS) return;
    if (append) inFlight.current = true;
    if (append) setLoadingMore(true); else { setLoading(true); setError(''); }
    let studentIds: string[] = [];
    if (role === 'teacher') {
      const roster = await db.from('students').select('id').eq('class_id', classId).eq('active', true);
      if (id !== requestId.current) { if (append) inFlight.current = false; return; }
      if (roster.error) { setError(t('entry.loadError')); setLoading(false); if (append) inFlight.current = false; return; }
      studentIds = (roster.data || []).map((row: { id: string }) => row.id);
      if (!studentIds.length) { setEvents([]); setTotal(0); setLoading(false); loadedCount.current = 0; if (append) inFlight.current = false; return; }
    }
    let query = db.from('school_entry_events')
      .select('id,event_type,observed_at,received_at,sequence_state,timestamp_quality,students!school_entry_events_student_id_fkey!inner(full_name,roll_number,class_id,classes(grade,division))', { count: 'exact' })
      .gte('received_at', schoolDayStartIso(range.from, timeZone))
      .lt('received_at', schoolDayStartIso(shiftSchoolDate(range.to, 1), timeZone))
      .order('received_at', { ascending: false })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, MAX_ROWS - 1));
    if (role === 'parent') query = query.eq('student_id', child!.id);
    if (role === 'teacher') query = query.in('student_id', studentIds);
    if (role === 'principal') query = query.eq('school_id', schoolId);
    if (eventType !== 'all') query = query.eq('event_type', eventType);
    const countType = (type: 'check_in' | 'check_out') => {
      let countQuery = db.from('school_entry_events').select('id', { count: 'exact', head: true })
        .gte('received_at', schoolDayStartIso(range.from, timeZone))
        .lt('received_at', schoolDayStartIso(shiftSchoolDate(range.to, 1), timeZone))
        .eq('event_type', type);
      if (role === 'teacher') countQuery = countQuery.in('student_id', studentIds);
      if (role === 'principal') countQuery = countQuery.eq('school_id', schoolId);
      return countQuery;
    };
    const [result, inResult, outResult] = await Promise.all([
      query,
      role === 'parent' ? Promise.resolve({ count: null, error: null }) : countType('check_in'),
      role === 'parent' ? Promise.resolve({ count: null, error: null }) : countType('check_out'),
    ]);
    if (id === requestId.current) {
      if (result.error) setError(t('entry.loadError'));
      else {
        const nextEvents = (result.data || []) as EntryEvent[];
        setEvents((previous) => append ? [...previous, ...nextEvents] : nextEvents);
        loadedCount.current = offset + nextEvents.length;
        setLoadedContext(contextKey);
        setTotal(result.count || 0);
        if (role !== 'parent') { setCheckIns(inResult.count || 0); setCheckOuts(outResult.count || 0); }
        setError('');
      }
      setLoading(false); setLoadingMore(false);
    }
    if (append) inFlight.current = false;
  }, [db, role, child, classId, schoolId, range.from, range.to, eventType, t, contextKey, timeZone]);

  const refresh = useCallback(() => fetchPage(false), [fetchPage]);
  const { connectionState } = useRealtimeResync(refresh);
  useEffect(() => {
    requestId.current++;
    loadedCount.current = 0;
    const timer = window.setTimeout(() => { void fetchPage(false); }, 0);
    return () => window.clearTimeout(timer);
  }, [contextKey, fetchPage]);
  const submitFilters = (event: React.FormEvent) => {
    event.preventDefault();
    if (!rangeDraft.from || !rangeDraft.to || rangeDraft.from > rangeDraft.to) { setError(t('entry.invalidDates')); return; }
    filtersTouched.current = true;
    setRange(rangeDraft);
  };
  const title = role === 'parent' ? t('entry.parentTitle') : role === 'teacher' ? t('entry.teacherTitle') : t('entry.principalTitle');
  const description = role === 'parent'
    ? t('entry.parentDescription', { name: child?.full_name || t('entry.selectedChild') })
    : role === 'teacher' ? t('entry.teacherDescription') : t('entry.principalDescription');
  const hasMore = events.length < Math.min(total, MAX_ROWS);
  const visibleEvents = useMemo(() => loadedContext === contextKey ? events : [], [events, loadedContext, contextKey]);

  return (
    <section className="school-entry-panel" aria-labelledby="school-entry-heading" data-testid="school-entry-panel" data-connection-state={connectionState} data-loaded={loadedContext === contextKey && !loading}>
      <header className="school-entry-header">
        <div><p className="eyebrow">{t('entry.eyebrow')}</p><h2 id="school-entry-heading">{title}</h2><p>{description}</p></div>
        <button type="button" className="secondary school-entry-refresh" onClick={() => void fetchPage(false)} disabled={loading}>
          {loading ? t('entry.refreshing') : t('entry.refresh')}
        </button>
      </header>
      <p className="school-entry-note">{t('entry.disclaimer')}</p>
      {connectionState !== 'online' && <p className="school-entry-connection" role="status">{t('entry.offline')}</p>}
      {role === 'teacher' && <label className="school-entry-control">{t('entry.class')}
        <select value={classId} onChange={(event) => onClassChange?.(event.target.value)} disabled={!classes.length}>
          {classes.map((item) => <option key={item.id} value={item.id}>{t('entry.grade', { grade: item.grade, division: item.division })}</option>)}
        </select>
      </label>}
      <form className="school-entry-filters" onSubmit={submitFilters}>
        <label className="school-entry-control">{t('entry.from')}<input type="date" value={rangeDraft.from} onChange={(event) => { filtersTouched.current = true; setRangeDraft((draft) => ({ ...draft, from: event.target.value })); }} /></label>
        <label className="school-entry-control">{t('entry.to')}<input type="date" value={rangeDraft.to} onChange={(event) => { filtersTouched.current = true; setRangeDraft((draft) => ({ ...draft, to: event.target.value })); }} /></label>
        <label className="school-entry-control">{t('entry.eventType')}<select value={eventType} onChange={(event) => setEventType(event.target.value)}>
          <option value="all">{t('entry.allTypes')}</option><option value="check_in">{t('entry.checkIn')}</option><option value="check_out">{t('entry.checkOut')}</option>
        </select></label>
        <button type="submit" className="primary">{t('entry.apply')}</button>
      </form>
      {role !== 'parent' && <div className="school-entry-totals" aria-label={t('entry.totalsLabel')}>
        <div><span>{t('entry.checkIns')}</span><b>{loading ? '—' : checkIns}</b></div><div><span>{t('entry.checkOuts')}</span><b>{loading ? '—' : checkOuts}</b></div>
        <small>{t('entry.periodLabel', { from: range.from, to: range.to })}</small>
      </div>}
      {error && <p className="error" role="alert">{error}</p>}
      {!error && (loading ? <div className="school-entry-loading" role="status">{t('entry.loading')}</div> : !currentContext ? <p className="empty compact-empty">{role === 'parent' ? t('entry.noChild') : role === 'teacher' ? t('entry.noClass') : t('entry.noEvents')}</p> : visibleEvents.length === 0 ? <div className="school-entry-empty"><span aria-hidden="true">⌁</span><b>{t('entry.emptyTitle')}</b><p>{t('entry.emptyBody')}</p></div> : (
        <>
          <p className="school-entry-count" aria-live="polite">{t('entry.showing', { shown: visibleEvents.length, total })}</p>
          <ol className="school-entry-list">
            {visibleEvents.map((item) => {
              const received = new Date(item.received_at).getTime();
              const observed = new Date(item.observed_at).getTime();
              const delayed = item.timestamp_quality === 'clock_uncertain' || Math.abs(received - observed) > 5 * 60 * 1000;
              const student = item.students;
              const grade = student?.classes?.grade && student.classes.division ? t('entry.grade', { grade: student.classes.grade, division: student.classes.division }) : '';
              const checkpoint = t('entry.checkpoint');
              return <li key={item.id} className={`school-entry-event ${item.event_type}`}>
                <div className="school-entry-event-mark" aria-hidden="true">{item.event_type === 'check_in' ? '↘' : '↗'}</div>
                <div className="school-entry-event-main">
                  <div className="school-entry-event-title">
                    <strong>{role !== 'parent' ? student?.full_name || t('entry.studentUnknown') : item.event_type === 'check_in' ? t('entry.checkIn') : t('entry.checkOut')}</strong>
                    {role !== 'parent' && grade && <span>{grade}{student?.roll_number ? ` · ${t('entry.roll', { roll: student.roll_number })}` : ''}</span>}
                    {role !== 'parent' && <span className={`school-entry-event-type ${item.event_type}`}>{item.event_type === 'check_in' ? t('entry.checkIn') : t('entry.checkOut')}</span>}
                  </div>
                  <p>{checkpoint}{item.sequence_state !== 'in_order' ? ` · ${item.sequence_state === 'gap' ? t('entry.sequenceGap') : t('entry.outOfOrder')}` : ''}</p>
                  <div className="school-entry-times"><span>{t('entry.scanTime')}: <time dateTime={item.observed_at}>{formatDateTime(item.observed_at, language, timeZone)}</time></span>
                    {delayed && <span className="school-entry-delayed">{t('entry.delayed')}</span>}
                    {delayed && <small>{t('entry.receivedTime')}: <time dateTime={item.received_at}>{formatDateTime(item.received_at, language, timeZone)}</time></small>}
                  </div>
                </div>
              </li>;
            })}
          </ol>
          {hasMore && events.length < MAX_ROWS && <button type="button" className="secondary school-entry-more" onClick={() => void fetchPage(true)} disabled={loadingMore}>{loadingMore ? t('entry.loadingMore') : t('entry.loadMore')}</button>}
        </>
      ))}
    </section>
  );
}
