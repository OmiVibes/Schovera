/* Server-only normal Teacher-send idempotency verification. */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
if (!url || !serviceKey || !publishableKey) throw new Error('Required Supabase environment configuration is missing.');

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const temporary = { updateIds: [], authUserIds: [], teacherIds: [] };
const clients = [];
const channels = [];
const suffix = randomUUID().slice(0, 8);
const expect = (value, message) => { if (!value) throw new Error(message); };
async function must(result) { const { data, error } = await result; if (error) throw error; return data; }
async function signIn(email) {
  const client = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  clients.push(client);
  return client;
}
function realtimeStream(client, table, filter, label) {
  let channel;
  const received = [];
  const waiters = [];
  const deliver = (payload) => {
    const index = waiters.findIndex((waiter) => waiter.matches(payload));
    if (index !== -1) return waiters.splice(index, 1)[0].resolve(payload);
    received.push(payload);
  };
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Realtime subscription timed out for ${label}.`)), 12000);
    channel = client.channel(`idempotency-${table}-${randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, ...(filter ? { filter } : {}) }, deliver)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) { clearTimeout(timer); reject(new Error(`Realtime subscription failed for ${label}: ${status}.`)); }
      });
  });
  channels.push({ client, get channel() { return channel; } });
  return {
    ready,
    waitFor: (matches, eventLabel) => {
      const index = received.findIndex(matches);
      if (index !== -1) return Promise.resolve(received.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const waiterIndex = waiters.findIndex((waiter) => waiter.resolve === resolve);
          if (waiterIndex !== -1) waiters.splice(waiterIndex, 1);
          reject(new Error(`Realtime event timed out for ${eventLabel}.`));
        }, 12000);
        waiters.push({ matches, resolve: (payload) => { clearTimeout(timer); resolve(payload); } });
      });
    },
  };
}
const payloadFor = (assignment, student, requestId, overrides = {}) => ({
  p_class_id: assignment.class_id,
  p_student_id: student.id,
  p_category: 'academic',
  p_title: `Science project reminder ${suffix}`,
  p_message: 'Please bring the labelled science project material to class tomorrow.',
  p_importance: 'important',
  p_client_request_id: requestId,
  ...overrides,
});
async function cleanup() {
  for (const { client, channel } of channels) if (channel) await client.removeChannel(channel);
  if (temporary.updateIds.length) {
    await must(admin.from('acknowledgements').delete().in('update_id', temporary.updateIds));
    await must(admin.from('audit_events').delete().in('target_id', temporary.updateIds));
    for (const id of [...new Set(temporary.updateIds)].reverse()) await must(admin.from('student_updates').delete().eq('id', id));
  }
  if (temporary.teacherIds.length) await must(admin.from('teacher_class_assignments').delete().in('teacher_id', temporary.teacherIds));
  for (const id of temporary.authUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  for (const client of clients) client.realtime.disconnect();
}

try {
  const school = await must(admin.from('schools').select('id').eq('code', 'SCHOVERA-DEMO').single());
  const profiles = await must(admin.from('profiles').select('id,email,role').in('email', ['teacher@schovera.demo', 'parent@schovera.demo', 'principal@schovera.demo']));
  const profileFor = (email) => profiles.find((profile) => profile.email === email);
  const teacherProfile = profileFor('teacher@schovera.demo');
  const parentProfile = profileFor('parent@schovera.demo');
  const principalProfile = profileFor('principal@schovera.demo');
  expect(teacherProfile && parentProfile && principalProfile, 'Demo profiles are missing.');
  const assignment = await must(admin.from('teacher_class_assignments').select('class_id').eq('teacher_id', teacherProfile.id).is('ended_at', null).single());
  const student = await must(admin.from('students').select('id').eq('class_id', assignment.class_id).eq('full_name', 'Aarav Patil').single());
  const teacher = await signIn(teacherProfile.email);
  const parent = await signIn(parentProfile.email);
  const principal = await signIn(principalProfile.email);

  const requestId = randomUUID();
  const parentRealtime = realtimeStream(parent, 'student_updates', `student_id=eq.${student.id}`, 'Teacher-to-parent idempotent update');
  await parentRealtime.ready;
  const first = await teacher.rpc('send_student_update', payloadFor(assignment, student, requestId));
  if (first.error) throw first.error;
  temporary.updateIds.push(first.data);
  await parentRealtime.waitFor((payload) => payload.new.id === first.data, 'Teacher-to-parent idempotent update');
  const retry = await teacher.rpc('send_student_update', payloadFor(assignment, student, requestId));
  if (retry.error) throw retry.error;
  expect(first.data === retry.data, 'Same-key retry did not return the original update.');
  const sameKeyRows = await must(admin.from('student_updates').select('id').eq('teacher_id', teacherProfile.id).eq('client_request_id', requestId));
  const sameKeyAudits = await must(admin.from('audit_events').select('id').eq('target_id', first.data).eq('event_type', 'student_update_sent'));
  expect(sameKeyRows.length === 1 && sameKeyAudits.length === 1, 'Same-key retry created duplicate data or audit events.');
  const acknowledgementEvent = realtimeStream(teacher, 'acknowledgements', '', 'Parent-to-teacher idempotent acknowledgement');
  await acknowledgementEvent.ready;
  const { error: acknowledgementError } = await parent.rpc('acknowledge_update', { p_update_id: first.data });
  if (acknowledgementError) throw acknowledgementError;
  await acknowledgementEvent.waitFor((payload) => payload.new.update_id === first.data, 'Parent-to-teacher idempotent acknowledgement');
  const acknowledgementRows = await must(admin.from('acknowledgements').select('id').eq('update_id', first.data));
  expect(acknowledgementRows.length === 1, 'Important idempotent update was not acknowledged exactly once.');
  const parentVisible = await must(parent.from('student_updates').select('id').eq('id', first.data));
  const principalVisible = await must(principal.from('student_updates').select('id,importance,acknowledgements(id)').eq('id', first.data).single());
  expect(parentVisible.length === 1 && principalVisible.importance === 'important', 'Idempotent update was not available to authorized roles.');

  for (const overrides of [
    { p_title: `Changed title ${suffix}` },
    { p_message: 'Changed message for this same request key.' },
    { p_category: 'achievement' },
    { p_importance: 'normal' },
    { p_student_id: randomUUID() },
    { p_class_id: randomUUID() },
  ]) {
    const { error } = await teacher.rpc('send_student_update', payloadFor(assignment, student, requestId, overrides));
    expect(Boolean(error) && error.message.toLowerCase().includes('idempotency conflict'), 'Same key with changed canonical payload was not rejected as a conflict.');
  }

  const concurrentKey = randomUUID();
  const [concurrentA, concurrentB] = await Promise.all([
    teacher.rpc('send_student_update', payloadFor(assignment, student, concurrentKey, { p_title: `Concurrent science reminder ${suffix}` })),
    teacher.rpc('send_student_update', payloadFor(assignment, student, concurrentKey, { p_title: `Concurrent science reminder ${suffix}` })),
  ]);
  if (concurrentA.error) throw concurrentA.error;
  if (concurrentB.error) throw concurrentB.error;
  temporary.updateIds.push(concurrentA.data);
  expect(concurrentA.data === concurrentB.data, 'Concurrent same-key sends returned different updates.');
  expect((await must(admin.from('student_updates').select('id').eq('teacher_id', teacherProfile.id).eq('client_request_id', concurrentKey))).length === 1, 'Concurrent same-key sends created two rows.');

  const duplicateTextA = await teacher.rpc('send_student_update', payloadFor(assignment, student, randomUUID(), { p_title: `Intentional reminder ${suffix}` }));
  const duplicateTextB = await teacher.rpc('send_student_update', payloadFor(assignment, student, randomUUID(), { p_title: `Intentional reminder ${suffix}` }));
  if (duplicateTextA.error) throw duplicateTextA.error;
  if (duplicateTextB.error) throw duplicateTextB.error;
  temporary.updateIds.push(duplicateTextA.data, duplicateTextB.data);
  expect(duplicateTextA.data !== duplicateTextB.data, 'Different keys incorrectly blocked intentional identical communication.');

  const secondTeacherAuth = await admin.auth.admin.createUser({ email: `teacher-${suffix}@verification.invalid`, password, email_confirm: true });
  if (secondTeacherAuth.error) throw secondTeacherAuth.error;
  temporary.authUserIds.push(secondTeacherAuth.data.user.id);
  temporary.teacherIds.push(secondTeacherAuth.data.user.id);
  await must(admin.from('profiles').insert({ id: secondTeacherAuth.data.user.id, school_id: school.id, role: 'teacher', full_name: 'Verification Teacher', email: `teacher-${suffix}@verification.invalid` }));
  await must(admin.from('teacher_class_assignments').insert({ teacher_id: secondTeacherAuth.data.user.id, class_id: assignment.class_id }));
  const secondTeacher = await signIn(`teacher-${suffix}@verification.invalid`);
  const secondTeacherSameKey = await secondTeacher.rpc('send_student_update', payloadFor(assignment, student, requestId, { p_title: `Second teacher reminder ${suffix}` }));
  if (secondTeacherSameKey.error) throw secondTeacherSameKey.error;
  temporary.updateIds.push(secondTeacherSameKey.data);
  expect(secondTeacherSameKey.data !== first.data, 'Request key leaked or collided across Teachers.');

  for (const client of [parent, principal]) {
    const { error } = await client.rpc('send_student_update', payloadFor(assignment, student, randomUUID()));
    expect(Boolean(error), 'Non-Teacher unexpectedly sent an update.');
  }
  const { error: malformedKeyError } = await teacher.rpc('send_student_update', payloadFor(assignment, student, 'not-a-uuid'));
  expect(Boolean(malformedKeyError), 'Malformed request key was accepted.');
  const { error: directWriteError } = await teacher.from('student_updates').insert({ client_request_id: randomUUID() });
  expect(Boolean(directWriteError), 'Direct table bypass unexpectedly succeeded.');
  console.log('Idempotency verification passed: atomic retry, payload conflict, intentional repeat, authorization, ownership, audit, and direct-write protection.');
} finally {
  await cleanup();
}
