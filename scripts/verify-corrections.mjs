/* Server-only verification for immutable student-update corrections. */
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
const expect = (condition, message) => { if (!condition) throw new Error(message); };
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
    if (index === -1) return received.push(payload);
    const [waiter] = waiters.splice(index, 1);
    clearTimeout(waiter.timer);
    waiter.resolve(payload);
  };
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Realtime subscription timed out for ${label}.`)), 12000);
    channel = client.channel(`correction-${table}-${randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, deliver)
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
        const waiter = { matches, resolve, timer: undefined };
        waiter.timer = setTimeout(() => {
          const waiterIndex = waiters.indexOf(waiter);
          if (waiterIndex !== -1) waiters.splice(waiterIndex, 1);
          reject(new Error(`Realtime event timed out for ${eventLabel}.`));
        }, 15000);
        waiters.push(waiter);
      });
    },
  };
}
async function createUpdate(teacher, assignment, student, title, importance = 'normal', category = 'academic') {
  const { data, error } = await teacher.rpc('send_student_update', {
    p_class_id: assignment.class_id, p_student_id: student.id, p_category: category,
    p_title: title, p_message: `A clear, respectful message for ${title}.`, p_importance: importance,
  });
  if (error) throw error;
  temporary.updateIds.push(data);
  return data;
}
async function correction(teacher, id, title, message = 'Corrected information remains clear and respectful.') {
  const { data, error } = await teacher.rpc('send_student_update_correction', {
    p_original_update_id: id, p_title: title, p_message: message,
  });
  if (error) throw error;
  temporary.updateIds.push(data);
  return data;
}
async function denied(client, parameters, label) {
  const { error } = await client.rpc('send_student_update_correction', parameters);
  expect(Boolean(error), `${label} unexpectedly succeeded.`);
}
async function cleanup() {
  for (const { client, channel } of channels) if (channel) await client.removeChannel(channel);
  for (const client of clients) client.realtime.disconnect();
  if (temporary.updateIds.length) {
    await must(admin.from('acknowledgements').delete().in('update_id', temporary.updateIds));
    await must(admin.from('audit_events').delete().in('target_id', temporary.updateIds));
    for (const id of [...temporary.updateIds].reverse()) await must(admin.from('student_updates').delete().eq('id', id));
  }
  if (temporary.teacherIds.length)
    await must(admin.from('teacher_class_assignments').delete().in('teacher_id', temporary.teacherIds));
  for (const id of temporary.authUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}

try {
  const school = await must(admin.from('schools').select('id').eq('code', 'SCHOVERA-DEMO').single());
  const profiles = await must(admin.from('profiles').select('id,email,role').in('email', ['teacher@schovera.demo', 'parent@schovera.demo', 'principal@schovera.demo']));
  const profileFor = (email) => profiles.find((profile) => profile.email === email);
  const teacherProfile = profileFor('teacher@schovera.demo');
  const parentProfile = profileFor('parent@schovera.demo');
  const principalProfile = profileFor('principal@schovera.demo');
  expect(teacherProfile && parentProfile && principalProfile, 'Demo role profiles are missing.');
  const assignment = await must(admin.from('teacher_class_assignments').select('class_id').eq('teacher_id', teacherProfile.id).is('ended_at', null).single());
  const student = await must(admin.from('students').select('id').eq('class_id', assignment.class_id).eq('full_name', 'Aarav Patil').single());
  const teacher = await signIn(teacherProfile.email);
  const parent = await signIn(parentProfile.email);
  const principal = await signIn(principalProfile.email);

  const validationOriginal = await createUpdate(teacher, assignment, student, `Validation baseline ${suffix}`);
  for (const [title, message] of [['', 'Valid correction body'], ['   \t\n', 'Valid correction body'], ['Valid correction title', ''], ['Valid correction title', ' \t\n ']])
    await denied(teacher, { p_original_update_id: validationOriginal, p_title: title, p_message: message }, 'Invalid correction payload');
  const unicodeCorrection = await correction(teacher, validationOriginal, 'सुधारित माहिती — शाबास! 😊', 'नमस्कार पालकांनो,\nही सुधारित माहिती आहे. विद्यार्थ्याने छान काम केले.');
  const unicodeRow = await must(admin.from('student_updates').select('title,message').eq('id', unicodeCorrection).single());
  expect(unicodeRow.title.includes('सुधारित') && unicodeRow.title.includes('😊') && unicodeRow.message.includes('\n'), 'Unicode or multiline correction content was not preserved.');

  const normalOriginal = await createUpdate(teacher, assignment, student, `Reading progress ${suffix}`);
  const parentLive = realtimeStream(parent, 'student_updates', `student_id=eq.${student.id}`, 'Teacher-to-parent correction');
  await parentLive.ready;
  const realtimePreflight = await createUpdate(teacher, assignment, student, `Correction subscription preflight ${suffix}`);
  await parentLive.waitFor((payload) => payload.new.id === realtimePreflight, 'Teacher-to-parent correction preflight');
  const parentCorrectionEvent = parentLive.waitFor((payload) => payload.new.corrects_update_id === normalOriginal, 'Teacher-to-parent correction');
  const normalCorrection = await correction(teacher, normalOriginal, `Updated reading progress ${suffix}`);
  await parentCorrectionEvent;
  const normalRows = await must(admin.from('student_updates').select('id,corrects_update_id,category,importance,title').in('id', [normalOriginal, normalCorrection]));
  const original = normalRows.find((row) => row.id === normalOriginal);
  const fixed = normalRows.find((row) => row.id === normalCorrection);
  expect(original.title === `Reading progress ${suffix}`, 'Original communication was mutated.');
  expect(fixed.corrects_update_id === normalOriginal && fixed.category === original.category && fixed.importance === original.importance, 'Correction did not inherit trusted context.');
  expect((await must(admin.from('acknowledgements').select('id').eq('update_id', normalCorrection))).length === 0, 'Normal correction unexpectedly has acknowledgement.');

  const importantOriginal = await createUpdate(teacher, assignment, student, `Science model update ${suffix}`, 'important', 'achievement');
  const importantCorrection = await correction(teacher, importantOriginal, `Updated science model update ${suffix}`);
  const correctionRows = await must(admin.from('student_updates').select('id,importance,category,corrects_update_id').in('id', [importantOriginal, importantCorrection]));
  expect(correctionRows.find((row) => row.id === importantCorrection).importance === 'important', 'Important correction was downgraded.');
  const parentAckLive = realtimeStream(teacher, 'acknowledgements', '', 'Parent-to-teacher correction acknowledgement');
  await parentAckLive.ready;
  const acknowledgementPreflight = await createUpdate(teacher, assignment, student, `Correction acknowledgement preflight ${suffix}`, 'important');
  const { error: preflightAckError } = await parent.rpc('acknowledge_update', { p_update_id: acknowledgementPreflight });
  if (preflightAckError) throw preflightAckError;
  await parentAckLive.waitFor((payload) => payload.new.update_id === acknowledgementPreflight, 'Parent-to-teacher correction acknowledgement preflight');
  const correctionAcknowledgementEvent = parentAckLive.waitFor((payload) => payload.new.update_id === importantCorrection, 'Parent-to-teacher correction acknowledgement');
  const { error: ackError } = await parent.rpc('acknowledge_update', { p_update_id: importantCorrection });
  if (ackError) throw ackError;
  await correctionAcknowledgementEvent;
  const correctionAcks = await must(admin.from('acknowledgements').select('id').eq('update_id', importantCorrection));
  expect(correctionAcks.length === 1, 'Important correction did not receive exactly one acknowledgement.');
  expect((await must(admin.from('acknowledgements').select('id').eq('update_id', importantOriginal))).length === 0, 'Obsolete original acknowledgement was incorrectly created.');

  const acknowledgedOriginal = await createUpdate(teacher, assignment, student, `Acknowledged original ${suffix}`, 'important', 'general');
  const { error: originalAckError } = await parent.rpc('acknowledge_update', { p_update_id: acknowledgedOriginal });
  if (originalAckError) throw originalAckError;
  const acknowledgedCorrection = await correction(teacher, acknowledgedOriginal, `Corrected acknowledged original ${suffix}`);
  expect((await must(admin.from('acknowledgements').select('id').eq('update_id', acknowledgedOriginal))).length === 1, 'Original acknowledgement history was not preserved.');
  expect((await must(admin.from('acknowledgements').select('id').eq('update_id', acknowledgedCorrection))).length === 0, 'A correction inherited an acknowledgement that belongs to the original.');

  const chainOriginal = await createUpdate(teacher, assignment, student, `Homework correction chain ${suffix}`, 'important', 'homework_task');
  const chainB = await correction(teacher, chainOriginal, `Updated homework correction chain ${suffix}`);
  const chainC = await correction(teacher, chainB, `Final homework correction chain ${suffix}`);
  const chain = await must(admin.from('student_updates').select('id,corrects_update_id').in('id', [chainOriginal, chainB, chainC]));
  const children = new Set(chain.map((row) => row.corrects_update_id).filter(Boolean));
  expect(children.has(chainOriginal) && children.has(chainB) && !children.has(chainC), 'A → B → C effective-chain semantics failed.');
  const audit = await must(admin.from('audit_events').select('event_type,metadata').eq('target_id', chainB).eq('event_type', 'student_update_corrected'));
  expect(audit.length === 1 && audit[0].metadata.correction_update_id === chainC, 'Correction audit event is missing or malformed.');

  const raceOriginal = await createUpdate(teacher, assignment, student, `Concurrent correction ${suffix}`, 'important');
  const teacherTab = await signIn(teacherProfile.email);
  const [raceA, raceB] = await Promise.all([
    teacher.rpc('send_student_update_correction', { p_original_update_id: raceOriginal, p_title: `Concurrent correction A ${suffix}`, p_message: 'First simultaneous correction attempt.' }),
    teacherTab.rpc('send_student_update_correction', { p_original_update_id: raceOriginal, p_title: `Concurrent correction B ${suffix}`, p_message: 'Second simultaneous correction attempt.' }),
  ]);
  const succeeded = [raceA, raceB].filter((result) => !result.error);
  expect(succeeded.length === 1, 'Concurrent correction protection did not allow exactly one success.');
  temporary.updateIds.push(succeeded[0].data);
  const directChildren = await must(admin.from('student_updates').select('id').eq('corrects_update_id', raceOriginal));
  expect(directChildren.length === 1, 'Database permitted competing direct corrections.');

  const secondTeacherAuth = await admin.auth.admin.createUser({ email: `teacher-${suffix}@verification.invalid`, password, email_confirm: true });
  if (secondTeacherAuth.error) throw secondTeacherAuth.error;
  temporary.authUserIds.push(secondTeacherAuth.data.user.id);
  temporary.teacherIds.push(secondTeacherAuth.data.user.id);
  await must(admin.from('profiles').insert({ id: secondTeacherAuth.data.user.id, school_id: school.id, role: 'teacher', full_name: 'Verification Teacher', email: `teacher-${suffix}@verification.invalid` }));
  await must(admin.from('teacher_class_assignments').insert({ teacher_id: secondTeacherAuth.data.user.id, class_id: assignment.class_id }));
  const secondTeacher = await signIn(`teacher-${suffix}@verification.invalid`);
  await denied(secondTeacher, { p_original_update_id: chainC, p_title: 'Unauthorized correction', p_message: 'This must never be sent.' }, 'Teacher B correction');
  await denied(parent, { p_original_update_id: chainC, p_title: 'Parent correction', p_message: 'This must never be sent.' }, 'Parent correction');
  await denied(principal, { p_original_update_id: chainC, p_title: 'Principal correction', p_message: 'This must never be sent.' }, 'Principal correction');
  await denied(teacher, { p_original_update_id: randomUUID(), p_title: 'Missing correction', p_message: 'This target does not exist.' }, 'Nonexistent correction');
  const { error: directWriteError } = await teacher.from('student_updates').insert({ corrects_update_id: chainC });
  expect(Boolean(directWriteError), 'Authenticated teacher bypassed correction RPC through direct table write.');
  const effectiveImportant = (await must(admin.from('student_updates').select('id,importance,corrects_update_id,acknowledgements(id)').in('id', [importantOriginal, importantCorrection])));
  const effectiveIds = new Set(effectiveImportant.map((row) => row.corrects_update_id).filter(Boolean));
  const activeImportant = effectiveImportant.filter((row) => row.importance === 'important' && !effectiveIds.has(row.id));
  expect(activeImportant.length === 1 && activeImportant[0].id === importantCorrection && activeImportant[0].acknowledgements.length === 1, 'Effective principal metric source double-counted corrected history.');
  console.log('Correction verification passed: immutability, inheritance, acknowledgements, audit, Realtime, chain integrity, concurrent protection, and role security.');
} finally {
  await cleanup();
}
