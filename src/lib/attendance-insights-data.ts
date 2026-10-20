import type { SupabaseClient } from '@supabase/supabase-js';
import { insightRange, type InsightRecord, type InsightStudent } from './attendance-insights';

export async function loadAttendanceInsights(db: SupabaseClient, profileId: string, schoolId: string, role: 'teacher' | 'principal', classId?: string, signal?: AbortSignal, now = new Date()) {
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || auth.user?.id !== profileId) throw new Error('Not authorized');
  const profile = await db.from('profiles').select('role,school_id,active').eq('id', profileId).single();
  if (profile.error || !profile.data.active || profile.data.role !== role || profile.data.school_id !== schoolId || !['teacher', 'principal'].includes(role)) throw new Error('Not authorized');
  const school = await db.from('schools').select('timezone').eq('id', schoolId).single();
  if (school.error) throw new Error('School timezone unavailable');
  const range = insightRange(now, school.data.timezone);
  let allowed: string[] | undefined;
  if (role === 'teacher') {
    const assignments = await db.from('teacher_class_assignments').select('class_id').eq('teacher_id', profileId).is('ended_at', null);
    if (assignments.error) throw new Error('Assignments unavailable');
    allowed = assignments.data.map((a) => a.class_id);
    if (!classId || !allowed.includes(classId)) throw new Error('Class not assigned');
  }
  let query = db.from('classes').select('id,grade,division').eq('school_id', schoolId).eq('active', true).order('grade').order('division').limit(101);
  if (role === 'teacher') query = query.eq('id', classId!);
  const classes = await query.abortSignal(signal ?? new AbortController().signal);
  if (classes.error || classes.data.length > 100) throw new Error('Class scope unavailable or too large');
  const classIds = classes.data.map((c) => c.id);
  async function pages(table: 'students' | 'attendance_records', select: string) {
    const output: unknown[] = [];
    if (!classIds.length) return output;
    for (let offset = 0; offset <= 5000; offset += 500) {
      let q = db.from(table).select(select).eq('school_id', schoolId).in('class_id', classIds).order('id').range(offset, offset + 499);
      if (table === 'students') q = q.eq('active', true);
      else q = q.gte('attendance_date', range.from).lte('attendance_date', range.to);
      const result = await q.abortSignal(signal ?? new AbortController().signal);
      if (result.error) throw new Error('Attendance data unavailable');
      output.push(...result.data);
      if (output.length > 5000) throw new Error('Data bound exceeded; no partial insights shown');
      if (result.data.length < 500) return output;
    }
    throw new Error('Data bound exceeded');
  }
  const [students, records] = await Promise.all([pages('students', 'id,class_id,full_name'), pages('attendance_records', 'student_id,class_id,attendance_date,status')]);
  return { classes: classes.data as { id: string; grade: string; division: string }[], students: students as InsightStudent[], records: records as InsightRecord[], range, timezone: school.data.timezone as string };
}
