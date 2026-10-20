import { expect, it } from 'vitest';
import { classroomInsights, insightRange, type InsightRecord } from './attendance-insights';
const students = [{ id: 'a', class_id: 'c', full_name: 'Synthetic A' }];
const range = { from: '2026-10-01', to: '2026-10-19' };
const dates = Array.from({ length: 10 }, (_, n) => `2026-10-${String(n + 1).padStart(2, '0')}`);
const rows = (statuses: string[]) => statuses.map((status, i) => ({ student_id: 'a', class_id: 'c', attendance_date: dates[i], status } as InsightRecord));
const result = (statuses: string[]) => classroomInsights(students, rows(statuses), 'c', range);
it('no absence creates no pattern', () => expect(result(Array(10).fill('present')).followup).toBe(0));
it('one absence does not trigger follow-up', () => expect(result(['present', 'present', 'present', 'present', 'absent']).followup).toBe(0));
it('three of five recorded absences explains its exact dates', () => {
  const r = result(['absent', 'present', 'absent', 'present', 'absent']);
  expect(r.students[0].patterns).toEqual(['repeated']); expect(r.students[0].absenceDates).toEqual([dates[0], dates[2], dates[4]]);
});
it('last three consecutive recorded dates, not calendar days', () => expect(result(['present', 'present', 'absent', 'absent', 'absent']).students[0].patterns).toEqual(['repeated', 'consecutive']));
it('improvement compares five complete observations with five', () => expect(result(['absent', 'absent', 'absent', 'present', 'present', 'present', 'late', 'present', 'present', 'present']).improved).toBe(1));
it('incomplete class data suppresses follow-up', () => {
  const r = classroomInsights([...students, { id: 'b', class_id: 'c', full_name: 'B' }], rows(Array(5).fill('absent')), 'c', range);
  expect(r.quality).toBe(true); expect(r.followup).toBe(0); expect(r.students[1].missing).toBe(5);
});
it('corrections recompute without retained scores', () => { const data = rows(Array(5).fill('absent')); data.forEach((r) => r.status = 'present'); expect(classroomInsights(students, data, 'c', range).followup).toBe(0); });
it('small samples never produce patterns', () => expect(result(Array(3).fill('absent')).students[0].patterns).toEqual([]));
it.each(['absent', 'present'])('duplicate/conflicting %s cells are not counted', (status) => {
  const data = rows(Array(5).fill('absent')); data.push({ ...data[0], status: status as 'absent' | 'present' });
  const r = classroomInsights(students, data, 'c', range); expect(r.quality).toBe(true); expect(r.followup).toBe(0); expect(r.students[0].evidence[0].status).toBe('conflict');
});
it('timezone determines closed-day cutoff', () => { const now = new Date('2026-10-19T20:00:00Z'); expect(insightRange(now, 'Asia/Kolkata').to).toBe('2026-10-19'); expect(insightRange(now, 'America/Los_Angeles').to).toBe('2026-10-18'); });
it('does not synthesize weekends or holidays', () => { const data = rows(Array(5).fill('absent')).map((r, i) => ({ ...r, attendance_date: ['2026-10-02', '2026-10-05', '2026-10-08', '2026-10-12', '2026-10-16'][i] })); expect(classroomInsights(students, data, 'c', range).dates).toHaveLength(5); });
it('empty data does not infer absence', () => expect(classroomInsights(students, [], 'c', range).followup).toBe(0));
it('other classes, unknown former students and dates after cutoff are excluded', () => { const data = rows(Array(5).fill('absent')).map((r) => ({ ...r, class_id: 'other' })); expect(classroomInsights(students, data, 'c', range).dates).toEqual([]); });
