/* Server-only targeted cleanup for known Schovera demo and verifier artifacts. */
import { createClient } from '@supabase/supabase-js';
import { schoolToday, shiftSchoolDate } from '../src/lib/school-date.mjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase server configuration is required.');

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const must = async (result) => {
  const { data, error } = await result;
  if (error) throw error;
  return data || [];
};
const ids = (rows) => rows.map((row) => row.id);
const dateDaysAgo = (days) => {
  return shiftSchoolDate(schoolToday(), -days);
};

async function deleteDemoUpdates(schoolId) {
  const rows = await must(
    admin
      .from('student_updates')
      .select('id,title')
      .eq('school_id', schoolId),
  );
  const removable = rows.filter((row) =>
    /^(production\b|deploy state check$|phase 1\b|verification\b)/i.test(
      row.title,
    ),
  );
  const updateIds = ids(removable);
  if (!updateIds.length) return 0;
  await must(admin.from('acknowledgements').delete().in('update_id', updateIds));
  await must(admin.from('audit_events').delete().in('target_id', updateIds));
  await must(admin.from('student_updates').delete().in('id', updateIds));
  return updateIds.length;
}

async function deleteDemoNotices(schoolId) {
  const rows = await must(
    admin.from('announcements').select('id,title').eq('school_id', schoolId),
  );
  const removable = rows.filter((row) =>
    /^(cross-role\b|production\b|verification\b)/i.test(row.title),
  );
  const announcementIds = ids(removable);
  if (!announcementIds.length) return 0;
  await must(admin.from('audit_events').delete().in('target_id', announcementIds));
  await must(admin.from('announcements').delete().in('id', announcementIds));
  return announcementIds.length;
}

async function deleteVerifierClasses(schoolId) {
  const classes = await must(
    admin
      .from('classes')
      .select('id,division')
      .eq('school_id', schoolId),
  );
  const classIds = ids(classes.filter((row) => /^V/i.test(row.division)));
  if (!classIds.length) return 0;
  const students = await must(
    admin.from('students').select('id').in('class_id', classIds),
  );
  const studentIds = ids(students);
  if (studentIds.length)
    await must(
      admin.from('parent_student_links').delete().in('student_id', studentIds),
    );
  await must(
    admin
      .from('audit_events')
      .delete()
      .in('target_id', classIds),
  );
  await must(
    admin
      .from('teacher_class_assignments')
      .delete()
      .in('class_id', classIds),
  );
  if (studentIds.length)
    await must(admin.from('students').delete().in('id', studentIds));
  await must(admin.from('classes').delete().in('id', classIds));
  return classIds.length;
}

async function deleteVerificationProfiles() {
  const profiles = await must(
    admin
      .from('profiles')
      .select('id,email')
      .ilike('email', '%@verification.invalid'),
  );
  for (const profile of profiles) {
    const { error } = await admin.auth.admin.deleteUser(profile.id);
    if (error) throw error;
  }
  return profiles.length;
}

async function deleteVerificationSchools() {
  const schools = await must(
    admin
      .from('schools')
      .select('id')
      .like('code', 'VERIFY-%'),
  );
  for (const school of schools) {
    const classes = await must(
      admin.from('classes').select('id').eq('school_id', school.id),
    );
    const classIds = ids(classes);
    const students = classIds.length
      ? await must(admin.from('students').select('id').in('class_id', classIds))
      : [];
    const studentIds = ids(students);
    if (studentIds.length)
      await must(
        admin.from('parent_student_links').delete().in('student_id', studentIds),
      );
    if (classIds.length)
      await must(
        admin
          .from('teacher_class_assignments')
          .delete()
          .in('class_id', classIds),
      );
    if (studentIds.length)
      await must(admin.from('students').delete().in('id', studentIds));
    if (classIds.length)
      await must(admin.from('classes').delete().in('id', classIds));
    await must(admin.from('announcements').delete().eq('school_id', school.id));
    await must(admin.from('audit_events').delete().eq('school_id', school.id));
    await must(admin.from('schools').delete().eq('id', school.id));
  }
  return schools.length;
}

async function normalizeDemoAttendance(schoolId) {
  const grade7 = await must(
    admin
      .from('classes')
      .select('id')
      .eq('school_id', schoolId)
      .eq('grade', '7')
      .eq('division', 'A')
      .single(),
  );
  const allowedDates = new Set([0, 1, 2, 3, 4].map(dateDaysAgo));
  const records = await must(
    admin
      .from('attendance_records')
      .select('id,attendance_date')
      .eq('class_id', grade7.id),
  );
  const outdatedIds = ids(
    records.filter((record) => !allowedDates.has(record.attendance_date)),
  );
  if (outdatedIds.length)
    await must(admin.from('attendance_records').delete().in('id', outdatedIds));
  return outdatedIds.length;
}

const demoSchool = await must(
  admin.from('schools').select('id').eq('code', 'SCHOVERA-DEMO').single(),
);
const removed = {
  updates: await deleteDemoUpdates(demoSchool.id),
  notices: await deleteDemoNotices(demoSchool.id),
  classes: await deleteVerifierClasses(demoSchool.id),
  profiles: await deleteVerificationProfiles(),
  schools: await deleteVerificationSchools(),
  attendance: await normalizeDemoAttendance(demoSchool.id),
};
console.log(
  `Targeted cleanup complete: ${removed.updates} updates, ${removed.notices} notices, ${removed.classes} verifier classes, ${removed.profiles} verifier profiles, ${removed.schools} verifier schools, and ${removed.attendance} out-of-baseline attendance rows removed.`,
);
