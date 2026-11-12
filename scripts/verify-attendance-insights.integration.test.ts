import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Browser, type Page } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { loadAttendanceInsights } from '../src/lib/attendance-insights-data';
import { classroomInsights } from '../src/lib/attendance-insights';
import { schoolToday, shiftSchoolDate } from '../src/lib/school-date.mjs';

it('local synthetic attendance scope, corrections, advisory UI and cleanup', async () => {
  assertLocalTestEnvironment();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const base = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3000';
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const schools: string[] = [], users: string[] = [];
  const password = `Synthetic-${randomUUID()}!aA1`;
  let browser: Browser | undefined;
  let teacherPage: Page | undefined;
  // Do not log queries, tokens, notice bodies or fixture identifiers.
  async function must<T extends { data: unknown; error: { message: string } | null }>(query: PromiseLike<T>): Promise<NonNullable<T['data']>> { const r = await query; if (r.error) throw new Error(r.error.message); return r.data as NonNullable<T['data']>; }
  async function school() { const s = await must(admin.from('schools').insert({ name: `Synthetic insights ${randomUUID()}`, code: `IN-${randomUUID().slice(0, 8)}`, timezone: 'Asia/Kolkata' }).select().single()); schools.push(s.id); return s.id as string; }
  async function account(role: string, schoolId: string) {
    const email = `${role}-${randomUUID()}@insights.local.test`;
    const u = await must(admin.auth.admin.createUser({ email, password, email_confirm: true })); if (!u.user) throw new Error('Synthetic user unavailable'); users.push(u.user.id);
    await must(admin.from('profiles').insert({ id: u.user.id, email, full_name: `Synthetic ${role}`, role, school_id: schoolId, active: true }));
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); await must(client.auth.signInWithPassword({ email, password }));
    return { id: u.user.id, email, role, client };
  }
  type Actor = Awaited<ReturnType<typeof account>>;
  async function login(actor: Actor) {
    const context = await browser!.newContext({ viewport: { width: 390, height: 844 } }); const external: string[] = [];
    await context.route('**/*', (route) => { const target = new URL(route.request().url()); if (['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || ['data:', 'blob:', 'about:'].includes(target.protocol)) return route.continue(); external.push(target.hostname); return route.abort(); });
    const page = await context.newPage(); await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByLabel('Email').fill(actor.email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in securely' }).click();
    await page.locator(`.role-${actor.role}`).waitFor({ timeout: 30000 }); await page.goto(`${base}/${actor.role}/attendance`, { waitUntil: 'networkidle' });
    if (actor.role === 'teacher') await page.locator('#teacher-attendance-insights > summary').click();
    return { page, context, external };
  }
  const panel = (page: Page) => page.getByTestId('attendance-insights');
  try {
    const a = await school(), b = await school();
    const teacher = await account('teacher', a), otherTeacher = await account('teacher', a), principal = await account('principal', a), foreign = await account('principal', b), parent = await account('parent', a);
    const classes = await must(admin.from('classes').insert([{ school_id: a, grade: '8', division: randomUUID().slice(0, 4), academic_year: 'INSIGHTS-TEST' }, { school_id: a, grade: '9', division: randomUUID().slice(0, 4), academic_year: 'INSIGHTS-TEST' }]).select());
    await must(admin.from('teacher_class_assignments').insert([{ teacher_id: teacher.id, class_id: classes[0].id }, { teacher_id: otherTeacher.id, class_id: classes[1].id }]));
    const students = await must(admin.from('students').insert([{ school_id: a, class_id: classes[0].id, full_name: 'Synthetic Insight A', roll_number: '01' }, { school_id: a, class_id: classes[0].id, full_name: 'Synthetic Insight B', roll_number: '02' }, { school_id: a, class_id: classes[1].id, full_name: 'Synthetic Unassigned', roll_number: '01' }]).select());
    await must(admin.from('parent_student_links').insert({ parent_id: parent.id, student_id: students[0].id, status: 'active' }));
    const dates = Array.from({ length: 10 }, (_, i) => shiftSchoolDate(schoolToday(), i - 20));
    for (let i = 0; i < dates.length; i++) await must(teacher.client.rpc('save_class_attendance', { p_class_id: classes[0].id, p_attendance_date: dates[i], p_records: students.slice(0, 2).map((s, n) => ({ student_id: s.id, status: n === 0 && [0, 1, 2, 7, 8, 9].includes(i) ? 'absent' : 'present' })) }));
    const before = await must(admin.from('attendance_records').select('*').eq('school_id', a).order('id'));
    const authorized = await loadAttendanceInsights(teacher.client, teacher.id, a, 'teacher', classes[0].id);
    expect(authorized.records).toHaveLength(20);
    expect(classroomInsights(authorized.students, authorized.records, classes[0].id, authorized.range).followup).toBe(1);
    await expect(loadAttendanceInsights(teacher.client, teacher.id, a, 'teacher', classes[1].id)).rejects.toThrow();
    await expect(loadAttendanceInsights(parent.client, parent.id, a, 'teacher', classes[0].id)).rejects.toThrow();
    await expect(loadAttendanceInsights(foreign.client, foreign.id, a, 'principal')).rejects.toThrow();
    expect((await loadAttendanceInsights(principal.client, principal.id, a, 'principal')).classes).toHaveLength(2);
    for (const actor of [otherTeacher, foreign]) expect(await must(actor.client.from('attendance_records').select('id').eq('class_id', classes[0].id))).toHaveLength(0);
    expect(await must(parent.client.from('attendance_records').select('id').eq('student_id', students[1].id))).toHaveLength(0);
    expect(await must(parent.client.from('attendance_records').select('id').eq('student_id', students[0].id))).toHaveLength(10);
    const anonymous = await createClient(url, key).from('attendance_records').select('id').eq('school_id', a); expect(anonymous.error || !anonymous.data?.length).toBeTruthy();
    expect((await parent.client.from('attendance_records').insert({ school_id: a, class_id: classes[0].id, student_id: students[0].id, marked_by: parent.id, attendance_date: dates[0], status: 'absent' })).error).toBeTruthy();
    console.log('Insights scope passed: assigned Teacher, school Principal, unassigned/cross-school/Parent-loader/anonymous denial; Parent original linked-child read preserved.');

    if (process.env.SCHOVERA_INSIGHTS_DATABASE_ONLY !== '1') {
      browser = await chromium.launch({ headless: true });
      const captures = mkdtempSync(join(tmpdir(), 'schovera-insights-ui-'));
      const staff = await login(teacher); await panel(staff.page).getByText('Attendance Follow-up Suggested', { exact: true }).waitFor();
      teacherPage = staff.page;
      await panel(staff.page).screenshot({ path: join(captures, 'teacher-mobile.png'), style: '.application-shell{visibility:hidden!important}' });
      const child = panel(staff.page).locator('.insights-students article').filter({ hasText: students[0].full_name });
      await child.getByText('Inspect underlying attendance records', { exact: true }).focus(); await staff.page.keyboard.press('Enter');
      expect(await child.locator('details[open]').count()).toBe(1); expect(await child.getByText(dates[9], { exact: true }).count()).toBeGreaterThan(0);
      for (const language of ['en', 'hi', 'mr']) {
        await staff.page.evaluate((lang) => localStorage.setItem('schovera.language', lang), language); await staff.page.reload({ waitUntil: 'networkidle' });
        await staff.page.locator('#teacher-attendance-insights > summary').click();
        const headings = { en: 'Classroom attendance insights', hi: 'कक्षा उपस्थिति की समीक्षा', mr: 'वर्ग उपस्थिती आढावा' };
        await panel(staff.page).getByRole('heading', { name: headings[language as keyof typeof headings], exact: true }).waitFor();
        expect(await staff.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
      await staff.page.evaluate(() => localStorage.setItem('schovera.language', 'en')); await staff.page.reload({ waitUntil: 'networkidle' });
        await staff.page.locator('#teacher-attendance-insights > summary').click();
      await staff.context.setOffline(true); await panel(staff.page).getByText('Offline.', { exact: false }).waitFor();
      expect(await panel(staff.page).getByText(students[0].full_name, { exact: true }).count()).toBe(0);
      await staff.context.setOffline(false); await panel(staff.page).getByText('Attendance Follow-up Suggested', { exact: true }).waitFor();
      await staff.page.route('**/rest/v1/attendance_records*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"synthetic failure"}' }));
      await panel(staff.page).getByRole('button', { name: 'Refresh insights' }).click(); await panel(staff.page).getByRole('alert').waitFor();
      expect(await panel(staff.page).locator('.insights-students article').count()).toBe(0);
      await staff.page.unroute('**/rest/v1/attendance_records*');
      let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
      await staff.page.route('**/rest/v1/attendance_records*', async (route) => { await gate; await route.continue().catch(() => {}); });
      await panel(staff.page).getByRole('button', { name: 'Refresh insights' }).click(); await panel(staff.page).getByText('Loading…', { exact: true }).waitFor(); release(); await staff.page.unroute('**/rest/v1/attendance_records*');
      await panel(staff.page).getByText('Attendance Follow-up Suggested', { exact: true }).waitFor();
      const leader = await login(principal); await panel(leader.page).getByText(students[0].full_name, { exact: true }).waitFor();
      expect(await panel(leader.page).getByText(students[2].full_name, { exact: true }).count()).toBe(0);
      await panel(leader.page).getByLabel('Inspect class').selectOption(classes[1].id); await panel(leader.page).getByText(students[2].full_name, { exact: true }).waitFor();
      await panel(leader.page).getByText('Not enough complete data:', { exact: false }).first().waitFor();
      await leader.page.setViewportSize({ width: 1440, height: 1000 });
      await panel(leader.page).getByLabel('Inspect class').selectOption(classes[0].id);
      await panel(leader.page).screenshot({ path: join(captures, 'principal-desktop.png') });
      const family = await login(parent); expect(await panel(family.page).count()).toBe(0);
      expect([...staff.external, ...leader.external, ...family.external]).toEqual([]);
      for (const view of [leader, family]) await view.context.close();
      console.log('Insights browser passed: evidence disclosure keyboard, en/hi/mr, 390px, Parent exclusion, Principal details, offline/loading/error and bounded refresh.');
      console.log(`Synthetic insights screenshots: ${captures}`);
    }
    expect(await must(admin.from('attendance_records').select('*').eq('school_id', a).order('id'))).toEqual(before);
    // Explicit correction through the existing authorized attendance workflow.
    for (const date of dates.slice(-5)) await must(teacher.client.rpc('save_class_attendance', { p_class_id: classes[0].id, p_attendance_date: date, p_records: students.slice(0, 2).map((s) => ({ student_id: s.id, status: 'present' })) }));
    const corrected = await loadAttendanceInsights(teacher.client, teacher.id, a, 'teacher', classes[0].id);
    const evaluated = classroomInsights(corrected.students, corrected.records, classes[0].id, corrected.range);
    expect(evaluated.followup).toBe(0); expect(evaluated.improved).toBe(1);
    if (teacherPage) {
      await panel(teacherPage).getByRole('button', { name: 'Refresh insights' }).click();
      await panel(teacherPage).getByText('Recent improvement:', { exact: false }).waitFor();
      expect(await panel(teacherPage).getByText('Attendance Follow-up Suggested', { exact: true }).count()).toBe(0);
    }
    for (const table of ['school_entry_events', 'fallback_simulation_preferences', 'fallback_simulation_deliveries', 'student_updates', 'announcements']) expect(await must(admin.from(table).select('id').eq('school_id', a))).toHaveLength(0);
    console.log('Insights corrections recomputed; read-only UI made no attendance changes and created no RFID/fallback/communication records.');
  } finally {
    await browser?.close();
    if (schools.length) {
      for (const table of ['attendance_records', 'audit_events']) await must(admin.from(table).delete().in('school_id', schools));
      if (users.length) { await must(admin.from('parent_student_links').delete().in('parent_id', users)); await must(admin.from('teacher_class_assignments').delete().in('teacher_id', users)); }
      for (const table of ['students', 'classes', 'profiles']) await must(admin.from(table).delete().in('school_id', schools));
      for (const user of users) await must(admin.auth.admin.deleteUser(user));
      await must(admin.from('schools').delete().in('id', schools));
      expect(await must(admin.from('schools').select('id').in('id', schools))).toHaveLength(0);
      expect(await must(admin.from('attendance_records').select('id').in('school_id', schools))).toHaveLength(0);
    }
    console.log('Temporary insights fixtures cleaned and verified.');
  }
}, 180000);
