import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';

assertLocalTestEnvironment(process.env, { requireServiceRole: false });
const baseURL = process.env.SCHOVERA_TEST_URL || 'http://localhost:3000';
const target = new URL(baseURL);
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname.toLowerCase())) {
  throw new Error('Parent voice browser verification requires an HTTP loopback app URL.');
}
const parentEmail = process.env.SCHOVERA_PARENT_EMAIL || 'parent@schovera.demo';
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const realSynthesis = window.speechSynthesis;
    window.__realSpeechCapabilities = {
      synthesis: typeof realSynthesis !== 'undefined',
      utterance: typeof window.SpeechSynthesisUtterance !== 'undefined',
      voiceLocales: typeof realSynthesis === 'undefined' ? [] : realSynthesis.getVoices().map((voice) => voice.lang),
    };
    const listeners = new Set();
    const fakeSynthesis = {
      speaking: false,
      paused: false,
      spoken: [],
      cancels: 0,
      getVoices: () => [{ lang: 'en-IN' }, { lang: 'hi-IN' }, { lang: 'mr-IN' }],
      speak(utterance) {
        this.speaking = true;
        this.spoken.push(utterance.text);
        queueMicrotask(() => utterance.onstart?.(new Event('start')));
      },
      cancel() { this.speaking = false; this.paused = false; this.cancels += 1; },
      pause() { this.paused = true; },
      resume() { this.paused = false; },
      addEventListener(_type, listener) { listeners.add(listener); },
      removeEventListener(_type, listener) { listeners.delete(listener); },
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: fakeSynthesis });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class {
        constructor(text) { this.text = text; this.lang = ''; this.voice = null; this.onstart = null; this.onend = null; this.onerror = null; }
      },
    });
    Object.defineProperty(window, '__fakeSpeech', { configurable: true, value: fakeSynthesis });
  });
  const page = await context.newPage();
  const requests = [];
  const responses = [];
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  page.on('response', (response) => responses.push(`${response.request().method()} ${new URL(response.url()).host}${new URL(response.url()).pathname} ${response.status()}`));
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  if (await page.getByLabel('Email').count()) {
    await page.getByLabel('Email').fill(parentEmail);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
  }
  try {
    await page.locator('.role-parent').waitFor({ timeout: 30000 });
  } catch {
    const message = await page.locator('[role="alert"]').allTextContents().catch(() => []);
    const otherRoles = await page.locator('.role-teacher, .role-principal, .role-mismatch-card').evaluateAll((nodes) => nodes.map((node) => node.className));
    const hasLogin = Boolean(await page.getByLabel('Email').count());
    const bodySummary = (await page.locator('body').innerText()).slice(0, 320).replace(/\s+/gu, ' ');
    throw new Error(`Local Parent sign-in did not reach the Parent workspace; login form=${hasLogin}; other workspace markers=${otherRoles.join(',') || 'none'}; message=${message.join(' ') || 'none'}; page errors=${pageErrors.join(' | ') || 'none'}; local responses=${responses.join(' | ') || 'none'}; screen=${bodySummary}.`);
  }
  await page.waitForFunction(() => Boolean(window.__realSpeechCapabilities));
  const browserCapability = await page.evaluate(() => window.__realSpeechCapabilities);

  const candidates = ['/parent/updates', '/parent/notices', '/parent/profile'];
  let control = page.locator('.parent-speech-controls').first();
  for (const route of candidates) {
    if (await control.count()) break;
    await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('.role-parent').waitFor();
    control = page.locator('.parent-speech-controls').first();
  }
  assert.ok(await control.count(), 'Local demo Parent has no communication card to exercise voice controls.');
  // Existing originals have no reliable language metadata: choose explicitly.
  await control.getByLabel('Notice language', { exact: true }).selectOption('en');
  const listen = control.getByRole('button', { name: 'Listen to notice' });
  assert.ok(await listen.count(), 'Listen action is missing its accessible English name.');
  await listen.focus();
  assert.equal(await listen.evaluate((node) => node === document.activeElement), true, 'Listen action is not keyboard focusable.');
  // Focusing the window can schedule the app's existing authorized recovery
  // reads. Let those settle before attributing subsequent requests to playback.
  await page.waitForLoadState('networkidle');
  const requestsBeforePlayback = requests.length;
  await listen.click();
  await control.getByRole('status').filter({ hasText: 'Reading notice aloud.' }).waitFor();
  assert.equal(await page.evaluate(() => window.__fakeSpeech.spoken.length), 1, 'Mock browser engine did not receive exactly one utterance.');
  assert.equal(await page.evaluate(() => window.__fakeSpeech.spoken[0].length > 0), true, 'Mock utterance text is empty.');
  const pause = control.getByRole('button', { name: 'Pause' });
  assert.ok(await pause.count(), 'Active notice does not expose Pause.');
  await pause.click();
  const resume = control.getByRole('button', { name: 'Resume' });
  await resume.waitFor();
  await resume.click();
  const stop = control.getByRole('button', { name: 'Stop' });
  await stop.waitFor();
  await stop.click();
  assert.equal(await page.evaluate(() => window.__fakeSpeech.speaking), false, 'Stop did not clear the mock engine state.');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Speech controls overflow at 390px.');
  const requestsAfterPlayback = requests.slice(requestsBeforePlayback);
  assert.deepEqual(requestsAfterPlayback, [], 'Speech playback initiated an application HTTP request.');
  console.log(`Parent voice browser controls passed at 390px. Real browser speech API: ${browserCapability.synthesis && browserCapability.utterance ? 'present' : 'unavailable'}; real voice locales reported: ${browserCapability.voiceLocales.length}; audible playback was not tested.`);
  await context.close();
} finally {
  await browser.close();
}
