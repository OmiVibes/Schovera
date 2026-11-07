import { expect, it } from 'vitest';
import { attendanceTrend, trendStart } from './attendance-trend';
it('uses seven calendar dates and clamps month ends without timezone shifts', () => {
  expect(trendStart('2026-11-06', 'week')).toBe('2026-10-31');
  expect(trendStart('2026-03-31', 'month')).toBe('2026-02-28');
  expect(trendStart('2026-08-31', 'sixMonths')).toBe('2026-02-28');
});
it('groups recorded entries only, never inventing absent days', () => {
  expect(attendanceTrend([{ attendance_date: '2026-11-02', status: 'present' }, { attendance_date: '2026-11-02', status: 'late' }, { attendance_date: '2026-11-04', status: 'absent' }], false)).toEqual([
    { date: '2026-11-02', present: 1, absent: 0, late: 1 }, { date: '2026-11-04', present: 0, absent: 1, late: 0 },
  ]);
});
it('uses calendar months for the long-range summary', () => {
  expect(attendanceTrend([{ attendance_date: '2026-10-20', status: 'present' }, { attendance_date: '2026-10-02', status: 'absent' }], true)).toEqual([{ date: '2026-10', present: 1, absent: 1, late: 0 }]);
});
