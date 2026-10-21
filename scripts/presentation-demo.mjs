// Fictional, local-only presentation data. Reuses the owned fixture journal and cleanup.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID, createPrivateKey } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { prepareManualFixture, manualPaths, readManualFixture, actorClient } from './manual-demo.mjs';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { LocalSupabaseV2Transport } from './rfid-gateway/local-v2-transport.mjs';
import { schoolToday, shiftSchoolDate } from '../src/lib/school-date.mjs';
import { fictionalNames } from './online-demo/dataset.mjs';

export { fictionalNames };
const root = fileURLToPath(new URL('../', import.meta.url));
const must = async (query) => { const { data, error } = await query; if (error) throw new Error(error.message); return data; };
function adminClient() {
  if (existsSync(path.join(root, '.env.local'))) throw new Error('Presentation provisioning requires a clean isolated checkout; .env.local was not opened.');
  assertLocalTestEnvironment();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function preparePresentation() {
  const admin = adminClient();
  if (existsSync(new URL('../.local/schovera-manual-demo/current.json', import.meta.url))) {
    const current = readManualFixture();
    if (current.presentation?.ready !== true) throw new Error('Existing manual/partial fixture preserved. Use a separate checkout or explicitly clean its owned data first.');
    const students = await must(admin.from('students').select('id').eq('school_id', current.schoolId));
    if (students.length !== 20) throw new Error('Presentation roster changed; refusing automatic overwrite');
    console.log('Presentation already provisioned: 20 fictional students; no duplicate writes.');
    return current;
  }
  const f = await prepareManualFixture();
  const { manifestPath, enrollmentPath } = manualPaths();
  const save = () => writeFileSync(manifestPath, JSON.stringify(f, null, 2), { mode: 0o600 });
  f.presentation = { version: 1, ready: false, fictional: true }; save();
  try {
    await must(admin.from('schools').update({ name: 'Schovera Model School — Demo Campus' }).eq('id', f.schoolId));
    const principal = await actorClient(f.accounts.principal), teacher = await actorClient(f.accounts.teacher);
    async function identity(name, role, fullName) {
      const email = `${name}-${f.runId}@presentation.local.test`, password = `${randomBytes(24).toString('base64url')}!aA1`;
      const data = await must(admin.auth.admin.createUser({ email, password, email_confirm: true }));
      const account = { id: data.user.id, email, password, role };
      f.createdUsers.push(account.id); f.accounts[name] = account; save();
      await must(admin.from('profiles').insert({ id: account.id, school_id: f.schoolId, email, role, full_name: fullName, active: true }));
      return actorClient(account);
    }
    for (const [key, fullName] of [['principal', 'Dr Meera Rao'], ['teacher', 'Maya Kulkarni'], ['parent', 'Anjali Deshmukh']]) await must(admin.from('profiles').update({ full_name: fullName }).eq('id', f.accounts[key].id));
    await identity('teacherB', 'teacher', 'Vikram Shah');
    await must(admin.from('teacher_class_assignments').insert({ teacher_id: f.accounts.teacherB.id, class_id: f.classes[1].id }));
    for (const klass of f.classes) await must(admin.from('classes').update({ grade: '7', academic_year: '2026–27 Demo' }).eq('id', klass.id));
    f.classes.forEach((c) => { c.grade = '7'; });
    const initial = [...f.students]; f.students = []; save();
    for (let i = 0; i < 20; i++) {
      const classIndex = i < 10 ? 0 : 1, roll = String(i % 10 + 1).padStart(2, '0');
      let student;
      if (i === 0 || i === 10) student = await must(admin.from('students').update({ full_name: fictionalNames[i], roll_number: roll }).eq('id', initial[classIndex].id).select().single());
      else student = await must(admin.from('students').insert({ school_id: f.schoolId, class_id: f.classes[classIndex].id, full_name: fictionalNames[i], roll_number: roll, active: true }).select().single());
      f.students.push(student); save();
    }
    const parents = [f.accounts.parent];
    for (let i = 1; i < 10; i++) {
      const key = `family${i + 1}`;
      await identity(key, 'parent', `${['Seema','Rajesh','Kavita','Suresh','Pooja','Amit','Neha','Farah','Sameer'][i - 1]} ${fictionalNames[i].split(' ').at(-1)}`);
      parents.push(f.accounts[key]);
      await must(admin.from('parent_student_links').insert([i, i + 10].map((j) => ({ parent_id: f.accounts[key].id, student_id: f.students[j].id, status: 'active' }))));
    }
    // These fictional guardians each care for a pair of wards; surnames need not match.
    for (let c = 0; c < 2; c++) for (let d = 0; d < f.dates.length; d++) {
      await must(teacher.rpc('save_class_attendance', { p_class_id: f.classes[c].id, p_attendance_date: f.dates[d], p_records: f.students.slice(c * 10, c * 10 + 10).map((student, i) => ({ student_id: student.id, status: i === 0 && [0,1,2,7,8,9].includes(d) ? 'absent' : i === 1 && d < 3 ? 'absent' : i === 2 && d === 8 ? 'late' : 'present' })) }));
    }
    await must(admin.from('timetable_entries').delete().eq('school_id', f.schoolId));
    for (let c = 0; c < 2; c++) for (let day = 1; day <= 6; day++) for (let p = 1; p <= 3; p++) {
      const hour = c ? 12 + p : 8 + p;
      await must(principal.rpc('save_timetable_entry', { p_entry_id: null, p_class_id: f.classes[c].id, p_teacher_id: c ? f.accounts.teacherB.id : f.accounts.teacher.id, p_weekday: day, p_period_number: p, p_subject: ['Science', 'Mathematics', 'English'][p - 1], p_start_time: `${hour}:00`, p_end_time: `${hour}:40`, p_room: c ? 'Room 7B' : 'Room 7A', p_client_request_id: randomUUID() }));
    }
    await must(admin.from('class_assignments').delete().eq('school_id', f.schoolId));
    for (const klass of f.classes) for (const [n, subject] of ['Science','Mathematics','English'].entries()) await must(teacher.rpc('create_class_assignment', { p_class_id: klass.id, p_subject: subject, p_title: ['Simple machines around us','Fractions practice','Reading journal'][n], p_description: ['Draw two simple machines and explain their use.','Complete exercises 1–5 and show your working.','Read a short story and write three sentences about it.'][n], p_due_date: shiftSchoolDate(schoolToday(), n + 2), p_client_request_id: randomUUID() }));
    const title = 'Library notebook reminder', body = 'Please bring your library notebook tomorrow at 09:00. This is a fictional demonstration notice.';
    await must(admin.from('communication_translations').delete().eq('school_id', f.schoolId));
    await must(admin.from('student_updates').delete().eq('id', f.updateId));
    f.updateId = await must(teacher.rpc('send_student_update', { p_class_id: f.classes[0].id, p_student_id: f.students[0].id, p_category: 'general', p_title: title, p_message: body, p_importance: 'important', p_client_request_id: randomUUID() })); save();
    async function reviewTranslation(id, sourceTitle, sourceBody, language, translatedTitle, translatedBody) {
      let row;
      for (const [actor, action] of [[teacher, 'save'], [teacher, 'submit'], [principal, 'approve']]) {
        await must(actor.rpc('manage_communication_translation', { p_source_kind: 'update', p_source_id: id, p_language: language, p_action: action, p_expected_title: sourceTitle, p_expected_body: sourceBody, p_title: translatedTitle, p_body: translatedBody, p_expected_updated_at: row?.updated_at ?? null }));
        row = await must(admin.from('communication_translations').select('updated_at').eq('student_update_id', id).eq('language', language).single());
      }
    }
    await reviewTranslation(f.updateId, title, body, 'hi', 'पुस्तकालय की कॉपी की सूचना', 'कृपया कल 09:00 बजे अपनी पुस्तकालय की कॉपी लाएँ। यह काल्पनिक प्रदर्शन की सूचना है।');
    await reviewTranslation(f.updateId, title, body, 'mr', 'वाचनालयाच्या वहीची सूचना', 'कृपया उद्या 09:00 वाजता वाचनालयाची वही आणा. ही काल्पनिक प्रात्यक्षिकाची सूचना आहे.');
    f.presentation.noticeId = f.updateId;
    for (const [i, student] of f.students.entries()) {
      const updateId = await must(teacher.rpc('send_student_update', { p_class_id: student.class_id, p_student_id: student.id, p_category: i % 2 ? 'achievement' : 'academic', p_title: i % 2 ? 'Thoughtful classroom participation' : 'Science practice for this week', p_message: i % 2 ? 'Your child shared a clear explanation during our group activity. Thank you for encouraging regular reading.' : 'Please revise simple machines and bring the completed practice sheet. Contact the class teacher if support is needed.', p_importance: i % 3 ? 'normal' : 'important', p_client_request_id: randomUUID() }));
      if (i % 3 === 0 && i % 2 === 0) {
        const parent = await actorClient(parents[i % 10]); await must(parent.rpc('acknowledge_update', { p_update_id: updateId }));
      }
    }
    await must(admin.from('announcements').delete().eq('school_id', f.schoolId));
    await must(principal.rpc('publish_announcement', { p_title: 'Welcome to the reading week', p_body: 'Our fictional campus is celebrating reading, teamwork and respectful communication. This is a demonstration, not an actual school announcement.', p_priority: 'important', p_client_request_id: randomUUID() }));
    await must(principal.rpc('publish_announcement', { p_title: 'Bring a reusable water bottle', p_body: 'Please carry a labelled water bottle for the classroom activities in this demo.', p_priority: 'normal', p_client_request_id: randomUUID() }));
    const target = process.env.SCHOVERA_TEST_URL;
    const { data: session } = await principal.auth.getSession();
    async function post(route, input, token = session.session.access_token) {
      const response = await fetch(`${target}${route}`, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Local presentation request failed: ${response.status}`);
      return response.json();
    }
    const parent = await actorClient(f.accounts.parent), parentSession = (await parent.auth.getSession()).data.session;
    await post('/api/fallback-simulator', { op: 'preferences', sms: true, ivr: true, language: 'mr' }, parentSession.access_token);
    await post('/api/fallback-simulator', { op: 'queue', kind: 'update', source_id: f.updateId });
    const deliveries = await must(admin.from('fallback_simulation_deliveries').select('id').eq('student_update_id', f.updateId));
    for (const delivery of deliveries) await post('/api/fallback-simulator', { op: 'dispatch', delivery_id: delivery.id, scenario: 'deliver' });
    const enrollment = JSON.parse(readFileSync(enrollmentPath, 'utf8'));
    const transport = new LocalSupabaseV2Transport({ target, devicePrivateKey: createPrivateKey(enrollment.devicePrivateKey) });
    for (const [i, student] of f.students.entries()) {
      const ref = i === 0 ? enrollment.credentialRef : `presentation-${randomUUID()}`;
      const assignment = i === 0 ? f.assignmentId : await must(principal.rpc('issue_student_credential', { p_student_id: student.id, p_credential_ref: ref, p_credential_version: 1 }));
      const { capability } = await post('/api/device/v2/capabilities', { assignment_id: assignment, device_id: enrollment.deviceId });
      await transport.send({ schema_version: 2, event_id: randomUUID(), device_id: enrollment.deviceId, credential_ref: ref, credential_assignment_id: assignment, credential_assignment_version: 1, assignment_capability: capability, event_type: 'check_in', observed_at: new Date().toISOString(), device_sequence: i + 1, gateway_receipt_id: randomUUID() });
    }
    enrollment.initialSequence = 20; writeFileSync(enrollmentPath, JSON.stringify(enrollment), { mode: 0o600 });
    f.presentation.ready = true; save();
    console.log('Presentation ready: 20 fictional students, 2 classes, 2 assigned Teachers, 10 linked guardian accounts, 200 attendance records, 36 periods, 6 homework assignments, reviewed Hindi/Marathi fixtures, simulated delivery histories and 20 signed synthetic check-ins.');
    return f;
  } catch (error) { save(); throw new Error(`Presentation setup stopped; owned journal retained for explicit cleanup. ${error.message}`); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await preparePresentation(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
