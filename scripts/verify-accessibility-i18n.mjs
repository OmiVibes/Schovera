import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  getLanguagePreference,
  getLocale,
  languageOptions,
  languageStorageKey,
  parseLanguage,
  requiredParentTranslationKeys,
  translate,
} from '../src/lib/i18n.ts';
import { formatSchoolDate, schoolToday } from '../src/lib/school-date.mjs';

assert.deepEqual(languageOptions.map(({ code }) => code), ['en', 'hi', 'mr']);
assert.equal(parseLanguage('hi'), 'hi');
assert.equal(parseLanguage('mr'), 'mr');
assert.equal(parseLanguage('xyz'), 'en');
assert.equal(getLanguagePreference({ getItem: () => 'xyz' }), 'en');
assert.equal(getLanguagePreference({ getItem: () => { throw new Error('storage denied'); } }), 'en');
assert.equal(languageStorageKey, 'schovera.language');
assert.equal(translate('hi', 'not.a.real.key'), translate('en', 'common.unavailable'));
for (const key of requiredParentTranslationKeys) {
  for (const language of ['en', 'hi', 'mr']) {
    const value = translate(language, key);
    assert.ok(value && !value.includes(key), `Missing safe translation for ${language}:${key}`);
  }
}
assert.notEqual(translate('hi', 'ack.cta'), translate('en', 'ack.cta'));
assert.notEqual(translate('mr', 'ack.cta'), translate('en', 'ack.cta'));
assert.equal(getLocale('hi'), 'hi-IN');
assert.equal(getLocale('mr'), 'mr-IN');
const nearMidnightUtc = new Date('2026-09-26T18:45:00.000Z');
assert.equal(schoolToday(nearMidnightUtc, 'Asia/Kolkata'), '2026-09-27');
assert.equal(formatSchoolDate('2026-09-27', { year: 'numeric', month: '2-digit', day: '2-digit' }, 'hi-IN'), '27/09/2026');
const appSource = await readFile(new URL('../src/components/schovera-app.tsx', import.meta.url), 'utf8');
assert.match(appSource, /<p>\{update\.message\}<\/p>/, 'Teacher-authored message is not rendered as its original stored value.');
assert.match(appSource, /onClick=\{\(\) => acknowledge\?\.\(update\.id\)\}/, 'Acknowledgement no longer targets the same persisted update ID.');
assert.match(appSource, /db\.rpc\('acknowledge_update',\s*\{\s*p_update_id:\s*updateId\s*\}\)/, 'Language changes must not replace the secure acknowledgement RPC.');

