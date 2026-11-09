// Presentation labels only. Never use these for identity, queries or filtering.
export function schoolDisplayName(name: string) {
  return name === 'Schovera Model School — Demo Campus' ? 'Schovera Model School' : name;
}
export function academicYearDisplayName(year: string) {
  return /^\d{4}[–-]\d{2,4} Demo$/.test(year) ? year.slice(0, -5) : year;
}
