export type ClassIdentity = { grade?: string | number | null; division?: string | null } | null | undefined;
type Localize = (source: string, values?: readonly unknown[]) => string;

/** Presentation only: never derive authorization, IDs or stored values from this label. */
export function classDisplay(value: ClassIdentity, localize?: Localize): string {
  const grade = String(value?.grade ?? '').trim();
  const section = String(value?.division ?? '').trim();
  if (!grade) return localize ? localize('Class') : 'Class';
  const suffix = section ? `-${section}` : '';
  return localize ? localize('Grade {0}{1}', [grade, suffix]) : `Grade ${grade}${suffix}`;
}

export function compareClasses(left: ClassIdentity, right: ClassIdentity): number {
  return String(left?.grade ?? '').localeCompare(String(right?.grade ?? ''), 'en', { numeric: true })
    || String(left?.division ?? '').localeCompare(String(right?.division ?? ''), 'en', { numeric: true });
}
