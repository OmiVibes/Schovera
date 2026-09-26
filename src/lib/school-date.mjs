const dateParts = (value, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  return Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
};

/** Return the school's calendar date, independent of the browser's timezone. */
export function schoolToday(now = new Date(), timeZone = 'Asia/Kolkata') {
  const { year, month, day } = dateParts(now, timeZone);
  return `${year}-${month}-${day}`;
}

/** Add calendar days to a school DATE without converting through local time. */
export function shiftSchoolDate(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

/** Format a database DATE as a calendar date without shifting it by timezone. */
export function formatSchoolDate(date, options = {}) {
  const [year, month, day] = date.split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: 'UTC',
  }).format(calendarDate);
}
