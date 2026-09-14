/* Server-only Phase 1 integration verification. It never prints environment values. */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
if (!url || !serviceKey || !publishableKey)
  throw new Error('Required Supabase environment configuration is missing.');

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const temporary = {
  authUserIds: [],
  classIds: [],
  studentIds: [],
  schoolIds: [],
  updateIds: [],
};
const channels = [];
const signedInClients = [];
const suffix = randomUUID().slice(0, 8);

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function must(result) {
  const { data, error } = await result;
  if (error) throw error;
  return data;
}

async function signIn(email) {
  const client = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  signedInClients.push(client);
  return client;
}

function waitForRealtime(client, table, filter, label) {
  let channel;
  let settled = false;
  let resolveEvent;
  let eventTimer;
  const event = new Promise((resolve, reject) => {
    resolveEvent = (payload) => {
      clearTimeout(eventTimer);
      resolve(payload);
    };
    eventTimer = setTimeout(
      () => reject(new Error(`Realtime event timed out for ${label}.`)),
      15000,
    );
  });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Realtime subscription timed out for ${label}.`)),
      12000,
    );
    channel = client
      .channel(`phase1-${table}-${randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table, filter },
        (payload) => {
          if (!settled) {
            settled = true;
            resolveEvent(payload);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve();
        }
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          clearTimeout(timer);
          reject(
            new Error(`Realtime subscription failed for ${label}: ${status}.`),
          );
        }
      });
  });
  channels.push({
    client,
    get channel() {
      return channel;
    },
  });
  return { ready, event };
}

function subscribeToRealtimeEvents(client, table, label) {
  let channel;
  const pending = [];
  const received = [];
  const deliver = (payload) => {
    const waiterIndex = pending.findIndex((waiter) => waiter.matches(payload));
    if (waiterIndex === -1) {
      received.push(payload);
      return;
    }
    const [waiter] = pending.splice(waiterIndex, 1);
    clearTimeout(waiter.timer);
    waiter.resolve(payload);
  };
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Realtime subscription timed out for ${label}.`)),
      12000,
    );
    channel = client
      .channel(`phase1-${table}-stream-${randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table },
        deliver,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve();
        }
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          clearTimeout(timer);
          reject(
            new Error(`Realtime subscription failed for ${label}: ${status}.`),
          );
        }
      });
  });
  channels.push({
    client,
    get channel() {
      return channel;
    },
  });
  return {
    ready,
    waitFor: (matches, eventLabel) => {
      const receivedIndex = received.findIndex(matches);
      if (receivedIndex !== -1)
        return Promise.resolve(received.splice(receivedIndex, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { matches, resolve, timer: undefined };
        waiter.timer = setTimeout(() => {
          const index = pending.indexOf(waiter);
          if (index !== -1) pending.splice(index, 1);
          reject(new Error(`Realtime event timed out for ${eventLabel}.`));
        }, 15000);
        pending.push(waiter);
      });
    },
  };
}

async function expectRpcDenied(client, parameters) {
  const { error } = await client.rpc('send_student_update', parameters);
  expect(Boolean(error), 'Unauthorized RPC unexpectedly succeeded.');
}

async function cleanup() {
  for (const { client, channel } of channels)
    if (channel) await client.removeChannel(channel);
  for (const client of signedInClients) client.realtime.disconnect();
  if (temporary.updateIds.length) {
    await must(admin
      .from('acknowledgements')
      .delete()
      .in('update_id', temporary.updateIds));
    await must(admin
      .from('audit_events')
      .delete()
      .in('target_id', temporary.updateIds));
    await must(admin.from('student_updates').delete().in('id', temporary.updateIds));
  }
  if (temporary.studentIds.length) {
    await must(admin
      .from('parent_student_links')
      .delete()
      .in('student_id', temporary.studentIds));
    await must(admin.from('students').delete().in('id', temporary.studentIds));
  }
  if (temporary.classIds.length)
    await must(admin.from('classes').delete().in('id', temporary.classIds));
  for (const authUserId of temporary.authUserIds) {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error) throw error;
  }
  if (temporary.schoolIds.length)
    await must(admin.from('schools').delete().in('id', temporary.schoolIds));
}

