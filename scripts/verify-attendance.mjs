/* Server-only Phase 2A verification. It creates and removes only records tagged by its exact IDs. */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { schoolToday, shiftSchoolDate } from '../src/lib/school-date.mjs';

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
  attendanceIds: [],
  classIds: [],
  studentIds: [],
  attendanceAudit: null,
  schoolIds: [],
  authUserIds: [],
};
const suffix = randomUUID().slice(0, 8);
const dateDaysAgo = (days) => {
  return shiftSchoolDate(schoolToday(), -days);
};
const testDate = dateDaysAgo(21);

function expect(value, message) {
  if (!value) throw new Error(message);
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
  return client;
}
async function expectDenied(result, message) {
  const { error } = await result;
  expect(Boolean(error), message);
}

async function cleanup() {
  if (temporary.attendanceAudit)
    await must(admin
      .from('audit_events')
      .delete()
      .eq('event_type', 'attendance_saved')
      .contains('metadata', temporary.attendanceAudit));
  if (temporary.attendanceIds.length)
    await must(admin
      .from('attendance_records')
      .delete()
      .in('id', temporary.attendanceIds));
  if (temporary.studentIds.length) {
    await must(admin
      .from('parent_student_links')
      .delete()
      .in('student_id', temporary.studentIds));
    await must(admin.from('students').delete().in('id', temporary.studentIds));
  }
  if (temporary.classIds.length)
    await must(admin.from('classes').delete().in('id', temporary.classIds));
  for (const id of temporary.authUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  if (temporary.schoolIds.length)
    await must(admin.from('schools').delete().in('id', temporary.schoolIds));
}

try {
  const school = await must(
    admin.from('schools').select('id').eq('code', 'SCHOVERA-DEMO').single(),
  );
  const profiles = await must(
    admin
      .from('profiles')
      .select('id,role,email')
      .in('email', [
        'teacher@schovera.demo',
        'parent@schovera.demo',
        'principal@schovera.demo',
      ]),
  );
  const byEmail = (email) =>
    profiles.find((profile) => profile.email === email);
  const teacherProfile = byEmail('teacher@schovera.demo');
  const parentProfile = byEmail('parent@schovera.demo');
  const principalProfile = byEmail('principal@schovera.demo');
  expect(
    teacherProfile && parentProfile && principalProfile,
    'Seed roles are missing. Run npm run seed:demo first.',
  );
  const assignment = await must(
    admin
      .from('teacher_class_assignments')
      .select('class_id')
      .eq('teacher_id', teacherProfile.id)
      .is('ended_at', null)
      .single(),
  );
  const roster = await must(
    admin
      .from('students')
      .select('id,full_name')
      .eq('class_id', assignment.class_id)
      .eq('active', true)
      .order('roll_number'),
  );
  expect(
    roster.length >= 2,
    'Attendance verifier requires the seeded Grade 7A roster.',
  );
  const aarav = roster.find((student) => student.full_name === 'Aarav Patil');
  expect(aarav, 'Aarav Patil is missing.');
  const teacher = await signIn(teacherProfile.email);
  const parent = await signIn(parentProfile.email);
  const principal = await signIn(principalProfile.email);

  const assignedRead = await must(
    teacher
      .from('attendance_records')
      .select('id')
      .eq('class_id', assignment.class_id)
      .limit(1),
  );
  expect(
    assignedRead.length === 1,
    'Assigned teacher could not read class attendance.',
  );
  const parentRead = await must(
    parent
      .from('attendance_records')
      .select('student_id')
      .eq('student_id', aarav.id)
      .limit(10),
  );
  expect(
    parentRead.every((record) => record.student_id === aarav.id),
    'Parent could not read linked child attendance.',
  );

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
  const otherChild = await must(
    admin
      .from('students')
      .insert({
        school_id: school.id,
        class_id: unassignedClass.id,
        roll_number: `V${suffix}`,
        full_name: 'Attendance Verification Child',
      })
      .select('id')
      .single(),
  );
  temporary.studentIds.push(otherChild.id);
  const otherParentEmail = `attendance-parent-${suffix}@verification.invalid`;
  const otherParentAuth = await admin.auth.admin.createUser({
    email: otherParentEmail,
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
      full_name: 'Attendance Verification Parent',
      email: otherParentEmail,
    }),
  );
  await must(
    admin.from('parent_student_links').insert({
      parent_id: otherParentAuth.data.user.id,
      student_id: otherChild.id,
      relationship_label: 'Parent',
      status: 'active',
    }),
  );
  const parentLeak = await must(
    parent
      .from('attendance_records')
      .select('id')
      .eq('student_id', otherChild.id),
  );
  expect(
    parentLeak.length === 0,
    'Parent could read another child attendance.',
  );
  await expectDenied(
    teacher.rpc('save_class_attendance', {
      p_class_id: unassignedClass.id,
      p_attendance_date: testDate,
      p_records: [{ student_id: otherChild.id, status: 'present' }],
    }),
    'Teacher could mark an unassigned class.',
  );
  await expectDenied(
    parent.rpc('save_class_attendance', {
      p_class_id: assignment.class_id,
      p_attendance_date: testDate,
      p_records: roster.map((student) => ({
        student_id: student.id,
        status: 'present',
      })),
    }),
    'Parent could write attendance.',
  );
  await expectDenied(
    parent.from('attendance_records').insert({
      school_id: school.id,
      class_id: assignment.class_id,
      student_id: aarav.id,
      marked_by: parentProfile.id,
      attendance_date: testDate,
      status: 'present',
    }),
    'Parent direct attendance insert was not blocked.',
  );

  const schoolB = await must(
    admin
      .from('schools')
      .insert({
        name: `Attendance School ${suffix}`,
        code: `ATTENDANCE-${suffix}`,
      })
      .select('id')
      .single(),
  );
  temporary.schoolIds.push(schoolB.id);
  const classB = await must(
    admin
      .from('classes')
      .insert({
        school_id: schoolB.id,
        grade: '7',
        division: 'B',
        academic_year: '2026-27',
      })
      .select('id')
      .single(),
  );
  temporary.classIds.push(classB.id);
  const studentB = await must(
    admin
      .from('students')
      .insert({
        school_id: schoolB.id,
        class_id: classB.id,
        roll_number: '01',
        full_name: 'School B Attendance Child',
      })
      .select('id')
      .single(),
  );
  temporary.studentIds.push(studentB.id);
  const crossSchool = await must(
    principal.from('students').select('id').eq('id', studentB.id),
  );
  expect(crossSchool.length === 0, 'Principal A could read School B data.');

  const initialRecords = roster.map((student, index) => ({
    student_id: student.id,
    status: index === 1 ? 'absent' : index === 2 ? 'late' : 'present',
  }));
  const { error: saveError } = await teacher.rpc('save_class_attendance', {
    p_class_id: assignment.class_id,
    p_attendance_date: testDate,
    p_records: initialRecords,
  });
  if (saveError) throw saveError;
  temporary.attendanceAudit = {
    class_id: assignment.class_id,
    attendance_date: testDate,
  };
  const saved = await must(
    admin
      .from('attendance_records')
      .select('id,student_id,status')
      .eq('class_id', assignment.class_id)
      .eq('attendance_date', testDate),
  );
  temporary.attendanceIds.push(...saved.map((record) => record.id));
  expect(
    saved.length === roster.length,
    'Attendance save did not persist a complete roster.',
  );
  const changedRecords = roster.map((student, index) => ({
    student_id: student.id,
    status: index === 0 ? 'late' : 'present',
  }));
  const { error: updateError } = await teacher.rpc('save_class_attendance', {
    p_class_id: assignment.class_id,
    p_attendance_date: testDate,
    p_records: changedRecords,
  });
  if (updateError) throw updateError;
  const updated = await must(
    admin
      .from('attendance_records')
      .select('id,student_id,status')
      .eq('class_id', assignment.class_id)
      .eq('attendance_date', testDate),
  );
  expect(
    updated.length === roster.length &&
      updated.find((record) => record.student_id === roster[0].id)?.status ===
        'late',
    'Same-day attendance did not update without duplicates.',
  );
  const parentHistory = await must(
    parent
      .from('attendance_records')
      .select('student_id,status')
      .eq('student_id', aarav.id)
      .eq('attendance_date', testDate),
  );
  expect(
    parentHistory.length === 1,
    'Parent did not receive linked child attendance history.',
  );
  const principalOverview = await must(
    principal
      .from('attendance_records')
      .select('class_id,status')
      .eq('class_id', assignment.class_id)
      .eq('attendance_date', testDate),
  );
  expect(
    principalOverview.length === roster.length,
    'Principal did not receive school attendance overview.',
  );
  console.log(
    'Attendance verification passed: roster save/update, parent history, principal overview, and authorization isolation.',
  );
} finally {
  await cleanup();
}
