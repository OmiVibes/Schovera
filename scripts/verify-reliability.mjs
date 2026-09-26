import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { formatSchoolDate, schoolToday, shiftSchoolDate } from '../src/lib/school-date.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
if (!url || !serviceKey || !publishableKey) throw new Error('Required Supabase environment configuration is missing.');
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = randomUUID().slice(0, 8);
const noticeKeys = [randomUUID(), randomUUID()];
const timetableKeys = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const temporary = { announcements: new Set(), timetableIds: new Set(), schools: new Set() };
const authenticatedClients = [];
const expect = (value, message) => { if (!value) throw new Error(message); };
const must = async (result) => { const { data, error } = await result; if (error) throw error; return data; };

async function login(email) {
  const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  authenticatedClients.push(client);
  return client;
}

function chooseSlot(entries, weekday, classId, teacherId) {
  for (let period = 20; period >= 1; period -= 1) {
    if (entries.some((entry) => entry.class_id === classId && entry.period_number === period)) continue;
    for (let start = 6 * 60; start <= 19 * 60; start += 10) {
      const end = start + 40;
      const overlaps = entries.some((entry) => {
        if (entry.weekday !== weekday || (entry.class_id !== classId && entry.teacher_id !== teacherId)) return false;
        const entryStart = Number(entry.start_time.slice(0, 2)) * 60 + Number(entry.start_time.slice(3, 5));
        const entryEnd = Number(entry.end_time.slice(0, 2)) * 60 + Number(entry.end_time.slice(3, 5));
        return entryStart < end && start < entryEnd;
      });
      if (!overlaps) return { period, start: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`, end: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` };
    }
  }
  throw new Error(`No safe temporary timetable slot was available for weekday ${weekday}.`);
}