try {
  const school = await must(
    admin.from('schools').select('id').eq('code', 'SCHOVERA-DEMO').single(),
  );
  const seedProfiles = await must(
    admin
      .from('profiles')
      .select('id,role,email')
      .in('email', [
        'teacher@schovera.demo',
        'parent@schovera.demo',
        'principal@schovera.demo',
      ]),
  );
  const profileFor = (email) =>
    seedProfiles.find((profile) => profile.email === email);
  const teacherProfile = profileFor('teacher@schovera.demo');
  const parentProfile = profileFor('parent@schovera.demo');
  const principalProfile = profileFor('principal@schovera.demo');
  expect(
    teacherProfile && parentProfile && principalProfile,
    'Expected demo Teacher, Parent, and Principal profiles are missing.',
  );
  const assignment = await must(
    admin
      .from('teacher_class_assignments')
      .select('class_id')
      .eq('teacher_id', teacherProfile.id)
      .is('ended_at', null)
      .single(),
  );
  const student = await must(
    admin
      .from('students')
      .select('id')
      .eq('class_id', assignment.class_id)
      .eq('full_name', 'Aarav Patil')
      .single(),
  );

  const teacher = await signIn(teacherProfile.email);
  const parent = await signIn(parentProfile.email);
  const principal = await signIn(principalProfile.email);

  const unassignedClass = await must(
    admin
      .from('classes')
      .insert({
        school_id: school.id,
        grade: '7',
        division: `V${suffix.slice(0, 5)}`,
        academic_year: '2026-27',
      })
      .select('id')
      .single(),
  );
  temporary.classIds.push(unassignedClass.id);
  const unlinkedStudent = await must(
    admin
      .from('students')
      .insert({
        school_id: school.id,
        class_id: unassignedClass.id,
        roll_number: `V${suffix}`,
        full_name: 'Verification Child',
      })
      .select('id')
      .single(),
  );
  temporary.studentIds.push(unlinkedStudent.id);
  const otherParentAuth = await admin.auth.admin.createUser({
    email: `parent-${suffix}@verification.invalid`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (otherParentAuth.error) throw otherParentAuth.error;
  temporary.authUserIds.push(otherParentAuth.data.user.id);
  await must(
    admin.from('profiles').insert({
      id: otherParentAuth.data.user.id,
      school_id: school.id,
      role: 'parent',
      full_name: 'Verification Parent',
      email: `parent-${suffix}@verification.invalid`,
    }),
  );
  await must(
    admin.from('parent_student_links').insert({
      parent_id: otherParentAuth.data.user.id,
      student_id: unlinkedStudent.id,
      relationship_label: 'Parent',
      status: 'active',
    }),
  );

  const otherSchool = await must(
    admin
      .from('schools')
      .insert({
        name: `Verification School ${suffix}`,
        code: `VERIFY-${suffix}`,
      })
      .select('id')
      .single(),
  );
  temporary.schoolIds.push(otherSchool.id);
  const otherClass = await must(
    admin
      .from('classes')
      .insert({
        school_id: otherSchool.id,
        grade: '7',
        division: 'B',
        academic_year: '2026-27',
      })
      .select('id')
      .single(),
  );
  temporary.classIds.push(otherClass.id);
  const otherStudent = await must(
    admin
      .from('students')
      .insert({
        school_id: otherSchool.id,
        class_id: otherClass.id,
        roll_number: '01',
        full_name: 'Other School Child',
      })
      .select('id')
      .single(),
  );
  temporary.studentIds.push(otherStudent.id);

  const parentLeak = await must(
    parent.from('students').select('id').eq('id', unlinkedStudent.id),
  );
  expect(
    parentLeak.length === 0,
    'Parent isolation failed: Parent A could read Parent B child.',
  );
  const parentLinkLeak = await must(
    parent
      .from('parent_student_links')
      .select('id')
      .eq('student_id', unlinkedStudent.id),
  );
  expect(
    parentLinkLeak.length === 0,
    'Parent isolation failed: Parent A could read Parent B link.',
  );
  const teacherLeak = await must(
    teacher.from('students').select('id').eq('id', unlinkedStudent.id),
  );
  expect(
    teacherLeak.length === 0,
    'Teacher assignment isolation failed: unassigned student was visible.',
  );
  await expectRpcDenied(teacher, {
    p_class_id: unassignedClass.id,
    p_student_id: unlinkedStudent.id,
    p_category: 'general',
    p_title: 'Denied update',
    p_message: 'This must never be saved.',
    p_importance: 'normal',
  });
  const principalCrossSchool = await must(
    principal.from('students').select('id').eq('id', otherStudent.id),
  );
  expect(
    principalCrossSchool.length === 0,
    'Cross-school isolation failed: Principal A could read School B student.',
  );
  await expectRpcDenied(parent, {
    p_class_id: assignment.class_id,
    p_student_id: student.id,
    p_category: 'general',
    p_title: 'Denied update',
    p_message: 'A parent cannot send a teacher update.',
    p_importance: 'normal',
  });
  await expectRpcDenied(principal, {
    p_class_id: assignment.class_id,
    p_student_id: student.id,
    p_category: 'general',
    p_title: 'Denied update',
    p_message: 'A principal cannot send a teacher update.',
    p_importance: 'normal',
  });
  console.log('Phase 1 security checks passed.');

  const parentSubscriptionPreflight = waitForRealtime(
    parent,
    'student_updates',
    `student_id=eq.${student.id}`,
    'Teacher-to-parent subscription preflight',
  );
  await parentSubscriptionPreflight.ready;
  const { data: preflightUpdateId, error: preflightError } = await teacher.rpc(
    'send_student_update',
    {
      p_class_id: assignment.class_id,
      p_student_id: student.id,
      p_category: 'general',
      p_title: `Phase 1 subscription preflight ${suffix}`,
      p_message:
        'This real persisted update confirms the parent subscription is active before the acceptance event.',
      p_importance: 'normal',
    },
  );
  if (preflightError) throw preflightError;
  temporary.updateIds.push(preflightUpdateId);
  await parentSubscriptionPreflight.event;

  const parentLive = waitForRealtime(
    parent,
    'student_updates',
    `student_id=eq.${student.id}`,
    'Teacher-to-parent acceptance update',
  );
  await parentLive.ready;
  const { data: importantUpdateId, error: importantError } = await teacher.rpc(
    'send_student_update',
    {
      p_class_id: assignment.class_id,
      p_student_id: student.id,
      p_category: 'achievement',
      p_title: 'Phase 1 verification update',
      p_message:
        'This persisted update verifies the school-to-home acknowledgement loop.',
      p_importance: 'important',
    },
  );
  if (importantError) throw importantError;
  temporary.updateIds.push(importantUpdateId);
  await parentLive.event;
  const parentImportant = await must(
    parent
      .from('student_updates')
      .select('id,importance')
      .eq('id', importantUpdateId),
  );
  expect(
    parentImportant.length === 1 &&
      parentImportant[0].importance === 'important',
    'Parent did not receive the persisted important update.',
  );
  console.log('Teacher-to-parent Realtime delivery passed.');

  const teacherAcknowledgementStream = subscribeToRealtimeEvents(
    teacher,
    'acknowledgements',
    'Teacher acknowledgement stream',
  );
  const principalAcknowledgementStream = subscribeToRealtimeEvents(
    principal,
    'acknowledgements',
    'Principal acknowledgement stream',
  );
  await Promise.all([
    teacherAcknowledgementStream.ready,
    principalAcknowledgementStream.ready,
  ]);
  const {
    data: acknowledgementPreflightUpdateId,
    error: acknowledgementPreflightError,
  } = await teacher.rpc('send_student_update', {
    p_class_id: assignment.class_id,
    p_student_id: student.id,
    p_category: 'general',
    p_title: `Phase 1 acknowledgement preflight ${suffix}`,
    p_message:
      'This real persisted update confirms acknowledgement subscriptions before the acceptance event.',
    p_importance: 'important',
  });
  if (acknowledgementPreflightError) throw acknowledgementPreflightError;
  temporary.updateIds.push(acknowledgementPreflightUpdateId);
  const { error: acknowledgementPreflightRpcError } = await parent.rpc(
    'acknowledge_update',
    { p_update_id: acknowledgementPreflightUpdateId },
  );
  if (acknowledgementPreflightRpcError) throw acknowledgementPreflightRpcError;
  await Promise.all([
    teacherAcknowledgementStream.waitFor(
      (payload) => payload.new.update_id === acknowledgementPreflightUpdateId,
      'Teacher acknowledgement subscription preflight',
    ),
    principalAcknowledgementStream.waitFor(
      (payload) => payload.new.update_id === acknowledgementPreflightUpdateId,
      'Principal acknowledgement subscription preflight',
    ),
  ]);
  const teacherAcknowledgementEvent = teacherAcknowledgementStream.waitFor(
    (payload) => payload.new.update_id === importantUpdateId,
    'Parent-to-teacher acknowledgement',
  );
  const principalAcknowledgementEvent = principalAcknowledgementStream.waitFor(
    (payload) => payload.new.update_id === importantUpdateId,
    'Parent-to-principal acknowledgement',
  );
  const { error: acknowledgementError } = await parent.rpc(
    'acknowledge_update',
    { p_update_id: importantUpdateId },
  );
  if (acknowledgementError) throw acknowledgementError;
  await Promise.all([
    teacherAcknowledgementEvent,
    principalAcknowledgementEvent,
  ]);
  const { error: repeatedAcknowledgementError } = await parent.rpc(
    'acknowledge_update',
    { p_update_id: importantUpdateId },
  );
  if (repeatedAcknowledgementError) throw repeatedAcknowledgementError;
  const acknowledgements = await must(
    admin
      .from('acknowledgements')
      .select('id')
      .eq('update_id', importantUpdateId),
  );
  expect(
    acknowledgements.length === 1,
    'Acknowledgement idempotency failed: duplicate acknowledgement was created.',
  );
  const teacherAcknowledgement = await must(
    teacher
      .from('acknowledgements')
      .select('id')
      .eq('update_id', importantUpdateId),
  );
  const principalAcknowledgement = await must(
    principal
      .from('acknowledgements')
      .select('id')
      .eq('update_id', importantUpdateId),
  );
  const principalImportantUpdate = await must(
    principal
      .from('student_updates')
      .select('id,importance,acknowledgements(id)')
      .eq('id', importantUpdateId)
      .single(),
  );
  expect(
    teacherAcknowledgement.length === 1,
    'Teacher did not receive acknowledgement state through RLS.',
  );
  expect(
    principalAcknowledgement.length === 1,
    'Principal coverage data did not include acknowledgement.',
  );
  expect(
    principalImportantUpdate.importance === 'important' &&
      principalImportantUpdate.acknowledgements.length === 1,
    'Principal aggregate source data was not correct.',
  );
  const refreshedParent = await signIn(parentProfile.email);
  const refreshedTeacher = await signIn(teacherProfile.email);
  const parentAfterRefresh = await must(
    refreshedParent
      .from('acknowledgements')
      .select('id')
      .eq('update_id', importantUpdateId),
  );
  const teacherAfterRefresh = await must(
    refreshedTeacher
      .from('acknowledgements')
      .select('id')
      .eq('update_id', importantUpdateId),
  );
  expect(
    parentAfterRefresh.length === 1 && teacherAfterRefresh.length === 1,
    'Acknowledgement did not persist across fresh authenticated sessions.',
  );
  console.log(
    'Parent acknowledgement and acknowledgement Realtime delivery passed.',
  );

  const { data: normalUpdateId, error: normalError } = await teacher.rpc(
    'send_student_update',
    {
      p_class_id: assignment.class_id,
      p_student_id: student.id,
      p_category: 'general',
      p_title: 'Phase 1 normal update',
      p_message:
        'This normal update is informational and has no acknowledgement requirement.',
      p_importance: 'normal',
    },
  );
  if (normalError) throw normalError;
  temporary.updateIds.push(normalUpdateId);
  const normalAcknowledgements = await must(
    admin.from('acknowledgements').select('id').eq('update_id', normalUpdateId),
  );
  expect(
    normalAcknowledgements.length === 0,
    'Normal update unexpectedly required or created an acknowledgement.',
  );

  console.log(
    'Phase 1 integration verification passed: persistence, Realtime, acknowledgement, roles, tenant isolation, and normal-update behaviour.',
  );
} finally {
  await cleanup();
}
