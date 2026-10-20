import { schoolToday, shiftSchoolDate } from './school-date.mjs';

export type InsightStudent = { id: string; class_id: string; full_name: string };
export type InsightRecord = { student_id: string; class_id: string; attendance_date: string; status: 'present' | 'absent' | 'late' };
export type Pattern = 'repeated' | 'consecutive' | 'improvement';
export function insightRange(now: Date, timezone: string) {
  const today = schoolToday(now, timezone);
  return { from: shiftSchoolDate(today, -60), to: shiftSchoolDate(today, -1) };
}
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

/** Recorded observations only: never synthesizes expected school dates or absences. */
export function classroomInsights(students: InsightStudent[], records: InsightRecord[], classId: string, range: { from: string; to: string }) {
  const roster = students.filter((s) => s.class_id === classId);
  const ids = new Set(roster.map((s) => s.id));
  const rows = records.filter((r) => r.class_id === classId && ids.has(r.student_id) && r.attendance_date >= range.from && r.attendance_date <= range.to);
  const invalid = rows.some((r) => !validDate(r.attendance_date) || !['present', 'absent', 'late'].includes(r.status)) || ids.size !== roster.length;
  const dates = [...new Set(rows.filter((r) => validDate(r.attendance_date)).map((r) => r.attendance_date))].sort().slice(-10);
  const cells = new Map<string, InsightRecord[]>();
  for (const row of rows) { const key = `${row.student_id}:${row.attendance_date}`; cells.set(key, [...(cells.get(key) ?? []), row]); }
  const cell = (student: string, date: string) => cells.get(`${student}:${date}`) ?? [];
  const coverage = dates.map((date) => ({ date, recorded: roster.filter((s) => cell(s.id, date).length === 1).length, expected: roster.length }));
  const recent = dates.slice(-5);
  const complete = (window: string[]) => !invalid && window.every((date) => roster.every((s) => cell(s.id, date).length === 1));
  const quality = invalid || dates.some((date) => roster.some((s) => cell(s.id, date).length !== 1));
  const enough = recent.length === 5 && roster.length > 0 && complete(recent);
  const result = roster.map((student) => {
    const evidence = dates.map((date) => ({ date, status: cell(student.id, date).length === 1 ? cell(student.id, date)[0].status : cell(student.id, date).length > 1 ? 'conflict' as const : 'missing' as const }));
    const absenceDates = recent.filter((date) => cell(student.id, date).length === 1 && cell(student.id, date)[0].status === 'absent');
    const patterns: Pattern[] = [];
    if (enough) {
      if (absenceDates.length >= 3) patterns.push('repeated');
      if (recent.slice(-3).every((date) => cell(student.id, date)[0].status === 'absent')) patterns.push('consecutive');
      if (dates.length === 10 && complete(dates) && dates.slice(0, 5).filter((date) => cell(student.id, date)[0].status === 'absent').length >= 3 && absenceDates.length <= 1) patterns.push('improvement');
    }
    return { ...student, patterns, absenceDates, evidence, missing: evidence.filter((e) => e.status === 'missing').length };
  });
  return { dates, recent, coverage, quality, enough, students: result, followup: result.filter((s) => s.patterns.some((p) => p !== 'improvement')).length, improved: result.filter((s) => s.patterns.includes('improvement')).length };
}
