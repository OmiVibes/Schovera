/* Server-only development seed. Never expose SUPABASE_SERVICE_ROLE_KEY to the browser. */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    'Set NEXT_PUBLIC_SUPABASE_URL and private SUPABASE_SERVICE_ROLE_KEY before seeding.',
  );
const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
const people = [
  ['principal@schovera.demo', 'Dr. Meera Sharma', 'principal'],
  ['teacher@schovera.demo', 'Ananya Joshi', 'teacher'],
  ['parent@schovera.demo', 'Rajesh Patil', 'parent'],
];

async function ensureUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (data.user) return data.user.id;
  if (!error || !/already|exists|registered|duplicate/i.test(error.message))
    throw error;

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;
  const existing = listed.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!existing)
    throw new Error(`Could not locate existing demo user for ${email}.`);
  return existing.id;
}

async function must(result) {
  const { data, error } = await result;
  if (error) throw error;
  return data;
}

const ids = {};
for (const [email, , role] of people) {
  ids[role] = await ensureUser(email);
}
const school = await must(
  admin
    .from('schools')
    .upsert(
      {
        name: 'Schovera International School',
        code: 'SCHOVERA-DEMO',
        timezone: 'Asia/Kolkata',
      },
      { onConflict: 'code' },
    )
    .select()
    .single(),
);
for (const [email, full_name, role] of people)
  await must(
    admin
      .from('profiles')
      .upsert({
        id: ids[role],
        school_id: school.id,
        email,
        full_name,
        role,
        active: true,
      }),
  );
const grade7 = await must(
  admin
    .from('classes')
    .upsert(
      {
        school_id: school.id,
        grade: '7',
        division: 'A',
        academic_year: '2026-27',
      },
      { onConflict: 'school_id,grade,division,academic_year' },
    )
    .select()
    .single(),
);
await must(
  admin
    .from('teacher_class_assignments')
    .upsert(
      { teacher_id: ids.teacher, class_id: grade7.id },
      { onConflict: 'teacher_id,class_id' },
    ),
);
const roster = [
  ['07', 'Aarav Patil'],
  ['11', 'Diya Nair'],
  ['14', 'Kabir Shah'],
  ['18', 'Meera Iyer'],
  ['22', 'Rohan Verma'],
];
const students = {};
for (const [roll_number, full_name] of roster) {
  students[roll_number] = await must(
    admin
      .from('students')
      .upsert(
        { school_id: school.id, class_id: grade7.id, roll_number, full_name },
        { onConflict: 'class_id,roll_number' },
      )
      .select()
      .single(),
  );
}
const aarav = students['07'];
await must(
  admin
    .from('parent_student_links')
    .upsert(
      {
        parent_id: ids.parent,
        student_id: aarav.id,
        relationship_label: 'Father',
        status: 'active',
      },
      { onConflict: 'parent_id,student_id' },
    ),
);
const dateDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};
const statuses = [
  ['present', 'present', 'late', 'present', 'absent'],
  ['late', 'present', 'present', 'absent', 'present'],
  ['present', 'absent', 'present', 'present', 'present'],
  ['present', 'present', 'present', 'late', 'present'],
  ['absent', 'present', 'present', 'present', 'late'],
];
for (let day = 0; day < statuses.length; day += 1) {
  const attendance_date = dateDaysAgo(day);
  for (let index = 0; index < roster.length; index += 1) {
    await must(
      admin
        .from('attendance_records')
        .upsert(
          {
            school_id: school.id,
            class_id: grade7.id,
            student_id: students[roster[index][0]].id,
            marked_by: ids.teacher,
            attendance_date,
            status: statuses[day][index],
          },
          { onConflict: 'student_id,attendance_date' },
        ),
    );
  }
}
console.log(
  'Seed complete: demo accounts, Grade 7A roster, attendance history, and parent link are ready.',
);
