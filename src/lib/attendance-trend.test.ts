import { expect, it } from 'vitest';
import {
  attendanceTotals,
  attendanceTrend,
  groupAttendanceRate,
  trendStart,
} from './attendance-trend';
it('uses seven calendar dates and clamps month ends without timezone shifts', () => {
  expect(trendStart('2026-11-06', 'week')).toBe('2026-10-31');
  expect(trendStart('2026-03-31', 'month')).toBe('2026-02-28');
  expect(trendStart('2026-08-31', 'sixMonths')).toBe('2026-02-28');
});
it('counts late as attended while excluding missing dates from the denominator', () => {
  expect(
    attendanceTotals([
      { attendance_date: '2026-10-01', status: 'present' },
      { attendance_date: '2026-10-01', status: 'late' },
      { attendance_date: '2026-10-03', status: 'absent' },
      { attendance_date: '2026-10-04', status: 'present' },
    ]),
  ).toEqual({ present: 2, late: 1, absent: 1, total: 4, days: 3, rate: 75 });
  expect(
    groupAttendanceRate({ date: '2026-10', present: 2, late: 1, absent: 1 }),
  ).toBe(75);
});
it('does not invent a rate when no records exist', () => {
  expect(attendanceTotals([])).toEqual({
    present: 0,
    late: 0,
    absent: 0,
    total: 0,
    days: 0,
    rate: null,
  });
  expect(
    groupAttendanceRate({ date: '2026-10', present: 0, late: 0, absent: 0 }),
  ).toBeNull();
});
it('groups recorded entries only, never inventing absent days', () => {
  expect(
    attendanceTrend(
      [
        { attendance_date: '2026-11-02', status: 'present' },
        { attendance_date: '2026-11-02', status: 'late' },
        { attendance_date: '2026-11-04', status: 'absent' },
      ],
      false,
    ),
  ).toEqual([
    { date: '2026-11-02', present: 1, absent: 0, late: 1 },
    { date: '2026-11-04', present: 0, absent: 1, late: 0 },
  ]);
});
it('uses calendar months for the long-range summary', () => {
  expect(
    attendanceTrend(
      [
        { attendance_date: '2026-10-20', status: 'present' },
        { attendance_date: '2026-10-02', status: 'absent' },
      ],
      true,
    ),
  ).toEqual([{ date: '2026-10', present: 1, absent: 1, late: 0 }]);
});
