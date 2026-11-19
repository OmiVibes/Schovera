'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUiText } from '@/components/ui-text';
import { parseProposalPage, proposalSchema, type TimetableProposal } from '@/lib/timetable-proposals';
import { useRealtimeResync } from '@/lib/use-realtime-resync';
import { classDisplay } from '@/lib/class-display';

type Profile = { id: string; school_id: string; role: 'teacher' | 'principal' | 'parent' };
type Period = { id: string; updated_at: string; weekday: number; period_number: number; subject: string; start_time: string; end_time: string; room: string | null };
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const blank = { entry: '', version: '', subject: '', day: '1', period: '1', start: '09:00', end: '09:45', room: '', reason: '' };

/** A class-keyed instance prevents a response/draft crossing class contexts. */
export function TimetableProposals({ profile, classId, onPublished }: { profile: Profile; classId: string; onPublished?: () => void }) {
  return <ProposalWorkspace key={profile.id + ':' + classId} profile={profile} classId={classId} onPublished={onPublished} />;
}
function ProposalWorkspace({ profile, classId, onPublished }: { profile: Profile; classId: string; onPublished?: () => void }) {
  const ui = useUiText(); const db = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<TimetableProposal[]>([]), [periods, setPeriods] = useState<Period[]>([]);
  const [filter, setFilter] = useState('pending'), [more, setMore] = useState(false), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const [form, setForm] = useState(blank), [reasons, setReasons] = useState<Record<string, string>>({});
  const request = useRef<{ payload: string; id: string } | null>(null);
  const generation = useRef(0), mounted = useRef(false), locked = useRef(false);
  const invalidate = useCallback(() => { generation.current += 1; }, []);
  const teacher = profile.role === 'teacher';
  const load = useCallback(async (cursor?: TimetableProposal) => {
    const version = ++generation.current; setLoading(true); setError('');
    try {
      const result = await db.rpc('timetable_proposal_page', { p_state: filter || null, p_class_id: teacher ? null : classId,
        p_before_created_at: cursor?.created_at ?? null, p_before_id: cursor?.id ?? null, p_limit: 5 });
      if (result.error) throw result.error;
      const page = parseProposalPage(result.data, profile.school_id, teacher ? profile.id : undefined, teacher ? undefined : classId);
      if (mounted.current && generation.current === version) {
        setRows(previous => cursor ? [...previous, ...page.items.filter(p => !previous.some(old => old.id === p.id))] : page.items);
        setMore(page.has_more);
      }
    } catch { if (mounted.current && generation.current === version) setError('Proposals could not be loaded. Refresh when connected.'); }
    finally { if (mounted.current && generation.current === version) setLoading(false); }
  }, [db, filter, classId, profile.id, profile.school_id, teacher]);
  useEffect(() => {
    mounted.current = true; const timer = setTimeout(() => { void load(); }, 0);
    return () => { mounted.current = false; invalidate(); clearTimeout(timer); };
  }, [load, invalidate]);
  useEffect(() => {
    if (!teacher || !classId) return;
    let active = true;
    void db.from('timetable_entries').select('id,updated_at,weekday,period_number,subject,start_time,end_time,room')
      .eq('class_id', classId).eq('teacher_id', profile.id).order('weekday').order('start_time').then(result => {
        if (active) setPeriods(result.data ?? []);
      });
    return () => { active = false; };
  }, [db, classId, profile.id, teacher, note]);
  useRealtimeResync(() => load());
  const act = async (work: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, success: string | ((proposal: TimetableProposal) => string), published = false) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNote('');
    try {
      const result = await work(); if (result.error) throw result.error;
      const receipt = proposalSchema.parse(result.data);
      if (receipt.school_id !== profile.school_id || (teacher ? receipt.proposed_by !== profile.id : receipt.class_id !== classId)) throw Error('Invalid proposal response');
      if (!mounted.current) return;
      setNote(typeof success === 'function' ? success(receipt) : success); if (published) onPublished?.(); await load();
    } catch (failure) {
      if (mounted.current) {
        const message = failure && typeof failure === 'object' && 'message' in failure ? String(failure.message) : '';
        setError(/Stale proposal/.test(message) ? 'This published period changed. Withdraw this proposal and submit a new version.'
          : /conflict/i.test(message) ? 'The proposal conflicts with the current timetable. Nothing was published.'
          : /no longer pending/.test(message) ? 'This proposal was already decided. Refresh its status.'
          : 'No confirmation was received. Refresh the status or retry the same action.');
      }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  if ((!classId && !teacher) || profile.role === 'parent') return null;
  return <section className="card timetable-proposals" aria-label={ui('Timetable proposals')}>
    <div className="section-heading"><div><h3>{ui('Timetable proposals')}</h3><p className="hint">{ui(teacher
      ? 'Propose your own periods for this class. Only Principal approval publishes a change.'
      : 'Review Teacher proposals against the current schedule. Direct administration is also available on this page.')}</p></div></div>
    {teacher && classId && <form className="timetable-form" aria-label={ui('Propose a timetable change')} onSubmit={event => {
      event.preventDefault();
      if (form.reason.trim().split(/\s+/).length < 2 || form.start >= form.end) { setError('Enter a short reason and an end time after the start.'); return; }
      const payload = { p_class_id: classId, p_entry_id: form.entry || null, p_expected_updated_at: form.version || null,
        p_subject: form.subject.trim(), p_weekday: Number(form.day), p_period_number: Number(form.period),
        p_start_time: form.start, p_end_time: form.end, p_room: form.room.trim() || null, p_reason: form.reason.trim() };
      const key = JSON.stringify(payload);
      if (request.current?.payload !== key) request.current = { payload: key, id: crypto.randomUUID() };
      const requestId = request.current.id;
      void act(() => db.rpc('submit_timetable_proposal', { ...payload, p_client_request_id: requestId }), receipt => receipt.status === 'pending'
        ? 'Proposal submitted. The published schedule is unchanged.' : 'This proposal was already decided. Refresh its status.');
    }}>
      <h4>{ui('Propose a timetable change')}</h4>
      <label>{ui('Published period')}<select aria-label={ui('Published period')} disabled={busy} value={form.entry} onChange={e => {
        const row = periods.find(p => p.id === e.target.value); request.current = null;
        setForm(row ? { entry: row.id, version: row.updated_at, subject: row.subject, day: String(row.weekday), period: String(row.period_number), start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5), room: row.room ?? '', reason: '' } : blank);
      }}><option value="">{ui('Propose a new period')}</option>{periods.map(p => <option key={p.id} value={p.id}>{ui(days[p.weekday - 1])} · {p.period_number} · {p.subject}</option>)}</select></label>
      <label>{ui('Subject')}<input required minLength={2} maxLength={80} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></label>
      <div className="timetable-form-grid"><label>{ui('Day')}<select aria-label={ui('Day')} value={form.day} onChange={e => setForm({ ...form, day: e.target.value })}>{days.map((d, i) => <option key={d} value={i + 1}>{ui(d)}</option>)}</select></label>
        <label>{ui('Period')}<input required type="number" min={1} max={20} value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} /></label></div>
      <div className="timetable-form-grid"><label>{ui('Start')}<input required type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} /></label>
        <label>{ui('End')}<input required type="time" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} /></label></div>
      <label>{ui('Room (optional)')}<input maxLength={80} value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} /></label>
      <label>{ui('Reason for proposal')}<textarea required minLength={8} maxLength={500} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label>
      <p className="hint">{ui('Online submission only. Current assignments and conflicts are checked again before approval.')}</p>
      <button className="primary" disabled={busy}>{ui('Submit proposal')}</button>
    </form>}
    {teacher && <p className="hint">{ui('Your proposal history includes earlier classes. New proposals use the selected assigned class.')}</p>}
    <div className="button-row"><label>{ui('Proposal status')}<select aria-label={ui('Proposal status')} value={filter} disabled={busy} onChange={e => setFilter(e.target.value)}>
      <option value="pending">{ui('Pending')}</option><option value="">{ui('All proposal history')}</option>
      {['approved', 'rejected', 'withdrawn'].map(s => <option key={s} value={s}>{ui(s[0].toUpperCase() + s.slice(1))}</option>)}</select></label>
      <button type="button" disabled={busy || loading} onClick={() => { void load(); }}>{ui('Refresh proposals')}</button></div>
    {error && <p role="alert" className="error">{ui(error)}</p>}{note && <p role="status" className="success">{ui(note)}</p>}
    {loading && <p role="status">{ui('Loading proposals…')}</p>}
    {!loading && !error && !rows.length && <p className="empty compact-empty">{ui('No proposals in this view.')}</p>}
    <div className="proposal-list">{rows.map(p => <article className="notice" key={p.id} data-proposal-id={p.id}>
      <div className="section-heading"><h4>{p.subject}</h4><strong className="badge">{ui(p.status[0].toUpperCase() + p.status.slice(1))}</strong></div>
      <p>{p.proposer_name} · {classDisplay({ grade: p.class_grade, division: p.class_division }, ui)} · {ui(days[p.weekday - 1])} · {ui('Period')} {p.period_number} · {p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}{p.room ? ` · ${p.room}` : ''}</p>
      <p><b>{ui('Reason for proposal')}: </b>{p.reason}</p>
      <p className="hint">{ui(p.entry_id ? 'Change to a published period' : 'Proposed new period')} · {new Date(p.created_at).toLocaleString()}</p>
      {p.status === 'pending' ? teacher ? <button type="button" disabled={busy} onClick={() => { void act(() => db.rpc('withdraw_timetable_proposal', { p_proposal_id: p.id }), 'Proposal withdrawn. Nothing was published.'); }}>{ui('Withdraw proposal')}</button>
        : <div><label>{ui('Decision reason (optional)')}<textarea maxLength={500} value={reasons[p.id] ?? ''} onChange={e => setReasons({ ...reasons, [p.id]: e.target.value })} /></label><div className="button-row">
          {(['approved', 'rejected'] as const).map(decision => <button key={decision} type="button" className={decision === 'approved' ? 'primary' : 'secondary'} disabled={busy} onClick={() => { void act(() => db.rpc('decide_timetable_proposal', { p_proposal_id: p.id, p_decision: decision, p_reason: reasons[p.id] ?? '' }), decision === 'approved' ? 'Proposal approved and timetable published.' : 'Proposal rejected. Nothing was published.', decision === 'approved'); }}>{ui(decision === 'approved' ? 'Approve and publish' : 'Reject proposal')}</button>)}</div></div>
        : <p className="hint">{p.decider_name} · {p.decided_at && new Date(p.decided_at).toLocaleString()}{p.decision_reason ? ` · ${p.decision_reason}` : ''}</p>}
    </article>)}</div>
    {more && <button type="button" disabled={busy || loading} onClick={() => { void load(rows.at(-1)); }}>{ui('Load older proposals')}</button>}
  </section>;
}