try {
  const profiles = await must(admin.from('profiles').select('id,email,school_id').in('email', ['principal@schovera.demo', 'teacher@schovera.demo', 'parent@schovera.demo']));
  const principalProfile = profiles.find((row) => row.email === 'principal@schovera.demo');
  const teacherProfile = profiles.find((row) => row.email === 'teacher@schovera.demo');
  const parentProfile = profiles.find((row) => row.email === 'parent@schovera.demo');
  expect(principalProfile && teacherProfile && parentProfile, 'Demo Principal, Teacher, or Parent profile is missing.');
  const [principal, principalSecondSession, teacher, parent] = await Promise.all([
    login(principalProfile.email), login(principalProfile.email), login(teacherProfile.email), login('parent@schovera.demo'),
  ]);

  const noticeTitle = `Reliability notice ${suffix}`;
  const noticeBody = `One logical notice request ${suffix}.`;
  const noticePayload = { p_title: noticeTitle, p_body: noticeBody, p_priority: 'normal', p_client_request_id: noticeKeys[0] };
  const firstNotice = await principal.rpc('publish_announcement', noticePayload);
  if (firstNotice.error) throw firstNotice.error;
  temporary.announcements.add(firstNotice.data);
  const retriedNotice = await principal.rpc('publish_announcement', noticePayload);
  if (retriedNotice.error) throw retriedNotice.error;
  expect(retriedNotice.data === firstNotice.data, 'Same-key notice retry returned a different row.');

  const concurrentNotices = await Promise.all([
    principal.rpc('publish_announcement', noticePayload),
    principalSecondSession.rpc('publish_announcement', noticePayload),
  ]);
  for (const response of concurrentNotices) if (response.error) throw response.error;
  expect(concurrentNotices.every((response) => response.data === firstNotice.data), 'Concurrent same-key notice requests did not converge to one row.');

  const changedPayload = await principal.rpc('publish_announcement', { ...noticePayload, p_body: `${noticeBody} changed` });
  expect(Boolean(changedPayload.error) && /idempotency conflict/i.test(changedPayload.error.message), 'Changed payload reused a notice request key.');
  const intentionalRepeat = await principal.rpc('publish_announcement', { ...noticePayload, p_client_request_id: noticeKeys[1] });
  if (intentionalRepeat.error) throw intentionalRepeat.error;
  temporary.announcements.add(intentionalRepeat.data);
  expect(intentionalRepeat.data !== firstNotice.data, 'A new request key did not create an intentional identical notice.');
  const noticeRows = await must(admin.from('announcements').select('id').in('id', [...temporary.announcements]));
  expect(noticeRows.length === 2, 'Expected exactly one row for each distinct logical notice action.');
  const noticeAudits = await must(admin.from('audit_events').select('id,target_id').eq('event_type', 'announcement_published').in('target_id', [...temporary.announcements]));
  expect(noticeAudits.length === 2 && new Set(noticeAudits.map((row) => row.target_id)).size === 2, 'Notice retries duplicated or omitted an audit event.');
  const noticeTruth = await must(admin.from('announcements').select('id,school_id,created_by').in('id', [...temporary.announcements]));
  expect(noticeTruth.every((row) => row.school_id === principalProfile.school_id && row.created_by === principalProfile.id), 'Notice RPC did not derive its school and creator from authenticated Principal identity.');
  for (const client of [principal, teacher, parent]) {
    const visible = await must(client.from('announcements').select('id').in('id', [...temporary.announcements]));
    expect(visible.length === 2, 'An authorized school role did not see each notice exactly once.');
  }
  for (const client of [teacher, parent]) {
    const denied = await client.rpc('publish_announcement', { ...noticePayload, p_client_request_id: randomUUID() });
    expect(Boolean(denied.error), 'Teacher or Parent bypassed notice publishing authorization.');
  }
  const foreignSchool = await must(admin.from('schools').insert({ name: `Reliability isolated ${suffix}`, code: `REL-${suffix}` }).select('id').single());
  temporary.schools.add(foreignSchool.id);
  const directNoticeAttempts = await Promise.all([
    teacher.from('announcements').insert({ school_id: teacherProfile.school_id, created_by: teacherProfile.id, title: `Direct write ${suffix}`, body: 'Teacher must not write a notice.' }).select('id'),
    parent.from('announcements').insert({ school_id: parentProfile.school_id, created_by: parentProfile.id, title: `Direct write ${suffix}`, body: 'Parent must not write a notice.' }).select('id'),
    principal.from('announcements').insert({ school_id: foreignSchool.id, created_by: principalProfile.id, title: `Cross-school ${suffix}`, body: 'Principal must not write cross-school notice.' }).select('id'),
  ]);
  for (const response of directNoticeAttempts) {
    if (response.data?.length) response.data.forEach((row) => temporary.announcements.add(row.id));
    expect(Boolean(response.error), 'An authenticated direct announcement table write bypassed the publish RPC authority.');
  }

  const assignment = await must(admin.from('teacher_class_assignments').select('class_id').eq('teacher_id', teacherProfile.id).is('ended_at', null).limit(1).single());
  const classId = assignment.class_id;
  const existingEntries = await must(admin.from('timetable_entries').select('class_id,teacher_id,weekday,period_number,start_time,end_time').in('weekday', [1, 6]));
  const saturdaySlot = chooseSlot(existingEntries, 6, classId, teacherProfile.id);
  const mondaySlot = chooseSlot(existingEntries, 1, classId, teacherProfile.id);
  const buildTimetablePayload = (weekday, slot, requestId) => ({
    p_entry_id: null, p_class_id: classId, p_teacher_id: teacherProfile.id, p_weekday: weekday,
    p_period_number: slot.period, p_subject: `Reliability ${suffix}`, p_start_time: slot.start,
    p_end_time: slot.end, p_room: null, p_client_request_id: requestId,
  });
  const saturdayPayload = buildTimetablePayload(6, saturdaySlot, timetableKeys[0]);
  const concurrentEntries = await Promise.all([
    principal.rpc('save_timetable_entry', saturdayPayload),
    principalSecondSession.rpc('save_timetable_entry', saturdayPayload),
  ]);
  for (const response of concurrentEntries) if (response.error) throw response.error;
  expect(concurrentEntries[0].data === concurrentEntries[1].data, 'Concurrent same-key timetable creates did not converge.');
  const entryId = concurrentEntries[0].data;
  temporary.timetableIds.add(entryId);
  expect((await must(admin.from('timetable_entries').select('id').eq('id', entryId))).length === 1, 'Concurrent timetable create made duplicate rows.');
  const withFirstEntry = [...existingEntries, { class_id: classId, teacher_id: teacherProfile.id, weekday: 6, period_number: saturdaySlot.period, start_time: saturdaySlot.start, end_time: saturdaySlot.end }];
  const overlapSlot = chooseSlot(withFirstEntry, 6, classId, teacherProfile.id);
  const secondPeriod = Array.from({ length: 20 }, (_, index) => 20 - index).find((period) => period !== overlapSlot.period && !withFirstEntry.some((entry) => entry.class_id === classId && entry.weekday === 6 && entry.period_number === period));
  expect(secondPeriod, 'Could not find two distinct free Saturday period numbers for concurrency test.');
  const racingCreates = await Promise.all([
    principal.rpc('save_timetable_entry', buildTimetablePayload(6, overlapSlot, timetableKeys[2])),
    principalSecondSession.rpc('save_timetable_entry', { ...buildTimetablePayload(6, overlapSlot, timetableKeys[3]), p_period_number: secondPeriod }),
  ]);
  expect(racingCreates.filter((response) => !response.error).length === 1, 'Conflicting concurrent timetable slots were not serialized.');
  for (const response of racingCreates) if (!response.error) temporary.timetableIds.add(response.data);
  const changedCreate = await principal.rpc('save_timetable_entry', { ...saturdayPayload, p_subject: 'Changed payload' });
  expect(Boolean(changedCreate.error) && /idempotency conflict/i.test(changedCreate.error.message), 'Timetable create key accepted a changed payload.');
  const sunday = await principal.rpc('save_timetable_entry', { ...saturdayPayload, p_weekday: 7, p_client_request_id: randomUUID() });
  expect(Boolean(sunday.error), 'Sunday timetable entry was accepted.');

  const mondayPayload = buildTimetablePayload(1, mondaySlot, timetableKeys[1]);
  const monday = await principal.rpc('save_timetable_entry', mondayPayload);
  if (monday.error) throw monday.error;
  temporary.timetableIds.add(monday.data);
  expect((await must(admin.from('timetable_entries').select('weekday').eq('id', monday.data).single())).weekday === 1, 'Monday timetable boundary was rejected.');
  const crossSchoolMutation = await principal.rpc('save_timetable_entry', { ...mondayPayload, p_class_id: randomUUID(), p_client_request_id: randomUUID() });
  expect(Boolean(crossSchoolMutation.error), 'Principal created a timetable entry outside the authenticated school.');

  const beforeEdit = await must(admin.from('timetable_entries').select('updated_at').eq('id', entryId).single());
  const editPayload = { ...saturdayPayload, p_entry_id: entryId, p_client_request_id: null, p_subject: `Edited ${suffix}`, p_expected_updated_at: beforeEdit.updated_at };
  const edit = await principal.rpc('save_timetable_entry', editPayload);
  if (edit.error) throw edit.error;
  const retryEdit = await principalSecondSession.rpc('save_timetable_entry', editPayload);
  if (retryEdit.error) throw retryEdit.error;
  const afterEdit = await must(admin.from('timetable_entries').select('subject,updated_at').eq('id', entryId).single());
  expect(afterEdit.subject === editPayload.p_subject && afterEdit.updated_at !== beforeEdit.updated_at, 'Timetable edit did not persist or advance its version.');
  const editAudits = await must(admin.from('audit_events').select('id').eq('event_type', 'timetable_entry_updated').eq('target_id', entryId));
  expect(editAudits.length === 1, 'Same-edit retry duplicated a timetable audit.');
  const staleEdit = await principalSecondSession.rpc('save_timetable_entry', { ...editPayload, p_subject: `Stale ${suffix}` });
  expect(Boolean(staleEdit.error) && /changed/i.test(staleEdit.error.message), 'A stale competing timetable edit overwrote current data.');

  const removed = await principal.rpc('delete_timetable_entry', { p_entry_id: entryId });
  if (removed.error) throw removed.error;
  const retryDelete = await principalSecondSession.rpc('delete_timetable_entry', { p_entry_id: entryId });
  if (retryDelete.error) throw retryDelete.error;
  const deleteAudits = await must(admin.from('audit_events').select('id').eq('event_type', 'timetable_entry_deleted').eq('target_id', entryId));
  expect(deleteAudits.length === 1 && !(await must(admin.from('timetable_entries').select('id').eq('id', entryId))).length, 'Delete retry did not converge to one audit and an absent row.');

  const [parentWrite, teacherWrite] = await Promise.all([
    parent.rpc('save_timetable_entry', saturdayPayload), teacher.rpc('delete_timetable_entry', { p_entry_id: monday.data }),
  ]);
  expect(Boolean(parentWrite.error) && Boolean(teacherWrite.error), 'Non-Principal timetable mutation was accepted.');

  const school = await must(admin.from('schools').select('timezone').eq('id', teacherProfile.school_id).single());
  const localToday = schoolToday(new Date(), school.timezone);
  const activeStudents = await must(admin.from('students').select('id').eq('class_id', classId).eq('school_id', teacherProfile.school_id).eq('active', true));
  const futureAttendance = await teacher.rpc('save_class_attendance', {
    p_class_id: classId,
    p_attendance_date: shiftSchoolDate(localToday, 1),
    p_records: activeStudents.map(({ id }) => ({ student_id: id, status: 'present' })),
  });
  expect(Boolean(futureAttendance.error) && /invalid attendance date/i.test(futureAttendance.error.message), 'School-local future attendance date was accepted.');
  console.log('Reliability verification passed: notice retries/audits/roles, timetable create/edit/delete concurrency and weekdays, and deterministic India school-date boundaries.');
} finally {
  const noticeIds = new Set(temporary.announcements);
  const requestNotices = await must(admin.from('announcements').select('id').in('client_request_id', noticeKeys));
  requestNotices.forEach((row) => noticeIds.add(row.id));
  if (noticeIds.size) {
    const ids = [...noticeIds];
    await must(admin.from('audit_events').delete().in('target_id', ids));
    await must(admin.from('announcements').delete().in('id', ids));
  }
  const requestEntries = await must(admin.from('timetable_entries').select('id').in('client_request_id', timetableKeys));
  requestEntries.forEach((row) => temporary.timetableIds.add(row.id));
  if (temporary.timetableIds.size) {
    const ids = [...temporary.timetableIds];
    await must(admin.from('audit_events').delete().in('target_id', ids));
    await must(admin.from('timetable_entries').delete().in('id', ids));
  }
  if (temporary.schools.size) await must(admin.from('schools').delete().in('id', [...temporary.schools]));
  await Promise.all(authenticatedClients.map((client) => client.realtime.disconnect()));

  const cases = [
    ['2026-09-26T18:29:00Z', '2026-09-26'], // 23:59 IST
    ['2026-09-26T18:31:00Z', '2026-09-27'], // 00:01 IST
    ['2026-09-26T19:00:00Z', '2026-09-27'], // 00:30 IST
    ['2026-09-26T23:59:00Z', '2026-09-27'], // 05:29 IST
    ['2026-09-27T00:00:00Z', '2026-09-27'], // 05:30 IST
    ['2026-09-27T06:30:00Z', '2026-09-27'], // 12:00 IST
    ['2026-02-28T18:31:00Z', '2026-03-01'], // month end
    ['2026-12-31T18:30:00Z', '2027-01-01'], // year end
  ];
  for (const [instant, expected] of cases) expect(schoolToday(new Date(instant)) === expected, `School date boundary failed for ${instant}.`);
  const dateLabel = formatSchoolDate('2027-01-01', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Pacific/Honolulu' });
  expect(dateLabel.includes('2027') && dateLabel.includes('01'), 'Calendar-date display shifted across the year boundary.');
  console.log('School-local date helper passed IST midnight, 05:30, month-end, and year-end cases.');
}
