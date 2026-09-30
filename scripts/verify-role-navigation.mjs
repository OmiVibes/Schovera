import { chromium } from 'playwright';

const baseUrl = process.env.SCHOVERA_TEST_URL || 'http://localhost:3000';
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
const check = (condition, message) => { if (!condition) throw new Error(message); };
const browser = await chromium.launch({ headless: true });

async function signIn(page, email) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (await page.locator('input[type="email"]').count()) {
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
    await page.waitForFunction(() =>
      Boolean(document.querySelector('nav.app-section-nav') || document.querySelector('[role="alert"]')),
      null,
      { timeout: 30000 },
    );
    if (!(await page.locator('nav.app-section-nav').isVisible().catch(() => false))) {
      const message = await page.locator('[role="alert"]').innerText().catch(() => '');
      const pageText = (await page.locator('body').innerText()).slice(0, 500);
      throw new Error(`Could not open the signed-in workspace. Alert: ${message || '(empty)'}. Page: ${pageText || '(empty)'}`);
    }
  }
  await page.locator('nav.app-section-nav').waitFor({ state: 'visible' });
}

async function navigate(page, role, section) {
  const target = `/${role}/${section}`;
  await page.evaluate(() => {
    window.__schoveraLoadingFlash = false;
    window.__schoveraLoadingObserver = new MutationObserver(() => {
      if (document.body.innerText.includes('Loading Schovera')) window.__schoveraLoadingFlash = true;
    });
    window.__schoveraLoadingObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.locator(`nav.app-section-nav a[href="${target}"]`).click();
  await page.waitForURL((url) => url.pathname === target);
  await page.locator('nav.app-section-nav a[aria-current="page"]').waitFor({ state: 'visible' });
  const loadingFlashed = await page.evaluate(() => {
    window.__schoveraLoadingObserver?.disconnect();
    return window.__schoveraLoadingFlash;
  });
  check(!loadingFlashed, `Full-screen Loading Schovera flashed while navigating to ${target}.`);
}

async function assertNoHorizontalOverflow(page, role, section) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/${role}/${section}`, { waitUntil: 'networkidle' });
  await page.locator('nav.app-section-nav').waitFor({ state: 'visible' });
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  check(dimensions.content <= dimensions.viewport + 1, `${role}/${section} overflows horizontally at 390px (${dimensions.content}px > ${dimensions.viewport}px).`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  await signIn(page, 'teacher@schovera.demo');
  await navigate(page, 'teacher', 'home');
  await page.locator('.teacher-home-dashboard').waitFor({ state: 'visible' });
  await navigate(page, 'teacher', 'attendance');
  await page.locator('#teacher-attendance').waitFor({ state: 'visible' });
  check(await page.locator('#teacher-update-form').count() === 0, 'Teacher Attendance route still renders the update composer.');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#teacher-attendance').waitFor({ state: 'visible' });
  await navigate(page, 'teacher', 'students');
  const assignedClass = page.locator('.teacher-class-panel .chips button').first();
  await assignedClass.waitFor({ state: 'visible' });
  if (!(await assignedClass.getAttribute('class'))?.includes('active')) await assignedClass.click();
  await page.locator('#teacher-students').waitFor({ state: 'visible' });
  const firstStudent = page.locator('#teacher-students button.student').first();
  await firstStudent.waitFor({ state: 'visible', timeout: 15000 });
  await firstStudent.click();
  await page.locator('#teacher-update-form').waitFor({ state: 'visible' });
  await navigate(page, 'teacher', 'ai');
  await page.locator('.teacher-ai-workspace').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Sign out' }).click();

  await signIn(page, 'parent@schovera.demo');
  await navigate(page, 'parent', 'home');
  await page.locator('#right-now-heading').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const name = document.querySelector('#parent-child-heading')?.textContent?.trim();
    return Boolean(name && name !== 'Your child' && name !== 'Child');
  });
  const childSelector = page.locator('.child-switcher select');
  if (await childSelector.count()) {
    const options = await childSelector.locator('option').evaluateAll((items) => items.map((option) => option.value));
    if (options.length > 1) await childSelector.selectOption(options.at(-1));
  }
  const selectedChild = await page.locator('#parent-child-heading').innerText();
  await navigate(page, 'parent', 'attendance');
  await page.locator('#parent-attendance').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const name = document.querySelector('#parent-child-heading')?.textContent?.trim();
    return Boolean(name && name !== 'Your child' && name !== 'Child');
  });
  const childAfterNavigation = await page.locator('#parent-child-heading').innerText();
  check(childAfterNavigation === selectedChild, `Parent selected child did not persist across route navigation (${selectedChild} → ${childAfterNavigation}).`);
  check(await page.locator('#parent-updates').count() === 0, 'Parent Attendance route still renders the Updates page.');
  await page.goto(`${baseUrl}/parent/attendance`, { waitUntil: 'networkidle' });
  await page.locator('#parent-attendance').waitFor({ state: 'visible' });
  await navigate(page, 'parent', 'notices');
  await page.locator('#parent-notices').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Sign out' }).click();

  await signIn(page, 'principal@schovera.demo');
  await navigate(page, 'principal', 'home');
  await page.locator('.workspace-shortcuts').waitFor({ state: 'visible' });
  await page.locator('.principal-awaiting-metric').click();
  await page.waitForURL((url) => url.pathname === '/principal/communication');
  await page.locator('.principal-communication-filter button[aria-pressed="true"]').waitFor({ state: 'visible' });
  check(await page.locator('.principal-communication-filter button[aria-pressed="true"]').innerText().then((text) => text.startsWith('Awaiting')), 'Principal Awaiting shortcut did not open the filtered communication page.');
  await page.locator('.principal-communication-filter button').first().click();
  await navigate(page, 'principal', 'students');
  await page.locator('#principal-students').waitFor({ state: 'visible' });
  check(await page.locator('#principal-notices').count() === 0, 'Principal Students route still renders the notices composer.');
  await navigate(page, 'principal', 'communication');
  await page.locator('#principal-recent-communication').waitFor({ state: 'visible' });
  await navigate(page, 'principal', 'attendance');
  await page.locator('#principal-attendance').waitFor({ state: 'visible' });
  await page.goto(`${baseUrl}/teacher/attendance`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'That workspace is not available to this account.' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Sign out and switch account' }).click();
  await page.locator('input[type="email"]').waitFor({ state: 'visible' });
  await signIn(page, 'teacher@schovera.demo');
  await page.locator('nav.app-section-nav').waitFor({ state: 'visible' });
  await assertNoHorizontalOverflow(page, 'teacher', 'home');
  await assertNoHorizontalOverflow(page, 'teacher', 'attendance');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'principal@schovera.demo');
  await assertNoHorizontalOverflow(page, 'principal', 'home');
  await assertNoHorizontalOverflow(page, 'principal', 'attendance');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'parent@schovera.demo');
  await assertNoHorizontalOverflow(page, 'parent', 'attendance');

  await context.close();
  console.log('Role navigation passed: routed destinations without full-screen loading flashes, refresh, selected-child continuity, role mismatch denial and account switching, and 390px overflow checks.');
} finally {
  await browser.close();
}
