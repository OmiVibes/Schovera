// Real Chrome speech acceptance. Requires an interactive desktop and installed
// English voice. No speech mocks; only local synthetic seed accounts are used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
assertLocalTestEnvironment(process.env, { requireServiceRole: false });
const base = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3104';
const samples = {
  en: ['Schovera voice check. School notices can be read aloud.'],
  hi: [
    'नमस्ते। यह स्कूल की सूचना पढ़ने की आवाज़ का परीक्षण है।',
    'कृपया कल विज्ञान की किताब और अपनी कॉपी लेकर आएँ।',
    '7 नवंबर 2026 को सुबह 9 बजे अभिभावकों की बैठक है।',
  ],
  mr: [
    'नमस्कार. ही शाळेची सूचना वाचण्याच्या आवाजाची चाचणी आहे.',
    'कृपया उद्या विज्ञानाचे पुस्तक आणि तुमची वही घेऊन या.',
    '७ नोव्हेंबर २०२६ रोजी सकाळी ९ वाजता पालकांची बैठक आहे.',
  ],
  ko: [
    '안녕하세요. 학교 알림 음성 테스트입니다.',
    '내일 과학 교과서와 공책을 가져오세요.',
    '2026년 11월 7일 오전 9시에 학부모 모임이 있습니다.',
  ],
};
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--languages')) throw new Error('Use --languages en,hi,mr,ko to test installed voices with generic samples.');
const languages = args.length ? args[1].split(',') : [];
if (languages.some(language => !Object.hasOwn(samples, language)) || new Set(languages).size !== languages.length) throw new Error('Unsupported or repeated voice language.');
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  if (languages.length) await verifyInstalledLanguages(browser, languages);
  else for (const role of ['parent', 'teacher']) {
    const context = await browser.newContext();
    const outside = [];
    await context.route('**/*', route => {
      const host = new URL(route.request().url()).hostname;
      if (['127.0.0.1','localhost','[::1]'].includes(host)) return route.continue();
      outside.push(host); return route.abort();
    });
    await context.addInitScript(() => {
      window.__nativeSpeechEvents = [];
      const nativeSpeak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = utterance => {
        const index = window.__nativeSpeechEvents.length;
        window.__nativeSpeechEvents.push({ index, events: [] });
        for (const name of ['start','end','error']) utterance.addEventListener(name, event => window.__nativeSpeechEvents[index].events.push(name === 'error' ? `error:${event.error}` : name));
        nativeSpeak(utterance);
      };
    });
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    await page.goto(base);
    await page.getByLabel('Email', { exact: true }).fill(`${role}@schovera.demo`);
    await page.getByLabel('Password', { exact: true }).fill(process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!');
    await page.getByRole('button', { name: 'Sign in securely', exact: true }).click();
    await page.locator(`.role-${role}`).waitFor();
    await page.locator(`nav.app-section-nav a[href="/${role}/notices"]`).click();
    const controls = page.locator('.school-notice-card .parent-speech-controls').first();
    await controls.waitFor();
    assert.equal(await controls.locator('select').inputValue(), 'en');
    const listen = controls.getByRole('button', { name: 'Listen to notice', exact: true });
    await listen.click();
    await controls.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await controls.getByRole('button', { name: 'Pause', exact: true }).click();
    await controls.getByRole('button', { name: 'Stop', exact: true }).click();
    await listen.click();
    await controls.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    // Exercise the utterance-wrapper lifetime while the native engine runs.
    const session = await context.newCDPSession(page);
    await session.send('HeapProfiler.collectGarbage');
    await page.waitForFunction(() => window.__nativeSpeechEvents.at(-1)?.events.includes('end'), null, { timeout: 30000 });
    await listen.waitFor();
    const events = await page.evaluate(() => window.__nativeSpeechEvents.at(-1).events);
    assert.deepEqual(events, ['start','end']);
    assert.deepEqual(outside, []);
    console.log(`${role}: real Chrome speech start/end, Pause → Stop → Listen restart and garbage-collection survival passed. This does not certify physical speaker audibility.`);
    await context.close();
  }
} finally { await browser.close(); }

