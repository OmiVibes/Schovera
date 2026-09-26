/* Browser-level missed-event acceptance test. Persisted rows are created through
 * authenticated RPCs while an already-open role session is genuinely offline. */
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
const baseUrl = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3000';
if (!url || !serviceKey || !publishableKey)
  throw new Error('Required Supabase environment configuration is missing.');

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const updateIds = [];
const assignmentIds = [];
const timetableIds = [];
const attendanceStudentIds = [];
const attendanceDates = [];
const attendanceAuditIds = [];
const temporaryStudentIds = [];
const observedSockets = new WeakMap();
const suffix = randomUUID().slice(0, 8);
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const must = async (result) => { const { data, error } = await result; if (error) throw error; return data; };
const schoolToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function signedIn(email) {
  const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function login(page, email, heading) {
  const sockets = [];
  observedSockets.set(page, sockets);
  const realtimeReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Realtime channel readiness was not observed for ${email}.`)), 20000);
    page.on('websocket', (socket) => {
      if (!socket.url().includes('/realtime/v1/websocket')) return;
      sockets.push(socket);
      socket.on('framereceived', (frame) => {
        const content = typeof frame.payload === 'string' ? frame.payload : '';
        if (content.includes('phx_reply') && content.includes('"status":"ok"')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  if (email === 'parent@schovera.demo')
    await page.locator('#parent-child-heading').waitFor({ state: 'visible', timeout: 15000 });
  else await page.getByText(heading).first().waitFor({ state: 'visible', timeout: 15000 });
  await realtimeReady;
}

async function restoreConnectivity(context, page) {
  await context.setOffline(false);
  // Playwright's offline emulation does not consistently emit the browser
  // online event or a websocket status transition. A real focus return is an
  // independent recovery signal supported by the application.
  const background = await context.newPage();
  await background.goto('about:blank');
  await page.bringToFront();
  await background.close();
}

async function waitForRealtimeSubscription(page, openProfile) {
  let timer;
  const readyListeners = [];
  let readyResolve;
  const onFrame = (frame) => {
    const content = typeof frame.payload === 'string' ? frame.payload : '';
    if (content.includes('phx_reply') && content.includes('"status":"ok"')) readyResolve();
  };
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    timer = setTimeout(() => reject(new Error('Student Profile Realtime subscription did not become ready.')), 15000);
  });
  for (const socket of observedSockets.get(page) || []) {
    socket.on('framereceived', onFrame);
    readyListeners.push(socket);
  }
  await openProfile();
  try { await ready; } finally {
    clearTimeout(timer);
    for (const socket of readyListeners) socket.off('framereceived', onFrame);
  }
}

async function sendUpdate(teacher, classId, studentId, title, importance = 'important') {
  const { data, error } = await teacher.rpc('send_student_update', {
    p_class_id: classId,
    p_student_id: studentId,
    p_category: 'general',
    p_title: title,
    p_message: `Reconnect acceptance record ${suffix}.`,
    p_importance: importance,
    p_client_request_id: randomUUID(),
  });
  if (error) throw error;
  updateIds.push(data);
  return data;
}

async function cleanup() {
  if (updateIds.length) {
    await must(admin.from('acknowledgements').delete().in('update_id', updateIds));
    await must(admin.from('audit_events').delete().in('target_id', updateIds));
    await must(admin.from('student_updates').delete().in('id', updateIds));
  }
  if (assignmentIds.length) {
    await must(admin.from('audit_events').delete().in('target_id', assignmentIds));
    await must(admin.from('class_assignments').delete().in('id', assignmentIds));
  }
  if (timetableIds.length) {
    await must(admin.from('audit_events').delete().in('target_id', timetableIds));
    await must(admin.from('timetable_entries').delete().in('id', timetableIds));
  }
  if (attendanceDates.length && attendanceStudentIds.length) {
    await must(admin.from('attendance_records').delete().in('student_id', attendanceStudentIds).in('attendance_date', attendanceDates));
    const attendanceLeftovers = await must(admin.from('attendance_records').select('id').in('student_id', attendanceStudentIds).in('attendance_date', attendanceDates));
    expect(attendanceLeftovers.length === 0, 'Temporary attendance records remain after cleanup.');
    if (attendanceAuditIds.length) await must(admin.from('audit_events').delete().in('id', attendanceAuditIds));
  }
  if (temporaryStudentIds.length) {
    await must(admin.from('parent_student_links').delete().in('student_id', temporaryStudentIds));
    await must(admin.from('students').delete().in('id', temporaryStudentIds));
  }
  const leftoverChecks = [
    ['student_updates', 'id', updateIds],
    ['acknowledgements', 'update_id', updateIds],
    ['class_assignments', 'id', assignmentIds],
    ['timetable_entries', 'id', timetableIds],
    ['students', 'id', temporaryStudentIds],
    ['parent_student_links', 'student_id', temporaryStudentIds],
    ['audit_events', 'target_id', [...updateIds, ...assignmentIds, ...timetableIds]],
    ['audit_events', 'id', attendanceAuditIds],
  ];
  for (const [table, column, ids] of leftoverChecks) {
    if (!ids.length) continue;
    const leftovers = await must(admin.from(table).select(column).in(column, ids));
    expect(leftovers.length === 0, `Temporary reconnect records remain in ${table}.`);
  }
}

let browser;
let teacherClient;
let parentClient;
let principalClient;
try {
  const profiles = await must(admin.from('profiles').select('id,email,full_name,school_id').in('email', ['teacher@schovera.demo', 'parent@schovera.demo', 'principal@schovera.demo']));
  const profile = (email) => profiles.find((row) => row.email === email);
  const teacherProfile = profile('teacher@schovera.demo');
  const parentProfile = profile('parent@schovera.demo');
  const principalProfile = profile('principal@schovera.demo');
  expect(teacherProfile && parentProfile && principalProfile, 'Demo role profiles are missing.');
  const assignment = await must(admin.from('teacher_class_assignments').select('class_id').eq('teacher_id', teacherProfile.id).is('ended_at', null).single());
  const student = await must(admin.from('students').select('id,full_name').eq('class_id', assignment.class_id).eq('full_name', 'Aarav Patil').single());
  const temporarySibling = await must(admin.from('students').insert({ school_id: parentProfile.school_id, class_id: assignment.class_id, roll_number: `R${suffix}`, full_name: `Reconnect Sibling ${suffix}` }).select('id,full_name').single());
  temporaryStudentIds.push(temporarySibling.id);
  await must(admin.from('parent_student_links').insert({ parent_id: parentProfile.id, student_id: temporarySibling.id, relationship_label: 'Parent', status: 'active' }));
  teacherClient = await signedIn(teacherProfile.email);
  parentClient = await signedIn(parentProfile.email);
  principalClient = await signedIn(principalProfile.email);

  browser = await chromium.launch({ headless: true });
  const teacherContext = await browser.newContext();
  const parentContext = await browser.newContext();
  const parentSecondContext = await browser.newContext();
  const principalContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  const parentPage = await parentContext.newPage();
  const parentSecondPage = await parentSecondContext.newPage();
  const principalPage = await principalContext.newPage();
  for (const [label, page] of [['teacher', teacherPage], ['parent', parentPage], ['principal', principalPage]]) {
    page.on('pageerror', (error) => console.error(`${label} page error: ${error.message}`));
  }
  await Promise.all([
    login(teacherPage, teacherProfile.email, 'Good morning'),
    login(parentPage, parentProfile.email, 'Aarav'),
    login(parentSecondPage, parentProfile.email, 'Aarav'),
    login(principalPage, principalProfile.email, 'Welcome'),
  ]);
  for (const page of [parentPage, parentSecondPage]) {
    const childSelect = page.locator('.child-switcher select');
    await childSelect.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.child-switcher select option')).some((option) => option.textContent?.trim() === 'Aarav Patil'), null, { timeout: 15000 });
    await childSelect.selectOption({ label: 'Aarav Patil' });
    await expect((await childSelect.locator('option:checked').textContent())?.trim() === 'Aarav Patil', 'Parent did not select Aarav Patil.');
    await page.locator('#parent-child-heading').getByText('Aarav Patil').waitFor({ state: 'visible', timeout: 15000 });
  }
  await teacherPage.getByRole('button', { name: 'Grade 7A' }).first().click();
  await teacherPage.getByRole('button', { name: /Aarav Patil/ }).first().click();
  await teacherPage.getByText('Recent communication').first().waitFor({ state: 'visible', timeout: 15000 });

  // Parent misses an Important update, then the online event must reconcile
  // persisted truth without a page reload.
  const parentTitle = `Reconnect parent important ${suffix}`;
  await parentContext.setOffline(true);
  const parentUpdateId = await sendUpdate(teacherClient, assignment.class_id, student.id, parentTitle);
  expect((await must(parentClient.from('student_updates').select('id').eq('id', parentUpdateId))).length === 1, 'Parent-authorized persisted query cannot see missed update.');
  await restoreConnectivity(parentContext, parentPage);
  console.log(`Parent returned online=${await parentPage.evaluate(() => navigator.onLine)}; selected=${await parentPage.locator('#parent-child-heading').innerText()}.`);
  await parentPage.getByText(parentTitle).first().waitFor({ state: 'visible', timeout: 20000 });
  await parentPage.locator('#parent-profile').getByText(parentTitle).waitFor({ state: 'visible', timeout: 20000 });
  await parentPage.locator('#parent-updates .update-card').filter({ hasText: parentTitle }).waitFor({ state: 'visible', timeout: 20000 });
  await parentPage.locator('.attention-panel .update-card').filter({ hasText: parentTitle }).waitFor({ state: 'visible', timeout: 20000 });
  console.log('Parent missed-update recovery passed.');
  const parentTimelineCopies = await parentPage.locator('#parent-updates .update-card').filter({ hasText: parentTitle }).count();
  console.log(`Important update appears in ${parentTimelineCopies} Parent timeline card(s).`);
  expect(parentTimelineCopies === 1, 'Important update is duplicated in the Parent timeline.');
  expect(await parentPage.locator('.attention-panel .update-card').filter({ hasText: parentTitle }).count() === 1, 'Important update is duplicated in the urgent Parent panel.');

  // Teacher misses the acknowledgement and must reconcile it after reconnect.
  const parentUpdate = updateIds.at(-1);
  await teacherContext.setOffline(true);
  const { error: acknowledgementError } = await parentClient.rpc('acknowledge_update', { p_update_id: parentUpdate });
  if (acknowledgementError) throw acknowledgementError;
  await restoreConnectivity(teacherContext, teacherPage);
  const teacherCard = teacherPage.locator('.update-card, .communication-card').filter({ hasText: parentTitle }).first();
  await teacherCard.getByText('Acknowledged').waitFor({ state: 'visible', timeout: 20000 });
  console.log('Teacher missed-acknowledgement recovery passed.');

  // An online second Parent tab acknowledges an update while the first tab is
  // disconnected. The first tab must reconcile to the shared persisted row.
  const secondTabTitle = `Reconnect second tab ${suffix}`;
  await parentContext.setOffline(true);
  const secondTabUpdate = await sendUpdate(teacherClient, assignment.class_id, student.id, secondTabTitle);
  await parentSecondPage.getByText(secondTabTitle).first().waitFor({ state: 'visible', timeout: 20000 });
  await parentSecondPage.getByRole('button', { name: `Acknowledge update: ${secondTabTitle}` }).first().click();
  await parentSecondPage.getByText('Acknowledged').first().waitFor({ state: 'visible', timeout: 15000 });
  await restoreConnectivity(parentContext, parentPage);
  await parentPage.getByText(secondTabTitle).first().waitFor({ state: 'visible', timeout: 15000 });
  await parentPage.locator('#parent-updates').getByText('Acknowledged').first().waitFor({ state: 'visible', timeout: 15000 });
  const secondTabAck = await must(admin.from('acknowledgements').select('id').eq('update_id', secondTabUpdate));
  expect(secondTabAck.length === 1, 'Second-tab acknowledgement was not persisted exactly once.');
  console.log('Parent second-tab recovery passed.');

  const flappingTitles = [`Reconnect flap first ${suffix}`, `Reconnect flap second ${suffix}`];
  await parentContext.setOffline(true);
  await sendUpdate(teacherClient, assignment.class_id, student.id, flappingTitles[0], 'normal');
  await restoreConnectivity(parentContext, parentPage);
  await parentContext.setOffline(true);
  await sendUpdate(teacherClient, assignment.class_id, student.id, flappingTitles[1], 'normal');
  await restoreConnectivity(parentContext, parentPage);
  for (const title of flappingTitles) {
    await parentPage.locator('#parent-updates').getByText(title).waitFor({ state: 'visible', timeout: 20000 });
    expect(await parentPage.locator('#parent-updates .update-card').filter({ hasText: title }).count() === 1, `Network flap duplicated or omitted ${title}.`);
  }
  console.log('Parent rapid offline/online flapping recovery passed.');

  await parentSecondPage.getByRole('button', { name: 'Sign out' }).click();
  await parentSecondPage.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 15000 });
  const postLogoutTitle = `Reconnect post logout ${suffix}`;
  await sendUpdate(teacherClient, assignment.class_id, student.id, postLogoutTitle, 'normal');
  expect(await parentSecondPage.getByText(postLogoutTitle).count() === 0, 'Logged-out Parent tab retained or received protected student communication.');
  console.log('Parent logout/channel teardown passed.');

  // Change selected Parent child while disconnected. Aarav's event must not
  // appear in the sibling's view, then must be present when Aarav is selected.
  await parentPage.locator('.child-switcher select').selectOption({ label: temporarySibling.full_name });
  await parentPage.locator('#parent-child-heading').getByText(temporarySibling.full_name).waitFor({ state: 'visible' });
  await parentContext.setOffline(true);
  const isolationTitle = `Reconnect sibling isolation ${suffix}`;
  await sendUpdate(teacherClient, assignment.class_id, student.id, isolationTitle, 'normal');
  await restoreConnectivity(parentContext, parentPage);
  await parentPage.locator('#parent-child-heading').getByText(temporarySibling.full_name).waitFor({ state: 'visible' });
  expect(await parentPage.getByText(isolationTitle).count() === 0, 'Aarav communication leaked into sibling Parent context.');
  await parentPage.locator('.child-switcher select').selectOption({ label: 'Aarav Patil' });
  await parentPage.getByText(isolationTitle).first().waitFor({ state: 'visible', timeout: 15000 });
  console.log('Parent multi-child isolation passed.');

  // Principal misses create + acknowledgement; one recovery query must show
  // final persisted truth rather than requiring event replay order.
  const principalTitle = `Reconnect principal final state ${suffix}`;
  await principalContext.setOffline(true);
  const principalUpdate = await sendUpdate(teacherClient, assignment.class_id, student.id, principalTitle);
  const { error: principalAcknowledgementError } = await parentClient.rpc('acknowledge_update', { p_update_id: principalUpdate });
  if (principalAcknowledgementError) throw principalAcknowledgementError;
  await restoreConnectivity(principalContext, principalPage);
  const principalCard = principalPage.locator('.principal-communication-card').filter({ hasText: principalTitle }).first();
  await principalCard.getByText('Acknowledged').waitFor({ state: 'visible', timeout: 20000 });
  console.log('Principal multi-event final-state recovery passed.');

  await waitForRealtimeSubscription(principalPage, async () => {
    await principalPage.locator('#principal-students input[type="search"]').fill('Aarav Patil');
    await principalPage.getByRole('button', { name: /Aarav Patil/ }).first().click();
    await principalPage.locator('#principal-profile .student-profile-grid').waitFor({ state: 'visible', timeout: 15000 });
  });
  const principalMetricValues = await principalPage.locator('.principal-metrics b').allTextContents();
  const [importantBefore, acknowledgedBefore, awaitingBefore] = principalMetricValues.map(Number);
  const principalProfileTitle = `Reconnect principal profile ${suffix}`;
  await principalContext.setOffline(true);
  const principalProfileUpdateId = await sendUpdate(teacherClient, assignment.class_id, student.id, principalProfileTitle);
  const { error: principalProfileAckError } = await parentClient.rpc('acknowledge_update', { p_update_id: principalProfileUpdateId });
  if (principalProfileAckError) throw principalProfileAckError;
  await restoreConnectivity(principalContext, principalPage);
  await principalPage.locator('#principal-profile').getByText(principalProfileTitle).waitFor({ state: 'visible', timeout: 20000 });
  await principalPage.locator('#principal-profile').getByText('Acknowledged').waitFor({ state: 'visible', timeout: 20000 });
  await principalPage.waitForFunction(({ important, acknowledged, awaiting }) => {
    const values = Array.from(document.querySelectorAll('.principal-metrics b')).map((element) => Number(element.textContent));
    return values[0] === important + 1 && values[1] === acknowledged + 1 && values[2] === awaiting;
  }, { important: importantBefore, acknowledged: acknowledgedBefore, awaiting: awaitingBefore }, { timeout: 20000 });
  expect(await principalPage.locator('#principal-recent-communication .principal-communication-card').filter({ hasText: principalProfileTitle }).count() === 1, 'Principal profile recovery duplicated communication cards.');
  expect((await must(admin.from('acknowledgements').select('id').eq('update_id', principalProfileUpdateId))).length === 1, 'Principal profile recovery acknowledgement count is not one.');
  console.log('Principal Student Profile + effective metric recovery passed.');

  // A second missed update proves refreshes do not duplicate earlier cards.
  const normalTitle = `Reconnect parent normal ${suffix}`;
  await parentContext.setOffline(true);
  await sendUpdate(teacherClient, assignment.class_id, student.id, normalTitle, 'normal');
  await restoreConnectivity(parentContext, parentPage);
  await parentPage.getByText(normalTitle).first().waitFor({ state: 'visible', timeout: 20000 });
  expect(await parentPage.getByText(normalTitle, { exact: false }).count() < 3, 'Reconnect duplicated the parent update UI.');
  console.log('Parent duplicate-refresh protection passed.');
  const dueDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  // Open Aarav's loaded Teacher profile and confirm the profile's own scoped
  // channel rehydrates communication, acknowledgements, attendance and homework.
  await waitForRealtimeSubscription(teacherPage, async () => {
    await teacherPage.getByRole('link', { name: 'Profile' }).click();
    await teacherPage.getByRole('button', { name: /Aarav Patil/ }).first().click();
    await teacherPage.locator('#teacher-profile .student-profile-grid').waitFor({ state: 'visible', timeout: 15000 });
  });

  const profileUpdateTitle = `Reconnect profile important ${suffix}`;
  await teacherContext.setOffline(true);
  const profileUpdateId = await sendUpdate(teacherClient, assignment.class_id, student.id, profileUpdateTitle);
  const { error: profileAckError } = await parentClient.rpc('acknowledge_update', { p_update_id: profileUpdateId });
  if (profileAckError) throw profileAckError;
  await restoreConnectivity(teacherContext, teacherPage);
  await teacherPage.locator('#teacher-profile').getByText(profileUpdateTitle).waitFor({ state: 'visible', timeout: 20000 });
  await teacherPage.locator('#teacher-profile').getByText('Acknowledged').waitFor({ state: 'visible', timeout: 20000 });
  console.log('Teacher Student Profile update + acknowledgement recovery passed.');

  const classStudents = await must(admin.from('students').select('id,full_name').eq('class_id', assignment.class_id).eq('active', true));
  const recentRecords = await must(admin.from('attendance_records').select('attendance_date').in('student_id', classStudents.map((row) => row.id)).gte('attendance_date', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)));
  const occupiedDates = new Set(recentRecords.map((row) => row.attendance_date));
  let profileAttendanceDate = '';
  for (let offset = 0; offset < 90; offset++) {
    const candidate = new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
    if (!occupiedDates.has(candidate)) { profileAttendanceDate = candidate; break; }
  }
  expect(profileAttendanceDate, 'Could not find an unused attendance date for isolated profile recovery.');
  attendanceStudentIds.push(...classStudents.map((row) => row.id));
  attendanceDates.push(profileAttendanceDate);
  const profileAttendanceRecords = classStudents.map((row) => ({ student_id: row.id, status: row.id === student.id ? 'absent' : 'present' }));
  await teacherContext.setOffline(true);
  const { error: attendanceSaveError } = await teacherClient.rpc('save_class_attendance', {
    p_class_id: assignment.class_id,
    p_attendance_date: profileAttendanceDate,
    p_records: profileAttendanceRecords,
  });
  if (attendanceSaveError) throw attendanceSaveError;
  const savedAttendanceAudit = await must(admin.from('audit_events').select('id').eq('event_type', 'attendance_saved').eq('actor_id', teacherProfile.id).eq('school_id', teacherProfile.school_id).contains('metadata', { class_id: assignment.class_id, attendance_date: profileAttendanceDate }));
  attendanceAuditIds.push(...savedAttendanceAudit.map((row) => row.id));
  await restoreConnectivity(teacherContext, teacherPage);
  await teacherPage.locator('#teacher-profile').getByText(new RegExp(`Latest: Absent`)).waitFor({ state: 'visible', timeout: 20000 });
  console.log('Teacher Student Profile attendance recovery passed.');

  const profileHomeworkTitle = `Reconnect profile homework ${suffix}`;
  const profileHomeworkCount = Number((await teacherPage.locator('#teacher-profile .student-profile-summary article').nth(2).locator('b').innerText()).match(/\d+/)?.[0] || 0);
  await teacherContext.setOffline(true);
  const { data: profileHomeworkId, error: profileHomeworkError } = await teacherClient.rpc('create_class_assignment', {
    p_class_id: assignment.class_id,
    p_subject: 'Science',
    p_title: profileHomeworkTitle,
    p_description: `Reconnect profile homework record ${suffix}.`,
    p_due_date: schoolToday,
    p_client_request_id: randomUUID(),
  });
  if (profileHomeworkError) throw profileHomeworkError;
  assignmentIds.push(profileHomeworkId);
  await restoreConnectivity(teacherContext, teacherPage);
  await teacherPage.waitForFunction((priorCount) => {
    const countText = document.querySelector('#teacher-profile .student-profile-summary article:nth-child(3) b')?.textContent || '';
    return Number(countText.match(/\d+/)?.[0] || 0) > priorCount;
  }, profileHomeworkCount, { timeout: 20000 });
  console.log('Teacher Student Profile homework recovery passed.');

  const otherStudent = classStudents.find((row) => row.id !== student.id);
  if (otherStudent) {
    await teacherPage.getByRole('button', { name: new RegExp(otherStudent.full_name) }).first().click();
    await teacherPage.locator('#teacher-profile .student-profile-grid').waitFor({ state: 'visible', timeout: 15000 });
    expect(await teacherPage.locator('#teacher-profile').getByText(profileUpdateTitle).count() === 0, 'Aarav profile communication leaked into another Teacher student profile.');
    await teacherPage.getByRole('button', { name: /Aarav Patil/ }).first().click();
    await teacherPage.locator('#teacher-profile').getByText(profileUpdateTitle).waitFor({ state: 'visible', timeout: 15000 });
  }
  console.log('Teacher Student Profile context isolation passed.');

  // The same offline recovery path serves the parent homework and timetable
  // workspaces. Both records are temporary and removed in finally.
  const homeworkTitle = `Reconnect homework ${suffix}`;
  await parentContext.setOffline(true);
  const { data: homeworkId, error: homeworkError } = await teacherClient.rpc('create_class_assignment', {
    p_class_id: assignment.class_id,
    p_subject: 'Science',
    p_title: homeworkTitle,
    p_description: `Reconnect homework acceptance record ${suffix}.`,
    p_due_date: dueDate,
    p_client_request_id: randomUUID(),
  });
  if (homeworkError) throw homeworkError;
  assignmentIds.push(homeworkId);
  await restoreConnectivity(parentContext, parentPage);
  await parentPage.getByText(homeworkTitle).first().waitFor({ state: 'visible', timeout: 20000 });
  console.log('Parent homework recovery passed.');

  const timetableSubject = `Reconnect timetable ${suffix}`;
  await parentContext.setOffline(true);
  const { data: timetableId, error: timetableError } = await principalClient.rpc('save_timetable_entry', {
    p_entry_id: null,
    p_class_id: assignment.class_id,
    p_teacher_id: teacherProfile.id,
    p_weekday: 1,
    p_period_number: 20,
    p_subject: timetableSubject,
    p_start_time: '16:00',
    p_end_time: '16:30',
    p_room: 'QA',
    p_client_request_id: randomUUID(),
  });
  if (timetableError) throw timetableError;
  timetableIds.push(timetableId);
  await restoreConnectivity(parentContext, parentPage);
  const parentTimetable = await must(parentClient.from('timetable_entries').select('id,subject').eq('id', timetableId));
  expect(parentTimetable.length === 1, 'Parent cannot read the persisted timetable record after reconnect.');
  await parentPage.getByText(timetableSubject).first().waitFor({ state: 'visible', timeout: 20000 });
  console.log('Parent timetable recovery passed.');

  await teacherPage.getByRole('link', { name: 'Schedule' }).click();
  await teacherPage.locator('#teacher-timetable').waitFor({ state: 'visible', timeout: 15000 });
  await teacherPage.locator('#teacher-timetable').getByText('All school days').waitFor({ state: 'visible', timeout: 15000 });
  expect((await must(teacherClient.from('timetable_entries').select('id').eq('id', timetableId))).length === 1, 'Assigned Teacher cannot read the timetable row.');
  await teacherPage.getByText(timetableSubject).first().waitFor({ state: 'visible', timeout: 15000 });
  const teacherTimetableBefore = await teacherPage.locator('#teacher-timetable').innerText();
  expect(teacherTimetableBefore.includes('All school days') && teacherTimetableBefore.includes('Today'), 'Teacher today/weekly timetable did not load.');
  const teacherTimetableSubject = `Reconnect teacher timetable ${suffix}`;
  await teacherContext.setOffline(true);
  const { data: teacherTimetableId, error: teacherTimetableError } = await principalClient.rpc('save_timetable_entry', {
    p_entry_id: null, p_class_id: assignment.class_id, p_teacher_id: teacherProfile.id,
    p_weekday: 1, p_period_number: 19, p_subject: teacherTimetableSubject,
    p_start_time: '15:15', p_end_time: '15:45', p_room: 'QB', p_client_request_id: randomUUID(),
  });
  if (teacherTimetableError) throw teacherTimetableError;
  timetableIds.push(teacherTimetableId);
  await restoreConnectivity(teacherContext, teacherPage);
  await teacherPage.getByText(teacherTimetableSubject).first().waitFor({ state: 'visible', timeout: 20000 });
  console.log('Teacher timetable recovery passed.');

  await principalPage.getByRole('link', { name: 'Timetable' }).click();
  await principalPage.getByText(teacherProfile.full_name).first().waitFor({ state: 'visible', timeout: 15000 });
  console.log('Principal teacher-name timetable view passed.');

  console.log('Reconnect browser verification passed: role recovery, profiles, multi-child/context isolation, homework, timetable, attendance, multi-event state, and duplicate refresh.');
  await Promise.all([teacherContext.close(), parentContext.close(), parentSecondContext.close(), principalContext.close()]);
} finally {
  if (browser) await browser.close();
  if (teacherClient) teacherClient.realtime.disconnect();
  if (parentClient) parentClient.realtime.disconnect();
  if (principalClient) principalClient.realtime.disconnect();
  await cleanup();
}
