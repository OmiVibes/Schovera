// Operator-only synthetic fixture lifecycle. Never import into the application.
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { randomBytes, randomUUID, generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { schoolToday, shiftSchoolDate } from '../src/lib/school-date.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '.local', 'schovera-manual-demo');
const pointer = path.join(directory, 'current.json');
export function manualPaths() {
  const { runId } = JSON.parse(readFileSync(pointer, 'utf8'));
  if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error('Invalid demo run identity');
  const runDirectory = path.resolve(directory, runId);
  if (path.dirname(runDirectory) !== directory) throw new Error('Unsafe demo directory');
  return { runDirectory, manifestPath: path.join(runDirectory, 'manifest.json'), enrollmentPath: path.join(runDirectory, 'enrollment.json') };
}
function assertCleanCheckout() {
  if (existsSync(path.join(root, '.env.local'))) throw new Error('Use a disposable clean checkout without .env.local; file was not opened.');
}
function clients() {
  assertCleanCheckout(); assertLocalTestEnvironment();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
const must = async (query) => { const { data, error } = await query; if (error) throw new Error(error.message); return data; };
export async function actorClient(actor) {
  assertLocalTestEnvironment();
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await must(client.auth.signInWithPassword({ email: actor.email, password: actor.password })); return client;
}
export function readManualFixture() { assertCleanCheckout(); return JSON.parse(readFileSync(manualPaths().manifestPath, 'utf8')); }
export async function prepareManualFixture({ onCreated } = {}) {
  const admin = clients();
  if (existsSync(pointer)) throw new Error('A manual fixture already exists. Clean only that fixture before preparing another.');
  const runId = randomUUID(), runDirectory = path.join(directory, runId);
  mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
  const fixture = { version: 1, runId, code: `MANUAL-${runId}`, schoolId: null, accounts: {}, students: [], classes: [], createdUsers: [], dates: [] };
  const save = () => writeFileSync(path.join(runDirectory, 'manifest.json'), JSON.stringify(fixture, null, 2), { mode: 0o600 });
  writeFileSync(pointer, JSON.stringify({ runId }), { flag: 'wx', mode: 0o600 }); save();
  onCreated?.(fixture);
  try {
    fixture.schoolId = (await must(admin.from('schools').insert({ name: 'Synthetic personal testing school', code: fixture.code, timezone: 'Asia/Kolkata' }).select().single())).id; save();
    for (const [name, role] of [['principal', 'principal'], ['teacher', 'teacher'], ['parent', 'parent'], ['unlinkedParent', 'parent'], ['unassignedTeacher', 'teacher']]) {
      const email = `${name.toLowerCase()}-${runId}@manual.local.test`, password = `Temporary-${randomBytes(18).toString('base64url')}!aA1`;
      const user = await must(admin.auth.admin.createUser({ email, password, email_confirm: true }));
      fixture.createdUsers.push(user.user.id); fixture.accounts[name] = { id: user.user.id, email, password, role }; save();
      await must(admin.from('profiles').insert({ id: user.user.id, email, role, school_id: fixture.schoolId, full_name: `Synthetic ${name}`, active: true }));
    }
    for (const [index, division] of ['A', 'B'].entries()) {
      const klass = await must(admin.from('classes').insert({ school_id: fixture.schoolId, grade: '8', division, academic_year: `MANUAL-${runId}` }).select().single()); fixture.classes.push(klass); save();
      await must(admin.from('teacher_class_assignments').insert({ teacher_id: fixture.accounts.teacher.id, class_id: klass.id }));
      const student = await must(admin.from('students').insert({ school_id: fixture.schoolId, class_id: klass.id, full_name: `Synthetic Child ${division}`, roll_number: '01', active: true }).select().single()); fixture.students.push(student); save();
      await must(admin.from('parent_student_links').insert({ parent_id: fixture.accounts.parent.id, student_id: student.id, status: 'active' }));
      for (let weekday = 1; weekday <= 6; weekday++) await must(admin.from('timetable_entries').insert({ school_id: fixture.schoolId, class_id: klass.id, teacher_id: fixture.accounts.teacher.id, created_by: fixture.accounts.principal.id, client_request_id: randomUUID(), weekday, period_number: 1, subject: 'Synthetic Science', start_time: index ? '10:00' : '09:00', end_time: index ? '10:45' : '09:45', room: 'Synthetic room' }));
    }
    const teacher = await actorClient(fixture.accounts.teacher), principal = await actorClient(fixture.accounts.principal);
    fixture.dates = Array.from({ length: 10 }, (_, n) => shiftSchoolDate(schoolToday(), n - 10));
    for (const [index, student] of fixture.students.entries()) {
      for (let n = 0; n < fixture.dates.length; n++) await must(teacher.rpc('save_class_attendance', { p_class_id: student.class_id, p_attendance_date: fixture.dates[n], p_records: [{ student_id: student.id, status: !index && [0, 1, 2, 7, 8, 9].includes(n) ? 'absent' : 'present' }] }));
      await must(teacher.rpc('create_class_assignment', { p_class_id: student.class_id, p_subject: 'Science', p_title: `Synthetic homework ${index + 1}`, p_description: 'Describe a simple machine. This is synthetic demonstration work.', p_due_date: shiftSchoolDate(schoolToday(), 3), p_client_request_id: randomUUID() }));
    }
    const title = 'Synthetic library notice', body = 'Synthetic notice: the library opens at 09:00. No real child information.';
    fixture.updateId = await must(teacher.rpc('send_student_update', { p_class_id: fixture.classes[0].id, p_student_id: fixture.students[0].id, p_category: 'general', p_title: title, p_message: body, p_importance: 'important', p_client_request_id: randomUUID() })); save();
    let draft;
    for (const [client, action] of [[teacher, 'save'], [teacher, 'submit'], [principal, 'approve']]) {
      await must(client.rpc('manage_communication_translation', { p_source_kind: 'update', p_source_id: fixture.updateId, p_language: 'mr', p_action: action, p_expected_title: title, p_expected_body: body, p_title: 'नमुना वाचनालय सूचना', p_body: 'नमुना सूचना: वाचनालय सकाळी 09:00 वाजता उघडते. ही फक्त चाचणी आहे.', p_expected_updated_at: draft?.updated_at ?? null }));
      draft = await must(admin.from('communication_translations').select('updated_at').eq('student_update_id', fixture.updateId).single());
    }
    await must(principal.rpc('publish_announcement', { p_title: 'Synthetic school notice', p_body: 'Use only synthetic accounts in this local demonstration.', p_priority: 'important', p_client_request_id: randomUUID() }));
    // The operator provisions enrollment. Gateway file receives no Supabase or issuer key.
    const keys = generateKeyPairSync('ed25519');
    const device = await must(principal.rpc('provision_school_device', { p_label: 'Synthetic personal-test reader', p_hardware_type: 'local_simulator', p_verification_public_key: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() }));
    const ref = `synth-manual-${randomUUID()}`;
    const assignment = await must(principal.rpc('issue_student_credential', { p_student_id: fixture.students[0].id, p_credential_ref: ref, p_credential_version: 1 }));
    fixture.assignmentId = assignment; save();
    const { data: session } = await principal.auth.getSession();
    const target = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3000';
    async function post(route, input) {
      const response = await fetch(`${target}${route}`, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Local capability issuer unavailable. Initialize the synthetic issuer key before server startup.'); return response.json();
    }
    await post('/api/device/v2/capability-keys', {});
    const { capability } = await post('/api/device/v2/capabilities', { assignment_id: assignment, device_id: device });
    writeFileSync(path.join(runDirectory, 'enrollment.json'), JSON.stringify({ mode: 'synthetic_local_only', runId, target, deviceId: device, assignmentId: assignment, credentialRef: ref, capability, readerId: randomUUID(), readerKey: randomBytes(32).toString('hex'), devicePrivateKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }), { flag: 'wx', mode: 0o600 });
    return fixture;
  } catch (error) { console.error('Preparation failed; retained exact fixture journal for safe cleanup. No credentials printed.'); throw error; }
}

export async function cleanManualFixture() {
  const admin = clients(), fixture = readManualFixture();
  const { runDirectory } = manualPaths();
  if (fixture.schoolId) {
    const school = await must(admin.from('schools').select('id,code').eq('id', fixture.schoolId).maybeSingle());
    if (school && school.code !== `MANUAL-${fixture.runId}`) throw new Error('Cleanup refuses a school not owned by this fixture');
    if (school) {
      const devices = await must(admin.from('school_devices').select('id').eq('school_id', school.id));
      if (devices.length) await must(admin.from('device_event_receipts').delete().in('device_id', devices.map((device) => device.id)));
      for (const table of ['school_entry_events', 'student_credentials', 'school_devices', 'rfid_capability_signing_keys', 'fallback_simulation_deliveries', 'fallback_simulation_preferences', 'communication_translations', 'attendance_records', 'class_assignments', 'timetable_entries']) await must(admin.from(table).delete().eq('school_id', school.id));
      let updates = await must(admin.from('student_updates').select('id,corrects_update_id').eq('school_id', school.id));
      if (updates.length) await must(admin.from('acknowledgements').delete().in('update_id', updates.map((u) => u.id)));
      while (updates.length) {
        const leaves = updates.filter((u) => !updates.some((other) => other.corrects_update_id === u.id));
        if (!leaves.length) throw new Error('Unexpected correction cycle; preserving fixture');
        await must(admin.from('student_updates').delete().in('id', leaves.map((u) => u.id))); updates = updates.filter((u) => !leaves.includes(u));
      }
      await must(admin.from('announcements').delete().eq('school_id', school.id));
      await must(admin.from('audit_events').delete().eq('school_id', school.id));
      if (fixture.createdUsers.length) {
        await must(admin.from('parent_student_links').delete().in('parent_id', fixture.createdUsers));
        await must(admin.from('teacher_class_assignments').delete().in('teacher_id', fixture.createdUsers));
      }
      for (const table of ['students', 'classes', 'profiles']) await must(admin.from(table).delete().eq('school_id', school.id));
    }
  }
  for (const user of fixture.createdUsers) { const { error } = await admin.auth.admin.deleteUser(user); if (error && error.status !== 404) throw error; }
  if (fixture.schoolId) {
    await must(admin.from('schools').delete().eq('id', fixture.schoolId));
    if ((await must(admin.from('schools').select('id').eq('id', fixture.schoolId))).length) throw new Error('Fixture cleanup verification failed');
  }
  if (path.dirname(runDirectory) !== directory || path.basename(runDirectory) !== fixture.runId) throw new Error('Unsafe cleanup path');
  rmSync(runDirectory, { recursive: true, force: false }); unlinkSync(pointer);
  console.log('Only the owned synthetic manual school/accounts and generated run directory were removed; cleanup verified.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  try {
    assertCleanCheckout();
    if (command === 'prepare') { await prepareManualFixture(); console.log('Synthetic manual fixture ready. Run npm run demo:credentials privately; do not paste its output.'); }
    else if (command === 'credentials') { const f = readManualFixture(); console.log('LOCAL TEMPORARY CREDENTIALS — never publish or commit'); for (const [role, a] of Object.entries(f.accounts)) console.log(`${role}: ${a.email}  ${a.password}`); }
    else if (command === 'info') { const f = readManualFixture(); console.log(JSON.stringify({ synthetic: true, classes: f.classes.map((c) => `${c.grade}${c.division}`), childNames: f.students.map((s) => s.full_name), historicalDates: f.dates }, null, 2)); }
    else if (command === 'clean') await cleanManualFixture();
    else if (command === 'revoke-card') { clients(); const f = readManualFixture(); const principal = await actorClient(f.accounts.principal); await must(principal.rpc('revoke_student_credential', { p_credential_id: f.assignmentId })); console.log('Synthetic card assignment revoked; later queued observations must remain unresolved.'); }
    else throw new Error('Choose prepare, credentials, info, revoke-card or clean');
  } catch (error) { console.error(`Manual demo stopped: ${error.message}`); process.exitCode = 1; }
}
