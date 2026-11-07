export type TrendRecord = {
  attendance_date: string;
  status: 'present' | 'absent' | 'late';
};
export type TrendGroup = {
  date: string;
  present: number;
  absent: number;
  late: number;
};
export function attendanceTotals(rows: TrendRecord[]) {
  const totals = {
    present: 0,
    absent: 0,
    late: 0,
    total: rows.length,
    days: new Set(rows.map((r) => r.attendance_date)).size,
  };
  for (const row of rows) totals[row.status]++;
  return {
    ...totals,
    rate: totals.total
      ? ((totals.present + totals.late) / totals.total) * 100
      : null,
  };
}
export function groupAttendanceRate(group: TrendGroup) {
  const total = group.present + group.absent + group.late;
  return total ? ((group.present + group.late) / total) * 100 : null;
}
export function trendStart(
  today: string,
  period: 'week' | 'month' | 'sixMonths',
) {
  const date = new Date(`${today}T00:00:00Z`);
  if (period === 'week') date.setUTCDate(date.getUTCDate() - 6);
  else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - (period === 'month' ? 1 : 6));
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  return date.toISOString().slice(0, 10);
}
export function attendanceTrend(rows: TrendRecord[], monthly: boolean) {
  const groups = new Map<string, TrendGroup>();
  for (const row of rows) {
    const date = monthly
      ? row.attendance_date.slice(0, 7)
      : row.attendance_date;
    const group = groups.get(date) ?? { date, present: 0, absent: 0, late: 0 };
    group[row.status]++;
    groups.set(date, group);
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));
}
