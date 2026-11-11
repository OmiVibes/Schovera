import assert from 'node:assert/strict';
import { navigatePortal } from './lib/navigate-portal.mjs';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { uiText, uiCopy } from '../src/lib/ui-copy.ts';
assertLocalTestEnvironment(process.env, { requireServiceRole: false });
const base = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3104';
try {
  const health = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(5000) });
  assert.equal(health.status, 200);
} catch { throw new Error('Local Supabase is unavailable; start Docker and the isolated local stack before browser verification.'); }
const sections = {
  teacher: { home: '.teacher-home-dashboard', students: '#teacher-students', profile: '#teacher-profile', attendance: '#teacher-attendance', homework: '#teacher-homework', timetable: '#teacher-timetable', ai: '.teacher-ai-workspace', notices: '#teacher-notices' },
  principal: { home: '.workspace-shortcuts', students: '#principal-students', users: '.manage-users', communication: '#principal-recent-communication', attendance: '#principal-attendance', homework: '#principal-homework', timetable: '#principal-timetable', notices: '#principal-notices' },
};
const browser = await chromium.launch();
let checks = 0;
try {
  for (const role of Object.keys(sections)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const errors = [], outside = [];
    await context.route('**/*', route => {
      const host = new URL(route.request().url()).hostname;
      if (['127.0.0.1', 'localhost', '[::1]'].includes(host)) return route.continue();
      outside.push(host); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByLabel('Email', { exact: true }).fill(`${role}@schovera.demo`);
    await page.getByLabel('Password', { exact: true }).fill(process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!');
    await page.getByRole('button', { name: 'Sign in securely', exact: true }).click();
    await page.locator(`.role-${role}`).waitFor();
    if (role === 'teacher') await page.locator('.teacher-class-panel .chips button.active').waitFor();
    for (const language of ['en', 'hi', 'mr']) {
      await page.locator('.language-selector select').selectOption(language);
      await page.waitForFunction(lang => document.documentElement.lang === lang, language);
      for (const [section, selector] of Object.entries(sections[role])) {
        await navigatePortal(page, role, section);
        await page.waitForURL(url => url.pathname === `/${role}/${section}`);
        await page.locator(selector).waitFor();
        await page.waitForFunction(() => !document.querySelector('.skeleton, .notice-skeleton, .principal-communication-skeleton'));
        if (role === 'teacher' && ['profile', 'students'].includes(section)) {
          const student = page.locator('#teacher-students button.student').first();
          await student.waitFor(); if (await student.getAttribute('aria-pressed') !== 'true') await student.click();
        }
        const marked = await page.locator(`${selector} h1, ${selector} h2, ${selector} h3, ${selector} button, ${selector} label`).evaluateAll(nodes => nodes.filter(node => {
          // Database-authored titles and people's names may happen to match a
          // placeholder dictionary key. They must remain original text.
          if (node.matches('h3') && node.closest('.assignment-card, .school-notice-card, .update-card')) return false;
          if (node.matches('button.student')) return false;
          return true;
        }).map(node => node.textContent));
        for (const text of marked.map(value => value.trim()).filter(Boolean)) {
          // Only exact known interface strings: never translate or reject authored data.
          if (uiCopy[text] && uiText(text, language) !== text) assert.fail(`${role}/${section}: untranslated interface string: ${text}`);
        }
        if (language !== 'en' && role === 'teacher' && section !== 'ai') {
          const contextText = await page.locator('.teacher-today-card').innerText();
          assert.ok(!/students|register open|Official school notices|Ready for parent updates/.test(contextText), `${role}/${section}: class context was not localized`);
        }
        if (language !== 'en' && section === 'timetable') {
          assert.ok(!/Grade \d/.test(await page.locator('.timetable-workspace .section-heading').innerText()), `${role}: timetable class context was not localized`);
        }
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${role}/${section}/${language}: overflow at ${width}px`);
          checks++;
        }
      }
    }
    assert.deepEqual(errors, [], `${role}: browser runtime errors`);
    assert.deepEqual(outside, [], `${role}: external browser request`);
    await context.close();
  }
  console.log(`Staff localization passed: ${checks} role/page/language/width checks, no browser runtime errors or external requests. Authored content is preserved.`);
} finally { await browser.close(); }