async function verifyInstalledLanguages(browser, requested) {
  const page = await browser.newPage();
  const outside = [];
  await page.route('**/*', route => {
    if (['127.0.0.1','localhost','[::1]'].includes(new URL(route.request().url()).hostname)) return route.continue();
    outside.push(new URL(route.request().url()).hostname); return route.abort();
  });
  await page.goto(base);
  await page.evaluate(async () => {
    if (speechSynthesis.getVoices().length) return;
    await new Promise(resolve => { speechSynthesis.addEventListener('voiceschanged',resolve,{ once:true }); setTimeout(resolve,2500); });
  });
  // Execute the same framework-independent controller shipped to the portals,
  // rather than a separate reimplementation of voice selection/playback.
  const source = await readFile(new URL('../src/lib/parent-speech.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  await page.evaluate(async moduleUrl => {
    const speechModule = await import(moduleUrl);
    window.__installedVoiceController = new speechModule.ParentSpeechController(speechModule.getBrowserSpeechEnvironment);
    const nativeSpeak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = utterance => {
      window.__installedVoiceDetails = {
        name: utterance.voice?.name,
        voiceLanguage: utterance.voice?.lang,
        utteranceLanguage: utterance.lang,
        local: utterance.voice?.localService,
        text: utterance.text,
        volume: utterance.volume,
      };
      utterance.addEventListener('start',()=>window.__installedVoiceEvents.push('start'));
      utterance.addEventListener('end',()=>window.__installedVoiceEvents.push('end'));
      utterance.addEventListener('error',event=>window.__installedVoiceEvents.push(`error:${event.error}`));
      nativeSpeak(utterance);
    };
  }, `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  for (const language of requested) {
    const available = await page.evaluate(language => speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().split(/[-_]/)[0] === language).map(v => ({ name:v.name, local:v.localService })), language);
    assert.ok(available.length, `${language}: no installed browser voice; installation/restart is incomplete.`);
    for (const [sampleIndex, text] of samples[language].entries()) {
      await page.evaluate(({ language, text }) => {
        const button = document.createElement('button'); button.id='installed-voice-check'; button.textContent='Play installed voice sample';
        button.style.cssText='position:fixed;top:10px;left:10px;z-index:2147483647';
        button.onclick=() => {
          window.__installedVoiceEvents=[];
          void window.__installedVoiceController.play(`installed-voice-${language}`,text,language);
        };
        document.body.append(button);
      }, { language, text });
      await page.locator('#installed-voice-check').click();
      await page.waitForFunction(()=>window.__installedVoiceEvents.includes('end') || ['error','unavailable'].includes(window.__installedVoiceController.getSnapshot().phase),null,{timeout:30000});
      assert.deepEqual(await page.evaluate(()=>window.__installedVoiceEvents),['start','end']);
      const details = await page.evaluate(()=>window.__installedVoiceDetails);
      assert.equal(details.text, text, `${language}: original sample text must be preserved.`);
      assert.equal(details.voiceLanguage?.toLowerCase().split(/[-_]/)[0], language, 'Selected voice must match the requested language.');
      assert.equal(details.utteranceLanguage.toLowerCase().split(/[-_]/)[0], language, 'Utterance must use the requested language.');
      assert.equal(details.local, true, 'This offline check must use a local voice.');
      assert.equal(details.volume, 1, 'Utterance volume must not be muted.');
      await page.locator('#installed-voice-check').evaluate(el=>el.remove());
      console.log(`${language} sample ${sampleIndex + 1}/${samples[language].length}: unchanged text, matching local voice, full utterance volume and native start/end passed with ${details.name}. Pronunciation requires a fluent listener.`);
    }
  }
  assert.deepEqual(outside,[]);
  await page.close();
}
