import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { mkdirSync } from 'node:fs';
assertLocalTestEnvironment();
mkdirSync('.local/blue-ui', { recursive: true });
const base = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3104';
const browser = await chromium.launch({ headless: true });
try {
  for (const role of ['parent', 'teacher', 'principal']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', route => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    let roster = [];
    page.on('response', async response => {
      if (new URL(response.url()).pathname !== '/rest/v1/students') return;
      try { const rows = await response.json(); if (Array.isArray(rows) && rows[0]?.full_name && rows[0]?.created_at) roster = rows; } catch { /* Other checks report failed reads. */ }
    });
    await page.goto(base); await page.getByLabel('Email', { exact: true }).fill(`${role}@schovera.demo`);
    await page.getByLabel('Password', { exact: true }).fill(process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!');
    await page.getByRole('button', { name: 'Sign in securely', exact: true }).click();
    await page.locator(`.role-${role}`).waitFor();
    assert.equal(await page.locator('.role-header').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
    assert.equal(await page.locator('.role-header').evaluate(el => getComputedStyle(el).getPropertyValue('--brand').trim()), '#7c0e44');
    await page.goto(`${base}/${role}/attendance`);
    const chart = page.locator('.attendance-trends'); await chart.waitFor();
    for (const period of ['7 days', '1 month', '6 months', 'All saved records']) {
      await chart.getByRole('button', { name: period, exact: true }).click();
      await page.locator('.attendance-trends[data-loaded="true"]').waitFor();
      assert.equal(await chart.getByRole('alert').count(), 0);
      assert.equal(await chart.getByRole('button', { name: period, exact: true }).getAttribute('aria-pressed'), 'true');
    }
    const year = chart.getByLabel('Academic year', { exact: true });
    // Check the real persisted-history visualizations, including keyboard access.
    await chart.locator('.attendance-line-chart').waitFor();
    assert.equal(await chart.locator('.attendance-metric').count(), 4);
    await chart.locator('.attendance-ring svg[role="img"]').waitFor();
    const point = chart.locator('.attendance-chart-point').first();
    await point.focus(); await page.keyboard.press('Enter');
    assert.equal(await point.getAttribute('aria-pressed'), 'true');
    if (role === 'parent') {
      const date = chart.locator('.attendance-calendar-day:not(:disabled)').first();
      await date.click(); assert.equal(await date.getAttribute('aria-pressed'), 'true');
    }
    await chart.locator('.attendance-all-records summary').click();
    assert.ok(await chart.locator('.attendance-all-records tbody tr').count() > 0);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true,`${role} attendance overflows at ${width}px`);
      assert.equal(await chart.locator('.attendance-chart-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),width<=800?1:2);
      await chart.screenshot({path:`.local/blue-ui/${role}-attendance-${width}.png`});
    }
    await page.setViewportSize({width:1440,height:1000});
    const years = await year.locator('option').evaluateAll(options => options.map(o => o.value).filter(Boolean));
    if (years.length) { await year.selectOption(years[0]); await page.locator('.attendance-trends[data-loaded="true"]').waitFor(); }
    await chart.getByRole('button', { name: 'Refresh', exact: true }).click(); await page.locator('.attendance-trends[data-loaded="true"]').waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const profile = page.locator('.mobile-profile-menu'); await profile.locator('summary').click(); await profile.locator('div').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true);
    await profile.locator('summary').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (role !== 'parent') {
      await page.goto(`${base}/${role}/students`);
      const recent = page.getByRole('button', { name: 'Recently added', exact: true }); await recent.click(); assert.equal(await recent.getAttribute('aria-pressed'), 'true');
      await page.locator('button.student').first().waitFor();
      assert.ok(roster.length, 'Directory data with persisted creation timestamps was not observed.');
      const newest = [...roster].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || a.full_name.localeCompare(b.full_name))[0];
      assert.ok((await page.locator('button.student').first().innerText()).includes(newest.full_name), 'Recently added did not show the newest persisted student first.');
      if (role === 'principal') { const count = await page.locator('button.student').count(); await page.getByRole('button', { name: /^View all/ }).click(); assert.ok(await page.locator('button.student').count() >= count); }
      await page.locator('button.student').first().click();
      if (role === 'teacher') await page.locator('nav.app-section-nav a[href="/teacher/profile"]').click();
    } else await page.goto(`${base}/parent/profile`);
    await page.locator(`#${role}-attendance-history summary`).click();
    await page.locator('.attendance-trends[data-loaded="true"]').waitFor();
    assert.equal(await page.locator('.attendance-trends [role=alert]').count(), 0);
    assert.match(await page.locator('.student-profile-identity').innerText(), /Roll number\s+\S+/, 'Student roll number is missing from profile details.');
    assert.equal(await page.locator('.student-profile-summary b').filter({ hasText: /^\s*awaiting\s*$/ }).count(), 0, 'Awaiting count must not disappear from the profile.');
    await page.screenshot({ path: `.local/blue-ui/${role}-profile-desktop.png`, fullPage: true });
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const fits = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const account = document.querySelector('.account-actions').getBoundingClientRect();
        return document.documentElement.scrollWidth <= viewport + 1 && account.left >= 0 && account.right <= viewport + 1;
      });
      assert.equal(fits, true, `Profile or account controls overflow at ${width}px.`);
    }
    await page.screenshot({ path: `.local/blue-ui/${role}-profile-mobile.png`, fullPage: true });
    await context.close(); console.log(`${role}: current plum theme, all periods, year filter, refresh, mobile profile menu and profile history passed.`);
  }
} finally { await browser.close(); }
