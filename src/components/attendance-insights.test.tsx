// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AttendanceInsights } from './attendance-insights';
import { loadAttendanceInsights } from '@/lib/attendance-insights-data';

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/i18n-provider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/attendance-insights-data', () => ({ loadAttendanceInsights: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.resetAllMocks());

it.each(['role', 'schoolId', 'profileId', 'classId'] as const)('withholds the previous result immediately when %s changes', async (field) => {
  const data = { classes: [{ id: 'class-a', grade: '8', division: 'A' }], students: [{ id: 'a', class_id: 'class-a', full_name: 'Synthetic previous scope' }], records: [], range: { from: '2026-10-01', to: '2026-10-19' }, timezone: 'Asia/Kolkata' };
  vi.mocked(loadAttendanceInsights).mockResolvedValueOnce(data).mockImplementation(() => new Promise(() => {}));
  const element = document.createElement('div'); document.body.append(element); const root = createRoot(element);
  const original = { role: 'teacher' as const, profileId: 'user-a', schoolId: 'school-a', classId: 'class-a' };
  try {
    await act(async () => root.render(<AttendanceInsights {...original} />));
    expect(element.textContent).toContain('Synthetic previous scope');
    const next = { ...original, [field]: field === 'role' ? 'principal' as const : 'scope-b' };
    await act(async () => root.render(<AttendanceInsights {...next} />));
    expect(element.textContent).not.toContain('Synthetic previous scope');
    expect(element.textContent).toContain('common.loading');
  } finally { await act(async () => root.unmount()); element.remove(); }
});
