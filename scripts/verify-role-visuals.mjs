import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.SCHOVERA_TEST_URL || 'http://localhost:3000';
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
const widths = [1440, 1024, 768, 390];
const destinations = {
  teacher: ['home', 'students', 'profile', 'attendance', 'homework', 'timetable', 'ai', 'notices'],
  parent: ['home', 'profile', 'updates', 'attendance', 'homework', 'timetable', 'notices'],
  principal: ['home', 'students', 'communication', 'attendance', 'homework', 'timetable', 'notices'],
};
const expectedContent = {
  teacher: {
    home: '.teacher-home-dashboard', students: '#teacher-students', profile: '#teacher-profile',
    attendance: '#teacher-attendance', homework: '#teacher-homework', timetable: '#teacher-timetable', ai: '.teacher-ai-workspace', notices: '#teacher-notices',
  },
  parent: {
    home: '#right-now-heading', profile: '#parent-profile', updates: '#parent-updates',
    attendance: '#parent-attendance', homework: '#parent-homework', timetable: '#parent-timetable', notices: '#parent-notices',
  },
  principal: {
    home: '.workspace-shortcuts', students: '#principal-students', communication: '#principal-recent-communication',
    attendance: '#principal-attendance', homework: '#principal-homework', timetable: '#principal-timetable', notices: '#principal-notices',
  },
};
const screenshotRoot = join(tmpdir(), `schovera-role-visuals-${new Date().toISOString().replaceAll(':', '-')}`);
const failures = [];
const pageErrors = [];

await mkdir(screenshotRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function signIn(page, role) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (await page.locator('input[type="email"]').count()) {
    await page.locator('input[type="email"]').fill(`${role}@schovera.demo`);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
  }
  await page.locator('nav.app-section-nav').waitFor({ state: 'visible', timeout: 20000 });
  if (role === 'teacher') {
    await page.locator('.teacher-class-panel .chips button').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('.teacher-class-panel .chips button.active').waitFor({ state: 'visible', timeout: 15000 });
    const demoClass = page.getByRole('button', { name: 'Grade 7A', exact: true });
    if (await demoClass.count() && !(await demoClass.getAttribute('class'))?.includes('active')) await demoClass.click();
  }
  if (role === 'parent') {
    await page.waitForFunction(() => {
      const name = document.querySelector('#parent-child-heading')?.textContent?.trim();
      return Boolean(name && name !== 'Your child' && name !== 'Child');
    }, null, { timeout: 15000 });
    const option = page.locator('.child-switcher select option').filter({ hasText: 'Aarav Patil' }).first();
    if (await option.count()) {
      await page.locator('.child-switcher select').selectOption({ label: 'Aarav Patil' });
      await page.locator('#parent-child-heading').getByText('Aarav Patil', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() => document.querySelectorAll('.skeleton, .principal-communication-skeleton, .notice-skeleton').length === 0, null, { timeout: 20000 });
      await page.locator('#parent-home[data-content-ready="true"]').waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('.parent-latest-update').waitFor({ state: 'visible', timeout: 20000 });
    }
  }
}

async function navigate(page, role, section) {
  const path = `/${role}/${section}`;
  await page.locator(`nav.app-section-nav a[href="${path}"]`).click();
  await page.waitForURL((url) => url.pathname === path, { timeout: 15000 });
  await page.waitForFunction((expected) => {
    const active = document.querySelector('nav.app-section-nav a[aria-current="page"]');
    return active instanceof HTMLAnchorElement && new URL(active.href).pathname === expected;
  }, path, { timeout: 15000 });
  await page.locator(expectedContent[role][section]).waitFor({ state: 'visible', timeout: 20000 });
  if (role === 'teacher' && section !== 'ai') await page.locator('.teacher-class-panel .chips button.active').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.skeleton, .principal-communication-skeleton, .notice-skeleton').length === 0, null, { timeout: 20000 });
  if (role === 'teacher' && ['students', 'profile'].includes(section)) {
    const student = page.locator('#teacher-students button.student').first();
    await student.waitFor({ state: 'visible', timeout: 15000 });
    if ((await student.getAttribute('aria-pressed')) !== 'true') await student.click();
    if (section === 'profile') await page.locator('#teacher-profile h1').waitFor({ state: 'visible', timeout: 10000 });
  }
  if (role === 'principal' && section === 'students') {
    const student = page.locator('#principal-students .principal-student-results button.student').first();
    if (await student.count()) await student.click();
  }
}