const baseURL = process.env.SCHOVERA_TEST_URL || 'http://localhost:3000';
const parentEmail = process.env.SCHOVERA_PARENT_EMAIL || 'parent@schovera.demo';
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
const screenshotDir = join(tmpdir(), 'schovera-accessibility-i18n');
await mkdir(screenshotDir, { recursive: true });
let devServer;
try {
  await fetch(baseURL, { signal: AbortSignal.timeout(1200) });
} catch {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseURL)) {
    throw new Error('The configured browser test URL is not reachable.');
  }
  const port = new URL(baseURL).port || '3000';
  devServer = spawn(process.execPath, [join(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '--port', port], {
    cwd: process.cwd(), stdio: 'ignore', windowsHide: true,
  });
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline && !devServer.killed) {
    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* wait for the local dev server to bind */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) { devServer.kill(); throw new Error('Local Next.js did not become ready within 60 seconds.'); }
}
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').waitFor();
  for (let step = 0; step < 10 && await page.evaluate(() => document.activeElement?.getAttribute('type') !== 'email'); step++) {
    await page.keyboard.press('Tab');
  }
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'email', 'Keyboard login did not start at the email field.');
  await page.keyboard.insertText(parentEmail);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('type')), 'password', 'Keyboard login skipped the password field.');
  await page.keyboard.insertText(password);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('password-toggle')), true, 'Password visibility toggle is not keyboard reachable.');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('.password-field-wrap input').getAttribute('type'), 'text', 'Space did not reveal the password.');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('.password-field-wrap input').getAttribute('type'), 'password', 'Space did not hide the password.');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName === 'BUTTON' && !document.activeElement?.classList.contains('password-toggle')), true, 'Login submit button is not keyboard reachable.');
  await page.keyboard.press('Enter');
  await page.locator('.role-parent').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => {
    const heading = document.querySelector('#parent-child-heading')?.textContent?.trim();
    return Boolean(heading && heading !== 'Your child');
  }, undefined, { timeout: 30000 });
  const languageSelect = page.locator('.language-selector select');
  const originalChild = await page.locator('#parent-child-heading').textContent();
  assert.equal(await page.locator('main').count(), 1, 'Authenticated workspace should expose one main landmark.');
  assert.ok(await page.locator('.app-section-nav').getAttribute('aria-label'), 'Workspace navigation is unnamed.');
  assert.ok(await languageSelect.getAttribute('aria-label'), 'Language control is unnamed.');
  const acknowledgeButtons = page.locator('.parent-update-card button[aria-label]');
  if (await acknowledgeButtons.count()) {
    assert.ok(await acknowledgeButtons.first().getAttribute('aria-label'), 'Acknowledgement action has no accessible name.');
    await acknowledgeButtons.first().focus();
    assert.equal(await acknowledgeButtons.first().evaluate((node) => node === document.activeElement), true, 'Acknowledgement action cannot receive keyboard focus.');
  }
  const widths = [1440, 1024, 768, 390];
  for (const language of ['en', 'hi', 'mr']) {
    await languageSelect.selectOption(language);
    await page.waitForFunction((code) => document.documentElement.lang === code, language);
    await page.getByRole('heading', { name: translate(language, 'parent.atAGlance') }).waitFor();
    assert.equal(await page.locator('#parent-child-heading').textContent(), originalChild, 'Language change altered the selected child.');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), languageStorageKey), language, 'Language was not persisted locally.');
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, `${language} layout overflows at ${width}px.`);
      const navLinks = page.locator('.app-section-nav a');
      const finalNavLink = navLinks.last();
      await navLinks.first().focus();
      for (let step = 1; step < await navLinks.count(); step++) await page.keyboard.press('Tab');
      assert.equal(await finalNavLink.evaluate((node) => node === document.activeElement), true, `${language} navigation's final section is not keyboard-reachable at ${width}px.`);
      await page.screenshot({ path: join(screenshotDir, `${language}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await languageSelect.selectOption('mr');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.role-parent').waitFor();
  await page.waitForFunction(() => document.documentElement.lang === 'mr');
  assert.equal(await page.locator('.language-selector select').inputValue(), 'mr', 'Marathi preference did not survive refresh.');
  await page.waitForFunction((expected) => document.querySelector('#parent-child-heading')?.textContent === expected, originalChild);
  await page.evaluate((key) => localStorage.setItem(key, 'xyz'), languageStorageKey);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.role-parent').waitFor();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  assert.equal(await page.locator('.language-selector select').inputValue(), 'en', 'Invalid stored language did not safely fall back to English.');
  await page.waitForFunction((expected) => document.querySelector('#parent-child-heading')?.textContent === expected, originalChild);

  await page.locator('.language-selector select').selectOption('mr');
  await page.setViewportSize({ width: 720, height: 900 }); // 1440px desktop at 200% browser zoom equivalent CSS width
  const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(zoomOverflow, false, 'Parent layout overflows at the 200% zoom-equivalent 720px CSS viewport.');
  await page.screenshot({ path: join(screenshotDir, 'parent-200-percent-zoom.png'), fullPage: true });

  for (const email of [process.env.SCHOVERA_TEACHER_EMAIL || 'teacher@schovera.demo', process.env.SCHOVERA_PRINCIPAL_EMAIL || 'principal@schovera.demo']) {
    await page.locator('.account-actions button.link').click();
    await page.getByLabel('Email').waitFor();
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.locator('.login-card button').last().click();
    const role = email.startsWith('teacher') ? 'teacher' : 'principal';
    await page.locator(`.role-${role}`).waitFor({ timeout: 30000 });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${role} layout overflows at ${width}px.`);
      await page.screenshot({ path: join(screenshotDir, `${role}-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 720, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `${role} layout overflows at the 200% zoom-equivalent 720px CSS viewport.`);
  }

  const navLink = page.locator('.app-section-nav a').first();
  await navLink.focus();
  assert.equal(await navLink.evaluate((node) => node === document.activeElement), true, 'Navigation link cannot receive keyboard focus.');
  const selector = page.locator('.language-selector select');
  await selector.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  assert.equal(await selector.inputValue(), 'en', 'Native keyboard language selection did not work.');
  assert.ok(await page.locator('main.app').getAttribute('class'), 'Role workspace disappeared after keyboard navigation.');
  assert.deepEqual(consoleErrors, [], `Browser runtime errors: ${consoleErrors.join('; ')}`);
  console.log(`Accessibility/i18n browser verification passed. Screenshots: ${screenshotDir}`);
} finally {
  await browser?.close();
  devServer?.kill();
}
