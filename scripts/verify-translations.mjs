// Guarded local acceptance: all accounts/content are synthetic and removed in finally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';

assertLocalTestEnvironment();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().slice(0, 8);
const password = `Synthetic-${randomUUID()}!aA1`;
const created = { schools: [], users: [], updates: [] };
const must = async (query) => { const { data, error } = await query; if (error) throw new Error(error.message); return data; };
async function school(label) {
  const row = await must(admin.from('schools').insert({ name: `Synthetic translation ${label} ${suffix}`, code: `TL-${label}-${suffix}` }).select().single());
  created.schools.push(row.id); return row.id;
}
async function account(role, schoolId) {
  const email = `${role}-${randomUUID()}@translation.local.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id);
  await must(admin.from('profiles').insert({ id: data.user.id, email, full_name: `Synthetic ${role}`, role, school_id: schoolId, active: true }));
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await must(client.auth.signInWithPassword({ email, password }));
  return { id: data.user.id, email, role, client };
}
async function translation(client, source, language) {
  return must(client.from('communication_translations').select('*').eq(source.kind === 'update' ? 'student_update_id' : 'announcement_id', source.id).eq('language', language).maybeSingle());
}
async function action(actor, source, language, operation, text = {}) {
  const row = await translation(actor.client, source, language);
  return actor.client.rpc('manage_communication_translation', {
    p_source_kind: source.kind, p_source_id: source.id, p_language: language, p_action: operation,
    p_expected_title: source.title, p_expected_body: source.body, p_title: text.title ?? row?.title ?? null,
    p_body: text.body ?? row?.body ?? null, p_expected_updated_at: row?.updated_at ?? null,
  });
}
async function approved(writer, reviewer, source, language, text) {
  await must(action(writer, source, language, 'save', text));
  await must(action(writer, source, language, 'submit'));
  await must(action(reviewer, source, language, 'approve'));
}
async function denied(query) { const { error } = await query; assert.ok(error, 'unauthorized operation succeeded'); }


try {
  const a = await school('A'); const b = await school('B');
  const teacher = await account('teacher', a); const otherTeacher = await account('teacher', a);
  const principal = await account('principal', a); const foreignPrincipal = await account('principal', b);
  const parent = await account('parent', a); const unlinked = await account('parent', a);
  const klass = await must(admin.from('classes').insert({ school_id: a, grade: '8', division: suffix, academic_year: 'TRANSLATION-TEST' }).select().single());
  const secondClass = await must(admin.from('classes').insert({ school_id: a, grade: '9', division: suffix, academic_year: 'TRANSLATION-TEST' }).select().single());
  await must(admin.from('teacher_class_assignments').insert([{ teacher_id: teacher.id, class_id: klass.id }, { teacher_id: otherTeacher.id, class_id: secondClass.id }]));
  const students = await must(admin.from('students').insert([
    { school_id: a, class_id: klass.id, full_name: `Synthetic Child A ${suffix}`, roll_number: '01', active: true },
    { school_id: a, class_id: secondClass.id, full_name: `Synthetic Child B ${suffix}`, roll_number: '02', active: true },
  ]).select());
  await must(admin.from('parent_student_links').insert(students.map((s) => ({ parent_id: parent.id, student_id: s.id, status: 'active' }))));
  const original = { kind: 'update', title: `Synthetic Important ${suffix}`, body: 'Original library notice: 10:00, fee 20. Synthetic data only.' };
  original.id = await must(teacher.client.rpc('send_student_update', { p_class_id: klass.id, p_student_id: students[0].id, p_category: 'general', p_title: original.title, p_message: original.body, p_importance: 'important', p_client_request_id: randomUUID() }));
  created.updates.push(original.id);
  const sibling = await must(admin.from('student_updates').insert({ school_id: a, class_id: secondClass.id, student_id: students[1].id, teacher_id: otherTeacher.id, category: 'general', title: 'Only child B original', message: 'Private sibling original, never child A translation.', importance: 'normal' }).select().single());
  created.updates.push(sibling.id);
  const announcement = await must(admin.from('announcements').insert({ school_id: a, created_by: principal.id, title: 'Synthetic school notice', body: 'Synthetic original for school-wide language review.' }).select().single());
  const notice = { kind: 'announcement', id: announcement.id, title: announcement.title, body: announcement.body };
  const samples = {
    en: { title: 'Reviewed English', body: 'Library 10:00, fee 20. <img src=x onerror=alert(1)> is literal test text.' },
    hi: { title: 'पुस्तकालय की सूचना', body: 'पुस्तकालय 10:00 बजे खुलता है। शुल्क 20 है। यह नमूना है।' },
    mr: { title: 'वाचनालयाची सूचना', body: 'वाचनालय 10:00 वाजता उघडते. शुल्क 20 आहे. हा नमुना आहे.' },
  };
  await must(action(teacher, original, 'hi', 'save', samples.hi));
  assert.equal(await translation(parent.client, original, 'hi'), null);
  const anon = createClient(url, key, { auth: { persistSession: false } });
  assert.ok((await anon.from('communication_translations').select('id')).error);
  await denied(action(parent, original, 'hi', 'save', samples.hi));
  await denied(action(otherTeacher, original, 'hi', 'save', samples.hi));
  await denied(action(foreignPrincipal, original, 'hi', 'save', samples.hi));
  await denied(action(teacher, notice, 'hi', 'save', samples.hi));
  await must(action(teacher, original, 'hi', 'submit'));
  await denied(action(teacher, original, 'hi', 'approve'));
  assert.equal(await translation(parent.client, original, 'hi'), null);
  const stale = await translation(principal.client, original, 'hi');
  await must(action(teacher, original, 'hi', 'save', samples.hi));
  await denied(principal.client.rpc('manage_communication_translation', { p_source_kind: 'update', p_source_id: original.id, p_language: 'hi', p_action: 'approve', p_expected_title: original.title, p_expected_body: original.body, p_expected_updated_at: stale.updated_at }));
  await must(action(teacher, original, 'hi', 'submit'));
  await must(action(principal, original, 'hi', 'approve'));
  assert.equal((await translation(parent.client, original, 'hi')).body, samples.hi.body);
  assert.equal((await translation(parent.client, original, 'hi')).approved_by, principal.id);
  assert.equal(await translation(unlinked.client, original, 'hi'), null);
  assert.equal(await translation(foreignPrincipal.client, original, 'hi'), null);
  assert.equal(await translation(otherTeacher.client, original, 'hi'), null);
  await denied(parent.client.from('communication_translations').update({ body: 'Unauthorized replacement' }).eq('student_update_id', original.id));
  await denied(parent.client.from('communication_translations').insert({ school_id: a, student_update_id: original.id, language: 'mr', title: 'Fake', body: 'Fake', source_hash: '0'.repeat(64), authored_by: parent.id }));
  await approved(teacher, principal, original, 'en', samples.en);
  await approved(principal, principal, notice, 'hi', samples.hi);
  assert.equal((await translation(parent.client, notice, 'hi')).status, 'approved');
  assert.equal(await translation(unlinked.client, notice, 'hi'), null);
  assert.equal((await must(admin.from('student_updates').select('title,message').eq('id', original.id).single())).message, original.body);

  // School-reviewed overrides remain supported; teachers need no manual UI step.
  await approved(teacher, principal, original, 'mr', samples.mr);
  await must(parent.client.rpc('acknowledge_update', { p_update_id: original.id }));

  assert.equal((await must(admin.from('acknowledgements').select('update_id').eq('update_id', original.id))).length, 1);
  await must(action(teacher, original, 'mr', 'save', samples.mr));
  assert.equal(await translation(parent.client, original, 'mr'), null);
  await must(action(teacher, original, 'mr', 'submit'));
  await must(action(principal, original, 'mr', 'approve'));
  await must(admin.from('teacher_class_assignments').update({ ended_at: new Date().toISOString() }).eq('teacher_id', teacher.id).eq('class_id', klass.id));
  await denied(action(teacher, original, 'mr', 'save', samples.mr));
  await must(admin.from('teacher_class_assignments').update({ ended_at: null }).eq('teacher_id', teacher.id).eq('class_id', klass.id));
  const correction = await must(teacher.client.rpc('send_student_update_correction', { p_original_update_id: original.id, p_title: 'Corrected source', p_message: 'Original instructions corrected to 11:00.' }));
  created.updates.push(correction);
  assert.equal((await translation(teacher.client, original, 'mr')).status, 'needs_review');
  assert.equal(await translation(parent.client, original, 'mr'), null);
  await denied(action(principal, original, 'mr', 'approve'));
  assert.equal((await must(admin.from('student_updates').select('message').eq('id', original.id).single())).message, original.body);
  await must(admin.from('announcements').update({ body: 'Changed source at 11:00, fee 30.' }).eq('id', notice.id));
  assert.equal((await translation(principal.client, notice, 'hi')).status, 'needs_review');
  assert.equal(await translation(parent.client, notice, 'hi'), null);
  await denied(action(principal, notice, 'hi', 'save', samples.hi));
  for (const table of ['attendance_records', 'school_entry_events']) {
    assert.equal((await must(admin.from(table).select('id').in('student_id', students.map((s) => s.id)))).length, 0);
  }
  console.log('Translation database checks passed: original preservation, source correction/edit invalidation, version conflicts, Principal-only approval, Parent draft/write denial, linked-child/school/Teacher scope, and original acknowledgement identity.');
} finally {
  if (created.schools.length) {
    await must(admin.from('communication_translations').delete().in('school_id', created.schools));
    if (created.updates.length) await must(admin.from('acknowledgements').delete().in('update_id', created.updates));
    await must(admin.from('audit_events').delete().in('school_id', created.schools));
    for (const id of [...created.updates].reverse()) await must(admin.from('student_updates').delete().eq('id', id));
    await must(admin.from('announcements').delete().in('school_id', created.schools));
    if (created.users.length) {
      await must(admin.from('parent_student_links').delete().in('parent_id', created.users));
      await must(admin.from('teacher_class_assignments').delete().in('teacher_id', created.users));
    }
    await must(admin.from('students').delete().in('school_id', created.schools));
    await must(admin.from('classes').delete().in('school_id', created.schools));
    await must(admin.from('profiles').delete().in('school_id', created.schools));
    for (const id of created.users) { const { error } = await admin.auth.admin.deleteUser(id); if (error) throw error; }
    await must(admin.from('schools').delete().in('id', created.schools));
    for (const table of ['communication_translations', 'profiles']) assert.equal((await must(admin.from(table).select('id').in('school_id', created.schools))).length, 0);
    assert.equal((await must(admin.from('schools').select('id').in('id', created.schools))).length, 0);
  }
  console.log('Temporary translation fixtures cleaned and verified.');
}

// Browser acceptance now exercises automatic translation and real local audio.
if (!process.argv.includes('--database-only')) await import('./verify-local-communication.mjs');
