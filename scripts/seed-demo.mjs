/* Server-only development seed. Never expose SUPABASE_SERVICE_ROLE_KEY to the browser. */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and private SUPABASE_SERVICE_ROLE_KEY before seeding.');
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
const people = [
  ['principal@schovera.demo', 'Dr. Meera Sharma', 'principal'],
  ['teacher@schovera.demo', 'Ananya Joshi', 'teacher'],
  ['parent@schovera.demo', 'Rajesh Patil', 'parent'],
];
const ids = {};
for (const [email, full_name, role] of people) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error && !error.message.includes('already')) throw error;
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  ids[role] = data?.user?.id || existing?.id;
}
const { data: school, error: schoolError } = await admin.from('schools').upsert({ name: 'Schovera International School', code: 'SCHOVERA-DEMO', timezone: 'Asia/Kolkata' }, { onConflict: 'code' }).select().single();
if (schoolError) throw schoolError;
for (const [email, full_name, role] of people) await admin.from('profiles').upsert({ id: ids[role], school_id: school.id, email, full_name, role, active: true });
const { data: grade7 } = await admin.from('classes').upsert({ school_id: school.id, grade: '7', division: 'A', academic_year: '2026-27' }, { onConflict: 'school_id,grade,division,academic_year' }).select().single();
await admin.from('teacher_class_assignments').upsert({ teacher_id: ids.teacher, class_id: grade7.id }, { onConflict: 'teacher_id,class_id' });
const { data: aarav } = await admin.from('students').upsert({ school_id: school.id, class_id: grade7.id, roll_number: '07', full_name: 'Aarav Patil' }, { onConflict: 'class_id,roll_number' }).select().single();
await admin.from('parent_student_links').upsert({ parent_id: ids.parent, student_id: aarav.id, relationship_label: 'Father', status: 'active' }, { onConflict: 'parent_id,student_id' });
console.log('Seed complete. Demo password:', password);
