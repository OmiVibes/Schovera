/* Server-only Phase 2B verification. Temporary records are removed by exact IDs. */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
if (!url || !serviceKey || !publishableKey)
  throw new Error('Required Supabase environment configuration is missing.');
const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }),
  temporary = { announcementIds: [], schoolIds: [] },
  suffix = randomUUID().slice(0, 8);
const expect = (value, message) => {
  if (!value) throw new Error(message);
};
const must = async (result) => {
  const { data, error } = await result;
  if (error) throw error;
  return data;
};
async function signIn(email, role) {
  if (!email) throw new Error(`Missing seeded ${role} email.`);
  const client = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in as ${role}: ${error.message}`);
  return client;
}
try {
  const principal = await signIn('principal@schovera.demo', 'principal'),
    teacher = await signIn('teacher@schovera.demo', 'teacher'),
    parent = await signIn('parent@schovera.demo', 'parent');
  const normalTitle = `Verification normal ${suffix}`,
    importantTitle = `Verification important ${suffix}`;
  for (const invalidNotice of [
    { p_title: ' \t\n ', p_body: 'A valid announcement body.' },
    { p_title: 'A valid announcement title', p_body: ' \t\r\n ' },
  ]) {
    const invalid = await principal.rpc('publish_announcement', {
      ...invalidNotice,
      p_priority: 'normal',
    });
    expect(
      Boolean(invalid.error),
      'Whitespace-only announcement content was accepted.',
    );
  }
  let response = await principal.rpc('publish_announcement', {
    p_title: normalTitle,
    p_body: 'A persisted normal official notice for verification.',
    p_priority: 'normal',
  });
  if (response.error) throw response.error;
  temporary.announcementIds.push(response.data);
  response = await principal.rpc('publish_announcement', {
    p_title: importantTitle,
    p_body: 'A persisted important official notice for verification.',
    p_priority: 'important',
  });
  if (response.error) throw response.error;
  temporary.announcementIds.push(response.data);
  const principalRows = await must(
    principal
      .from('announcements')
      .select('id,priority')
      .in('id', temporary.announcementIds),
  );
  expect(
    principalRows.length === 2 &&
      principalRows.some((row) => row.priority === 'important'),
    'Principal publish or persistence failed.',
  );
  const teacherRows = await must(
    teacher
      .from('announcements')
      .select('id')
      .in('id', temporary.announcementIds),
  );
  const parentRows = await must(
    parent
      .from('announcements')
      .select('id')
      .in('id', temporary.announcementIds),
  );
  expect(
    teacherRows.length === 2,
    'Teacher could not read own-school announcements.',
  );
  expect(
    parentRows.length === 2,
    'Parent could not read linked-school announcements.',
  );
  let denied = await teacher.rpc('publish_announcement', {
    p_title: 'Denied announcement',
    p_body: 'Teachers must not publish official notices.',
    p_priority: 'normal',
  });
  expect(Boolean(denied.error), 'Teacher announcement write was not denied.');
  denied = await parent.rpc('publish_announcement', {
    p_title: 'Denied announcement',
    p_body: 'Parents must not publish official notices.',
    p_priority: 'normal',
  });
  expect(Boolean(denied.error), 'Parent announcement write was not denied.');
  const schoolB = await must(
    admin
      .from('schools')
      .insert({
        name: `Announcement School ${suffix}`,
        code: `ANNOUNCE-${suffix}`,
      })
      .select('id')
      .single(),
  );
  temporary.schoolIds.push(schoolB.id);
  const foreign = await must(
    admin
      .from('announcements')
      .insert({
        school_id: schoolB.id,
        created_by: (
          await must(
            admin
              .from('profiles')
              .select('id')
              .eq('email', 'principal@schovera.demo')
              .single(),
          )
        ).id,
        title: `School B ${suffix}`,
        body: 'Private school B notice.',
        priority: 'normal',
      })
      .select('id')
      .single(),
  );
  temporary.announcementIds.push(foreign.id);
  const crossTeacher = await must(
    teacher.from('announcements').select('id').eq('id', foreign.id),
  );
  const crossParent = await must(
    parent.from('announcements').select('id').eq('id', foreign.id),
  );
  const crossPrincipal = await must(
    principal.from('announcements').select('id').eq('id', foreign.id),
  );
  expect(
    !crossTeacher.length && !crossParent.length && !crossPrincipal.length,
    'Cross-school announcement isolation failed.',
  );
  console.log(
    'Announcement verification passed: principal publishing, read-only roles, persistence, priority, and school isolation.',
  );
} finally {
  if (temporary.announcementIds.length) {
    await must(admin
      .from('audit_events')
      .delete()
      .in('target_id', temporary.announcementIds));
    await must(admin
      .from('announcements')
      .delete()
      .in('id', temporary.announcementIds));
  }
  if (temporary.schoolIds.length)
    await must(admin.from('schools').delete().in('id', temporary.schoolIds));
}
