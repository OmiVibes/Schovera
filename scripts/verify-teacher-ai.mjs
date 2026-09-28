import { chromium } from 'playwright';
import * as XLSX from 'xlsx';

const baseUrl = process.env.SCHOVERA_TEST_URL || 'http://localhost:3000';
const password = process.env.SCHOVERA_DEMO_PASSWORD || 'SchoveraDemo2026!';
const browser = await chromium.launch({ headless: true });
const check = (condition, message) => { if (!condition) throw new Error(message); };
async function accessToken(context) {
  const authCookies = (await context.cookies(baseUrl)).filter((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (!authCookies.length) return '';
  try {
    let encoded = decodeURIComponent(authCookies.map((cookie) => cookie.value).join(''));
    if (encoded.startsWith('base64-')) encoded = Buffer.from(encoded.slice(7), 'base64').toString('utf8');
    return JSON.parse(encoded).access_token || '';
  } catch { return ''; }
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (await page.locator('input[type="email"]').count()) {
    await page.locator('input[type="email"]').fill('teacher@schovera.demo');
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in securely' }).click();
    await page.locator('nav.app-section-nav').waitFor({ state: 'visible', timeout: 20000 }).catch(async () => {
      throw new Error(`Teacher demo sign-in did not complete: ${await page.locator('main').innerText().catch(() => 'no page content')}`);
    });
  }
  await page.goto(`${baseUrl}/teacher/ai`, { waitUntil: 'networkidle' });
  await page.locator('.teacher-ai-workspace').waitFor({ state: 'visible' });
  check(await page.getByLabel('Grade / level').count() === 1, 'Draft form is missing grade field.');
  check(await page.getByRole('button', { name: 'Generate a draft' }).count() === 1, 'Draft action is missing.');
  const teacherToken = await accessToken(context);
  check(Boolean(teacherToken), 'Could not find the signed-in teacher session in browser storage.');
  const teacherValidation = await page.request.post(`${baseUrl}/api/teacher-ai`, { headers: { Authorization: `Bearer ${teacherToken}` }, data: { kind: 'exam' } });
  check(teacherValidation.status() === 400, `Authenticated teacher validation returned ${teacherValidation.status()} instead of 400.`);
  if (process.env.VERIFY_TEACHER_AI_LIVE === '1') {
    const liveDraft = await page.request.post(`${baseUrl}/api/teacher-ai`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      timeout: 180000,
      data: { kind: 'worksheet', grade: 'Grade 7', subject: 'Science', topic: 'Simple machines', details: 'Create three short questions and a brief answer key.' },
    });
    const draftResult = await liveDraft.json();
    check(liveDraft.status() === 200, `Live local AI generation returned ${liveDraft.status()}: ${draftResult.error || 'unknown error'}`);
    check(typeof draftResult.draft === 'string' && draftResult.draft.length > 100, 'Live local AI returned no usable draft.');
    check(String(draftResult.provider).startsWith('Ollama'), `Expected local Ollama provider, received ${draftResult.provider}.`);
    console.log(`Live local generation passed with ${draftResult.provider}; editable draft length ${draftResult.draft.length}.`);
  }
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  check(dimensions.content <= dimensions.viewport + 1, `Teacher AI workspace overflows at 390px (${dimensions.content}px).`);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Subject', 'Topic'], ['Science', 'Forces']]), 'Planning');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  await page.locator('input[type="file"]').setInputFiles({ name: 'planning.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  await page.getByRole('region', { name: 'Planning editable worksheet' }).waitFor({ state: 'visible' });
  const topic = page.getByRole('textbox', { name: 'Row 2, column 2' });
  await topic.fill('Motion');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download edited .xlsx' }).click();
  const download = await downloadPromise;
  check(download.suggestedFilename().endsWith('-edited.xlsx'), 'Edited workbook did not download as .xlsx.');

  const unauthenticated = await page.request.post(`${baseUrl}/api/teacher-ai`, { data: { kind: 'exam' } });
  check(unauthenticated.status() === 401, `Unauthenticated API request returned ${unauthenticated.status()} instead of 401.`);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill('parent@schovera.demo');
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in securely' }).click();
  await page.locator('nav.app-section-nav').waitFor({ state: 'visible', timeout: 20000 }).catch(async () => {
    throw new Error(`Parent demo sign-in did not complete: ${await page.locator('main').innerText().catch(() => 'no page content')}`);
  });
  const parentToken = await accessToken(context);
  check(Boolean(parentToken), 'Could not find the signed-in parent session in browser storage.');
  const parentDenied = await page.request.post(`${baseUrl}/api/teacher-ai`, { headers: { Authorization: `Bearer ${parentToken}` }, data: { kind: 'exam' } });
  check(parentDenied.status() === 403, `Parent AI request returned ${parentDenied.status()} instead of 403.`);

  await context.close();
  console.log(`Teacher AI workspace UI and local workbook edit/export passed at 390px; unauthenticated requests returned 401, teacher input validation returned 400, and Parent access returned 403.${process.env.VERIFY_TEACHER_AI_LIVE === '1' ? ' Live local generation was also invoked.' : ' Live generation was not invoked.'}`);
} finally { await browser.close(); }
