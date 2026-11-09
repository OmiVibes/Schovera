import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';

// Read-only UI capture. Never load production files, print credentials or submit forms.
assertLocalTestEnvironment(process.env, { requireServiceRole: false });
const flags = Object.fromEntries(process.argv.slice(2).map((item, index, args) => item.startsWith('--') ? [item.slice(2), args[index + 1]] : null).filter(Boolean));
for (const key of Object.keys(flags)) assert.ok(['accounts-file', 'family-file', 'output'].includes(key), 'Unknown capture option.');
assert.ok(flags['accounts-file'] && flags.output, 'Supply --accounts-file and a new --output directory.');
const { accounts } = JSON.parse(await readFile(flags['accounts-file'], 'utf8'));
const family = flags['family-file'] ? JSON.parse(await readFile(flags['family-file'], 'utf8')) : null;
const privatePasswords = [...Object.values(accounts).map(account => account.password), family?.password].filter(Boolean);
const safeError = error => privatePasswords.reduce((message, password) => message.replaceAll(password, '[redacted]'), String(error.message)).slice(0, 500);
const root = path.resolve(flags.output);
await mkdir(path.dirname(root), { recursive: true });
await mkdir(root); // Existing folders are never overwritten or deleted.
const base = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3103';
const widths = [1440, 768, 390];
const expected = {
  parent: ['home', 'profile', 'updates', 'attendance', 'homework', 'timetable', 'notices'],
  teacher: ['home', 'students', 'profile', 'attendance', 'homework', 'timetable', 'ai', 'notices'],
  principal: ['home', 'students', 'users', 'communication', 'attendance', 'homework', 'timetable', 'notices'],
};
let revision = 'local running snapshot';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Isolated runtime snapshots need not contain .git. */ }
const manifest = { capturedAt: new Date().toISOString(), base, revision, widths, screenshots: [], routes: {}, errors: [], externalBlocked: [], mutationsBlocked: [], notes: [] };
const browser = await chromium.launch({ headless: true });
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await ctx.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) { manifest.externalBlocked.push(url.hostname); return route.abort(); }
    if (url.pathname.startsWith('/rest/v1/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      manifest.mutationsBlocked.push(`${request.method()} ${url.pathname}`); return route.abort();
    }
    return route.continue();
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => manifest.errors.push({ route: new URL(page.url()).pathname, message: safeError(error) }));
  return { ctx, page };
}
async function ready(page) {
  await page.waitForFunction(() => document.querySelectorAll('.skeleton, .notice-skeleton, .principal-communication-skeleton').length === 0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
}
async function capture(page, role, name, state = 'default', selectedWidths = widths) {
  for (const width of selectedWidths) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await ready(page);
    // App navigation uses smooth scrolling. Finish scrolling before capturing a
    // sticky header; otherwise full-page PNGs can freeze it halfway down the page.
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
    await page.waitForFunction(() => window.scrollY === 0);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const folder = path.join(root, role, `${width}px`); await mkdir(folder, { recursive: true });
    const filename = path.join(folder, `${name}--${state}.png`);
    // Full-page screenshots resize the browser viewport. Freeze only sticky
    // positioning during capture so its resize-driven nav reveal cannot paint
    // the header halfway down a full-document image. Colours/layout are retained.
    await page.screenshot({ path: filename, fullPage: true, animations: 'disabled', style: '.application-shell { position: relative !important; top: auto !important; }', mask: [page.locator('input[type=password]')], maskColor: '#e9dfe5' });
    const size = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, documentHeight: document.documentElement.scrollHeight }));
    manifest.screenshots.push({ file: path.relative(root, filename).replaceAll('\\', '/'), role, page: name, state, width, ...size });
  }
}
async function login(page, account, role) {
  assert.ok(account?.email && account?.password, `Missing private ${role} login.`);
  await page.goto(base); await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in securely', exact: true }).click();
  await page.locator(`.role-${role}`).waitFor(); await page.locator('nav.app-section-nav').waitFor(); await ready(page);
}
async function expand(page) {
  for (let pass = 0; pass < 3; pass++) {
    const summaries = page.locator('details:not([open]):not(.mobile-profile-menu) > summary');
    const count = await summaries.count(); if (!count) break;
    // Use actual clicks so OptionalSection mounts its content through React.
    for (let index = 0; index < count; index++) {
      const summary = page.locator('details:not([open]):not(.mobile-profile-menu) > summary').first();
      if (await summary.isVisible()) await summary.click(); else break;
    }
    await ready(page);
  }
}
try {
  const publicPage = await context(); await publicPage.page.goto(base);
  for (const lang of ['en', 'hi', 'mr']) {
    await publicPage.page.locator('.language-selector select').selectOption(lang);
    await capture(publicPage.page, 'sign-in', 'sign-in', lang);
  }
  await publicPage.ctx.close();
  for (const role of Object.keys(expected)) {
    const { ctx, page } = await context(); await login(page, accounts[role], role);
    const routes = await page.locator('nav.app-section-nav a').evaluateAll(links => links.map(link => new URL(link.href).pathname));
    assert.deepEqual([...routes].sort(), expected[role].map(section => `/${role}/${section}`).sort(), `${role} navigation changed; update coverage.`);
    manifest.routes[role] = routes;
    for (const section of expected[role]) {
      await page.goto(`${base}/${role}/${section}`); await page.locator(`.role-${role}`).waitFor(); await ready(page);
      if (role === 'teacher' && ['students', 'profile'].includes(section)) {
        await page.locator('button.student').first().waitFor(); await page.locator('button.student').first().click(); await ready(page);
      }
      await capture(page, role, section);
      if (role === 'principal' && section === 'students') {
        await page.locator('button.student').first().click(); await ready(page); await expand(page);
        await capture(page, role, section, 'student-details-expanded');
      }
      if (section === 'attendance') {
        const chart = page.locator('.attendance-trends'); await chart.locator('[aria-pressed=true]').first().waitFor();
        for (const period of ['7 days', '6 months', 'All saved records']) {
          await chart.getByRole('button', { name: period, exact: true }).click(); await page.locator('.attendance-trends[data-loaded=true]').waitFor();
          if (period === 'All saved records') await expand(page);
          await capture(page, role, section, period.toLowerCase().replaceAll(' ', '-'), [1440, 390]);
        }
      }
      if (['home', 'profile', 'communication', 'notices', 'updates'].includes(section)) {
        const count = await page.locator('details:not(.mobile-profile-menu)').count();
        if (count) { await expand(page); await capture(page, role, section, 'expanded', [1440, 390]); }
      }
      if (section === 'home') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.mobile-profile-menu summary').click();
        await capture(page, role, section, 'mobile-profile-menu', [390]);
        await page.locator('.mobile-profile-menu summary').click();
        for (const language of ['hi', 'mr']) {
          await page.locator('.language-selector select').selectOption(language);
          await capture(page, role, section, language, [1440, 390]);
        }
        await page.locator('.language-selector select').selectOption('en');
      }
      if (role === 'principal' && section === 'users') {
        const load = page.getByRole('button', { name: 'Load school accounts', exact: true });
        if (await load.count()) { await load.click(); await page.locator('.account-create-form').waitFor(); }
        for (const accountRole of ['parent', 'teacher', 'principal']) {
          await page.locator('.account-create-form select').first().selectOption(accountRole);
          await capture(page, role, section, `add-${accountRole}`, [1440, 390]);
        }
      }
      if (role === 'teacher' && section === 'ai') {
        for (const kind of ['exam', 'worksheet', 'lesson-plan']) {
          await page.locator('.teacher-ai-form select').first().selectOption(kind);
          await capture(page, role, section, kind, [1440, 390]);
        }
        await page.locator('input[type=file]').setInputFiles({ name: 'ui-review-sample.csv', mimeType: 'text/csv', buffer: Buffer.from('Subject,Topic,Periods\nScience,Plant cells,2\nEnglish,Reading,1') });
        await page.locator('.teacher-sheet-scroll').waitFor();
        await capture(page, role, section, 'local-workbook', [1440, 390]);
      }
      if (role === 'teacher' && section === 'homework') {
        const edit = page.getByRole('button', { name: 'Edit homework', exact: true }).first();
        if (await edit.count()) { await edit.click(); await capture(page, role, section, 'edit-form', [1440, 390]); }
      }
      console.log(`Captured ${role}/${section}.`);
    }
    await ctx.close();
  }
  if (family) {
    const { ctx, page } = await context(); await login(page, family, 'parent');
    await page.locator('.child-switcher select').waitFor();
    const children = await page.locator('.child-switcher select option').evaluateAll(options => options.map(option => ({ value: option.value, text: option.textContent })));
    assert.equal(children.length, 2);
    for (let index = 0; index < children.length; index++) {
      await page.goto(`${base}/parent/home`); await page.locator('.child-switcher select').selectOption(children[index].value); await ready(page);
      await capture(page, 'parent-multi-child', 'home', `child-${index + 1}`, [1440, 390]);
      await page.goto(`${base}/parent/attendance`); await ready(page);
      await capture(page, 'parent-multi-child', 'attendance', `child-${index + 1}`, [1440, 390]);
    }
    await ctx.close();
  }
} catch (error) { manifest.errors.push({ captureFailure: safeError(error) }); }
finally {
  // Write a usable partial report on failure; never call a partial capture complete.
  manifest.externalBlocked = [...new Set(manifest.externalBlocked)];
  manifest.mutationsBlocked = [...new Set(manifest.mutationsBlocked)];
  const problems = manifest.screenshots.filter(item => item.documentWidth > item.viewportWidth + 1);
  manifest.overflow = problems.map(item => item.file);
  const roles = ['parent', 'teacher', 'principal'];
  for (const role of roles) {
    for (const width of widths) {
      const entries = manifest.screenshots.filter(item => item.role === role && item.state === 'default' && item.width === width);
      if (entries.length !== expected[role].length) manifest.errors.push({ missingBaseRoutes: role, width });
    }
  }
  manifest.complete = manifest.errors.length === 0;
  await writeFile(path.join(root, 'coverage.json'), JSON.stringify(manifest, null, 2));
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const gallery = `<html lang="en"><meta charset="utf-8"><title>Schovera UI review</title><style>body{font:16px system-ui;background:#faf6f8;color:#291e28;margin:32px}h1,h2{color:#7c0e44}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}article{background:white;border:1px solid #e5c8d5;padding:14px;border-radius:12px}img{width:100%;height:280px;object-fit:cover;object-position:top}a{color:#7c0e44}small{display:block}</style><h1>Schovera UI screenshot review</h1><p>${manifest.screenshots.length} captures. Complete: ${manifest.complete}. Click a preview for the full image. Passwords are masked. These are local presentation records.</p>${['sign-in', ...roles, 'parent-multi-child'].map(role => `<h2>${role}</h2><div class="grid">${manifest.screenshots.filter(item => item.role === role).map(item => `<article><a href="${escape(item.file)}"><img loading="lazy" src="${escape(item.file)}"><b>${escape(item.page)}</b><small>${escape(item.state)} · ${item.width}px</small></a></article>`).join('')}</div>`).join('')}</html>`;
  await writeFile(path.join(root, 'OPEN_GALLERY.html'), gallery);
  await writeFile(path.join(root, 'README_FOR_GPT.md'), `# Schovera UI review pack\n\nCaptured ${manifest.capturedAt}. Revision ${manifest.revision}. Capture complete: **${manifest.complete}**.\n\nOpen OPEN_GALLERY.html for a clickable gallery. Images are grouped by portal and viewport: desktop 1440, tablet 768 and mobile 390 pixels. Base pages cover every navigation destination in all three portals (23 total), plus sign-in in English/Hindi/Marathi. Full-page screenshots include content below the fold. Additional states cover expanded sections, attendance windows/tables, mobile profile menus, localized home pages, account-role forms, student details, homework editing, AI input modes, a synthetic local workbook and both children of the separate Parent account. coverage.json lists the exact files, captured states, errors and overflow findings.\n\nThis is an actual local UI capture, not a designed mockup. Visible school names, student names and school-account addresses are local presentation records. Password inputs are masked; credentials and session tokens are not included. Review the images before sharing them outside your intended audience. No school forms were submitted, attendance marked, messages acknowledged/sent, accounts created or stored records changed. Only Auth sign-in/refresh and authorized reads were allowed; mutation requests were blocked.\n\nLimits: this is not every possible record, filter combination, browser-native dropdown popup, error/loading state or AI-generated answer. Screenshots cannot prove audible voice, security, accessibility or functional correctness. Hidden tools are captured only where available in these local roles; unavailable states are not fabricated. Scrollable lists/tables initially show their current viewport; the browser gallery links to the full page.\n\n## Prompt to send with the images\n\nPlease review this real school website for an international competition. It has exactly three portals: Parent, Teacher and Principal. Give concrete page-by-page UI improvements in simple language. Keep the existing plum/rose palette (#7C0E44, #AA5E7A, #D49A9A, #F2DACE), existing functionality and separate role permissions. Prioritize clear navigation, readable typography, balanced spacing, meaningful use of width, button hierarchy, understandable attendance charts, simple voice/translation controls, mobile usability and consistency. Identify each issue by screenshot filename, explain why it matters, and suggest a specific change. Rank suggestions as must-fix, should-fix or optional. Do not propose fake data, teacher/student rankings, confusing extra portals, removing security, or calling gate scans classroom attendance. Do not claim to have tested sound or interactions from a static image. Start with the desktop default pages and mobile equivalents, then inspect expanded states and localized examples.\n\n## Capture findings\n\nScreenshots: ${manifest.screenshots.length}. Browser/capture errors: ${manifest.errors.length}. Horizontal overflow captures: ${manifest.overflow.length}.\n\n${manifest.errors.length ? JSON.stringify(manifest.errors, null, 2) : 'No browser/capture errors recorded.'}\n`);
  await writeFile(path.join(root, 'README_FOR_GPT.md'), '\nCapture note: the header is held in normal document position only while taking full-page images, preventing sticky-header/viewport-resize artifacts. No website styles were saved or changed. Password fields have a neutral privacy mask. Read this UI as a parent with limited digital confidence and a Grade 7 student presenter would; prefer clear, simple improvements.\n', { flag: 'a' });
  // Self-contained overview sheets are easy to attach before the full-size images.
  const sheet = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  for (const role of roles) {
    const entries = manifest.screenshots.filter(item => item.role === role && item.state === 'default' && [1440, 390].includes(item.width));
    const tiles = await Promise.all(entries.map(async item => `<article><h2>${escape(item.page)} · ${item.width}px</h2><img src="data:image/png;base64,${(await readFile(path.join(root, item.file))).toString('base64')}"></article>`));
    await sheet.setContent(`<html><style>body{margin:24px;background:#faf5f7;font:14px system-ui;color:#35232e}h1{color:#7c0e44}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}article{background:#fff;border:1px solid #d49a9a;padding:10px;border-radius:10px}h2{font-size:13px}img{width:100%;height:340px;object-fit:cover;object-position:top}</style><h1>Schovera — ${role} portal overview</h1><p>Desktop and mobile previews. Open the corresponding full-page images to inspect all content.</p><div class="grid">${tiles.join('')}</div></html>`);
    await sheet.screenshot({ path: path.join(root, `OVERVIEW_${role.toUpperCase()}.png`), fullPage: true });
  }
  await browser.close();
  console.log(`Saved ${manifest.screenshots.length} screenshots and 3 overview sheets. Complete=${manifest.complete}. Folder: ${root}`);
  if (!manifest.complete) process.exitCode = 1;
}
