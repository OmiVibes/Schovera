import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { translate } from '../src/lib/i18n.ts';
assertLocalTestEnvironment();
const base = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3103';
const browser = await chromium.launch({ headless: true });
try {
  for (const role of ['parent', 'teacher']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const outside = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return route.continue();
      outside.push(url.hostname); return route.abort();
    });
    await context.addInitScript(() => {
      window.__speechTest = { spoken: [], cancelled: 0 };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        speaking: false, paused: false, getVoices: () => ['en-IN', 'hi-IN', 'mr-IN'].map(lang => ({ lang })),
        speak: u => { window.__speechTest.spoken.push(u.text); queueMicrotask(() => u.onstart?.()); },
        cancel: () => { window.__speechTest.cancelled++; }, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
      } });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(text) { this.text = text; } } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    await page.goto(base); await page.getByLabel('Email', { exact: true }).fill(`${role}@schovera.demo`);
    await page.getByLabel('Password', { exact: true }).fill(process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!');
    await page.getByRole('button', { name: 'Sign in securely', exact: true }).click(); await page.locator(`.role-${role}`).waitFor();
    await page.goto(`${base}/${role}/notices`);
    const notice = page.locator('.school-notice-card').first(); await notice.waitFor();
    const controls = notice.locator('.parent-speech-controls'); await controls.waitFor();
    assert.equal(await controls.locator('select').inputValue(), 'en');
    assert.ok(!(await controls.innerText()).includes('Auto ('));
    for (const language of ['en', 'hi', 'mr']) {
      await page.locator('.language-selector select').selectOption(language);
      await controls.locator('select').selectOption('en'); // The original is English; changing the interface does not translate it.
      const listen = controls.getByRole('button', { name: translate(language, 'speech.listen'), exact: true });
      assert.equal(await listen.innerText(), translate(language, 'speech.listenShort'));
      const geometry = () => controls.evaluate(root => {
        const bounds = root.getBoundingClientRect();
        return [bounds.width, bounds.height, ...[...root.querySelectorAll('select,button')].flatMap(element => {
          const box = element.getBoundingClientRect();
          return [box.x - bounds.x, box.y - bounds.y, box.width, box.height];
        })];
      });
      const resting = await geometry();
      const assertStable = async () => {
        const current = await geometry();
        assert.equal(current.length, resting.length, 'Speech control slots changed.');
        assert.ok(current.every((value,index) => Math.abs(value-resting[index]) <= 1), `Speech controls moved during playback: ${JSON.stringify({ resting, current })}`);
      };
      await listen.focus(); await page.keyboard.press('Enter');
      await controls.getByRole('button', { name: translate(language, 'speech.pause'), exact: true }).waitFor();
      await assertStable();
      await controls.getByRole('button', { name: translate(language, 'speech.pause'), exact: true }).click();
      await assertStable();
      await controls.getByRole('button', { name: translate(language, 'speech.resume'), exact: true }).click();
      await assertStable();
      await controls.getByRole('button', { name: translate(language, 'speech.stop'), exact: true }).click();
      await assertStable();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    assert.equal(await page.evaluate(() => window.__speechTest.spoken.length), 3);
    await page.locator('.language-selector select').selectOption('en');
    await controls.locator('select').selectOption('ko');
    assert.equal(await controls.getByRole('button', { name: 'Listen to notice', exact: true }).isDisabled(), true);
    assert.ok((await controls.innerText()).includes('Korean playback needs Korean text'));
    assert.equal(await page.evaluate(() => window.__speechTest.spoken.length), 3, 'Changing a voice must not speak or translate the English original.');
    await controls.locator('select').selectOption('en');
    await controls.getByRole('button', { name: 'Listen to notice', exact: true }).click();
    await controls.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    const before = await page.evaluate(() => window.__speechTest.cancelled);
    await page.locator(`nav.app-section-nav a[href="/${role}/home"]`).click();
    await page.waitForURL(url => url.pathname === `/${role}/home`);
    await page.waitForFunction(count => window.__speechTest.cancelled > count, before);
    assert.ok(await page.evaluate(() => window.__speechTest.cancelled) > before, 'Navigation did not cancel playback.');
    assert.deepEqual(outside, []);
    console.log(`${role}: Listen/Pause/Resume/Stop, keyboard, English/Hindi/Marathi labels, 390px layout and stop-on-navigation passed with a controlled speech adapter. Audio not verified.`);
    await context.close();
  }
} finally { await browser.close(); }
