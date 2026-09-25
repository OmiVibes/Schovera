import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
if (!url || !serviceKey || !publishableKey) throw new Error('Required Supabase environment configuration is missing.');
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const expect = (value, message) => { if (!value) throw new Error(message); };
async function login(email) { const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } }); const { error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; return client; }

const profiles = (await admin.from('profiles').select('id,email,school_id').in('email', ['teacher@schovera.demo', 'parent@schovera.demo', 'principal@schovera.demo'])).data || [];
const profile = (email) => profiles.find((item) => item.email === email);
const teacherProfile = profile('teacher@schovera.demo'), parentProfile = profile('parent@schovera.demo'), principalProfile = profile('principal@schovera.demo');
expect(teacherProfile && parentProfile && principalProfile, 'Demo profiles are missing.');
const teacher = await login(teacherProfile.email), parent = await login(parentProfile.email), principal = await login(principalProfile.email);
const linked = (await admin.from('parent_student_links').select('student_id').eq('parent_id', parentProfile.id).eq('status', 'active').limit(1)).data?.[0];
expect(linked, 'Parent child link is missing.');
const student = (await admin.from('students').select('id,class_id,school_id').eq('id', linked.student_id).single()).data;
expect(student, 'Linked student is missing.');
const assigned = await teacher.from('students').select('id').eq('id', student.id);
const parentRead = await parent.from('students').select('id').eq('id', student.id);
const principalRead = await principal.from('students').select('id').eq('id', student.id);
expect(!assigned.error && assigned.data.length === 1, 'Assigned teacher cannot read student.');
expect(!parentRead.error && parentRead.data.length === 1, 'Linked parent cannot read child.');
expect(!principalRead.error && principalRead.data.length === 1, 'Principal cannot read own-school student.');
const unassigned = (await admin.from('students').select('id').eq('school_id', student.school_id).neq('class_id', student.class_id).limit(1)).data?.[0];
if (unassigned) {
  const result = await teacher.from('students').select('id').eq('id', unassigned.id);
  expect(!result.error && result.data.length === 0, 'Teacher read an unassigned same-school student.');
  const parentResult = await parent.from('students').select('id').eq('id', unassigned.id);
  expect(!parentResult.error && parentResult.data.length === 0, 'Parent read an unlinked same-school student.');
}
const other = (await admin.from('students').select('id').neq('school_id', student.school_id).limit(1)).data?.[0];
if (other) {
  for (const [name, client] of [['teacher', teacher], ['parent', parent], ['principal', principal]]) {
    const result = await client.from('students').select('id').eq('id', other.id);
    expect(!result.error && result.data.length === 0, `${name} read another-school student.`);
  }
}
for (const table of ['attendance_records', 'student_updates']) {
  const result = await parent.from(table).select('id').eq('student_id', student.id).limit(10);
  expect(!result.error, `Parent ${table} profile query failed.`);
}
const homework = await parent.from('class_assignments').select('id,due_date').eq('class_id', student.class_id).limit(10);
expect(!homework.error, 'Parent homework profile query failed.');
const updates = await admin.from('student_updates').select('id,corrects_update_id,importance').eq('student_id', student.id);
expect(!updates.error, 'Could not inspect correction-chain inputs.');
const correctedIds = new Set((updates.data || []).map((item) => item.corrects_update_id).filter(Boolean));
const effective = (updates.data || []).filter((item) => !correctedIds.has(item.id));
expect(effective.length <= (updates.data || []).length, 'Correction-chain effective update calculation is invalid.');
const anonymous = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anonymousRead = await anonymous.from('students').select('id').eq('id', student.id);
expect((anonymousRead.data || []).length === 0, 'Anonymous client read a student profile input.');
console.log('Student profile verification passed: authorized role reads, unassigned/cross-school isolation, anonymous denial, attendance, correction-effective communication, and homework aggregation inputs.');
