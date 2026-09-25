import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
if (!url || !serviceKey || !publishableKey) throw new Error('Required Supabase environment configuration is missing.');
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const temporary = [];
const expect = (condition, message) => { if (!condition) throw new Error(message); };
async function must(result) { const { data, error } = await result; if (error) throw error; return data; }
async function login(email) { const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } }); const { error } = await client.auth.signInWithPassword({ email, password }); if (error) throw error; return client; }
const futureDate = (days) => { const value = new Date(); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };

try {
  const profiles = await must(admin.from('profiles').select('id,email').in('email', ['teacher@schovera.demo', 'parent@schovera.demo', 'principal@schovera.demo']));
  const profile = (email) => profiles.find((row) => row.email === email);
  const teacherProfile = profile('teacher@schovera.demo'), parentProfile = profile('parent@schovera.demo'), principalProfile = profile('principal@schovera.demo');
  expect(teacherProfile && parentProfile && principalProfile, 'Demo profiles are missing.');
  const classRow = await must(admin.from('teacher_class_assignments').select('class_id').eq('teacher_id', teacherProfile.id).is('ended_at', null).single());
  const teacher = await login(teacherProfile.email), parent = await login(parentProfile.email), principal = await login(principalProfile.email);
  const requestId = randomUUID();
  const payload = { p_class_id: classRow.class_id, p_subject: 'Science', p_title: `Microscope observation ${requestId.slice(0, 8)}`, p_description: 'Observe a leaf sample and write three careful observations in your notebook.', p_due_date: futureDate(2), p_client_request_id: requestId };
  const first = await teacher.rpc('create_class_assignment', payload); if (first.error) throw first.error; temporary.push(first.data);
  const retry = await teacher.rpc('create_class_assignment', payload); if (retry.error) throw retry.error;
  expect(first.data === retry.data, 'Same request key did not return the original assignment.');
  expect((await must(admin.from('class_assignments').select('id').eq('id', first.data))).length === 1, 'Retry created a duplicate assignment.');
  expect((await must(parent.from('class_assignments').select('id').eq('id', first.data))).length === 1, 'Linked parent could not read class homework.');
  expect((await must(principal.from('class_assignments').select('id').eq('id', first.data))).length === 1, 'Principal could not read own-school homework.');
  for (const changed of [{ p_title: 'Changed task title' }, { p_due_date: futureDate(3) }]) { const { error } = await teacher.rpc('create_class_assignment', { ...payload, ...changed }); expect(Boolean(error) && error.message.includes('idempotency conflict'), 'Changed payload was not rejected.'); }
  for (const client of [parent, principal]) { const { error } = await client.rpc('create_class_assignment', { ...payload, p_client_request_id: randomUUID() }); expect(Boolean(error), 'Non-Teacher unexpectedly created homework.'); }
  const { error: directError } = await teacher.from('class_assignments').insert({ school_id: randomUUID() }); expect(Boolean(directError), 'Direct assignment write unexpectedly succeeded.');
  console.log('Assignment verification passed: create, retry, parent/principal visibility, payload conflict, and write isolation.');
} finally { if (temporary.length) { await must(admin.from('audit_events').delete().in('target_id', temporary)); await must(admin.from('class_assignments').delete().in('id', temporary)); } }