async function checkWidth(page, role, section, width) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => document.querySelectorAll('.skeleton, .principal-communication-skeleton, .notice-skeleton').length === 0, null, { timeout: 20000 });
  if (role === 'parent' && section === 'home') {
    await page.locator('#parent-child-heading').getByText('Aarav Patil', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('#parent-home[data-content-ready="true"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('.parent-latest-update').waitFor({ state: 'visible', timeout: 20000 });
  }
  if (role === 'principal' && section === 'home') {
    await page.locator('#principal-recent-communication').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('.principal-communication-skeleton').waitFor({ state: 'detached', timeout: 20000 });
  }
  const result = await page.evaluate(({ role, section }) => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    active: document.querySelector('nav.app-section-nav a[aria-current="page"]')?.getAttribute('href') || '',
    activeVisible: (() => { const nav = document.querySelector('nav.app-section-nav')?.getBoundingClientRect(); const link = document.querySelector('nav.app-section-nav a[aria-current="page"]')?.getBoundingClientRect(); return Boolean(nav && link && link.left >= nav.left - 1 && link.right <= nav.right + 1); })(),
    duplicateParentHomeProfile: role === 'parent' && section === 'home' && document.querySelectorAll('#parent-profile').length > 0,
    parentHomeLayout: role === 'parent' && section === 'home' ? (() => { const element = document.querySelector('.parent-dashboard-home'); return element ? { width: Math.round(element.getBoundingClientRect().width), maxWidth: getComputedStyle(element).maxWidth, columns: getComputedStyle(element).gridTemplateColumns, ancestors: [element.parentElement, element.parentElement?.parentElement, element.parentElement?.parentElement?.parentElement].map((node) => node ? { className: node.className, width: Math.round(node.getBoundingClientRect().width), maxWidth: getComputedStyle(node).maxWidth, display: getComputedStyle(node).display } : null) } : null; })() : null,
    overflowing: Array.from(document.querySelectorAll('body *')).map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), className: typeof element.className === 'string' ? element.className : '', id: element.id || '', left: Math.round(rect.left * 10) / 10, right: Math.round(rect.right * 10) / 10, width: Math.round(rect.width * 10) / 10 };
    }).filter((element) => element.right > document.documentElement.clientWidth + 0.5 || element.left < -0.5).slice(0, 8),
  }), { role, section });
  if (result.document > result.viewport + 1 || result.body > result.viewport + 1) {
    failures.push(`${role}/${section} at ${width}px overflows (viewport=${result.viewport}, document=${result.document}, body=${result.body}; elements=${JSON.stringify(result.overflowing)}).`);
  }
  if (result.active !== `/${role}/${section}`) failures.push(`${role}/${section} at ${width}px lost active route state (active=${result.active || 'none'}).`);
  if (width === 390 && !result.activeVisible) failures.push(`${role}/${section} at 390px does not reveal the active navigation item.`);
  if (result.duplicateParentHomeProfile) failures.push('Parent home repeats the full profile underneath the child summary.');
  if (result.parentHomeLayout) console.log(`Parent home grid at ${width}px: ${JSON.stringify(result.parentHomeLayout)}`);
  if (width === 1440 || width === 390) {
    const filename = `${role}-${section}-${width}.png`;
    await page.screenshot({ path: join(screenshotRoot, filename), fullPage: true, animations: 'disabled' });
  }
}

try {
  for (const role of Object.keys(destinations)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(`${role}: ${error.message}`));
    await signIn(page, role);
    for (const section of destinations[role]) {
      if (page.url().split('/').filter(Boolean).at(-1) !== section) await navigate(page, role, section);
      else await page.locator(expectedContent[role][section]).waitFor({ state: 'visible', timeout: 20000 });
      for (const width of widths) await checkWidth(page, role, section, width);
      console.log(`Inspected ${role}/${section} at ${widths.join(', ')}px.`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (pageErrors.length) failures.push(...pageErrors.map((message) => `Browser page error: ${message}`));
if (failures.length) {
  console.log(`Screenshots: ${screenshotRoot}`);
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Role visual audit passed: ${Object.values(destinations).flat().length} destinations × ${widths.length} widths. Screenshots: ${screenshotRoot}`);
}
