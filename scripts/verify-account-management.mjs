// Isolated local acceptance. Creates and cleans only uniquely owned synthetic schools/users.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';

if (existsSync(new URL('../.env.local', import.meta.url)))
  throw new Error('Use an isolated checkout without .env.local.');
assertLocalTestEnvironment();
const base = process.env.SCHOVERA_TEST_URL || 'http://127.0.0.1:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actorClient = () =>
  createClient(url, pub, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const must = async (query) => {
  const result = await query;
  if (result.error)
    throw new Error(
      'Controlled local database assertion failed. No error body logged.',
    );
  return result.data;
};
const run = randomUUID();
const schoolIds = [],
  userIds = new Set();
const password = `School-Test-${run}!aA1`;
let browser;
let passed = 0;
const check = (message) => {
  passed++;
  console.log(`PASS ${passed}: ${message}`);
};
const identity = (actor, request) => {
  const h = createHash('sha256')
    .update(`school-account:${actor}:${request}`)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
async function login(actor) {
  const client = actorClient();
  const auth = await must(
    client.auth.signInWithPassword({ email: actor.email, password }),
  );
  return { client, token: auth.session.access_token, userId: auth.user.id };
}
async function seedActor(school, role) {
  const email = `${role}-${randomUUID()}@accounts.local.test`;
  const created = await must(
    admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  userIds.add(created.user.id);
  await must(
    admin
      .from('profiles')
      .insert({
        id: created.user.id,
        school_id: school,
        role,
        email,
        full_name: `Account test ${role}`,
      }),
  );
  return { id: created.user.id, email, role, ...(await login({ email })) };
}
async function request(actor, body, method = 'POST', extra = {}) {
  if (body?.requestId) userIds.add(identity(actor.id, body.requestId));
  const response = await fetch(`${base}/api/school/accounts`, {
    method,
    headers: {
      ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}),
      Origin: new URL(base).origin,
      'Content-Type': 'application/json',
      ...extra,
    },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
const body = (role, classes = [], children = []) => ({
  requestId: randomUUID(),
  name: 'Account integration person',
  email: `created-${randomUUID()}@accounts.local.test`,
  password,
  role,
  classIds: classes,
  childIds: children,
  confirmPrincipal: role === 'principal',
});

try {
  for (const n of [1, 2]) {
    const school = await must(
      admin
        .from('schools')
        .insert({ name: `Account QA ${n}`, code: `ACCOUNTS-${run}-${n}` })
        .select('id')
        .single(),
    );
    schoolIds.push(school.id);
  }
  const principal = await seedActor(schoolIds[0], 'principal');
  const other = await seedActor(schoolIds[1], 'principal');
  const teacher = await seedActor(schoolIds[0], 'teacher');
  const parent = await seedActor(schoolIds[0], 'parent');
  const classes = [],
    students = [];
  for (const [index, school] of schoolIds.entries()) {
    const klass = await must(
      admin
        .from('classes')
        .insert({
          school_id: school,
          grade: '8',
          division: 'Q',
          academic_year: run,
        })
        .select('id')
        .single(),
    );
    classes.push(klass.id);
    const student = await must(
      admin
        .from('students')
        .insert({
          school_id: school,
          class_id: klass.id,
          full_name: `Account QA child ${index}`,
          roll_number: '1',
        })
        .select('id')
        .single(),
    );
    students.push(student.id);
  }
  const anonymous = await request(null, null, 'GET');
  assert.equal(anonymous.status, 401);
  check('anonymous access denied');
  for (const actor of [teacher, parent]) {
    assert.equal((await request(actor, null, 'GET')).status, 403);
    assert.equal((await request(actor, body('principal'))).status, 403);
  }
  check('Parent and Teacher cannot list or create accounts');
  const options = await request(principal, null, 'GET');
  assert.equal(options.status, 200);
  assert.deepEqual(
    options.data.classes.map((c) => c.id),
    [classes[0]],
  );
  assert.deepEqual(
    options.data.students.map((s) => s.id),
    [students[0]],
  );
  assert.ok(options.data.users.every((user) => !('password' in user)));
  check('Principal options scoped to own school; no passwords returned');
  assert.equal(
    (
      await request(principal, body('principal'), 'POST', {
        Origin: 'https://attacker.invalid',
      })
    ).status,
    403,
  );
  check('cross-origin writes denied');
  assert.equal(
    (
      await request(principal, {
        ...body('principal'),
        school_id: schoolIds[1],
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(principal, { ...body('principal'), password: 'weak' }))
      .status,
    400,
  );
  assert.equal(
    (
      await request(principal, {
        ...body('principal'),
        confirmPrincipal: false,
      })
    ).status,
    400,
  );
  check(
    'identity injection, weak password and unchecked Principal elevation denied',
  );
  assert.equal((await request(principal, { ...body('principal'), oversized: 'x'.repeat(17000) })).status, 413);
  check('oversized account request rejected before account creation');
  const cross = body('parent', [], [students[1]]);
  assert.equal((await request(principal, cross)).status, 400);
  assert.ok(
    (
      await admin.auth.admin.getUserById(
        identity(principal.id, cross.requestId),
      )
    ).error,
  );
  check('foreign child rejected before Auth account creation');
  const p = body('parent', [], [students[0]]),
    t = body('teacher', [classes[0]]),
    leader = body('principal');
  for (const input of [p, t, leader]) {
    const result = await request(principal, input);
    assert.equal(result.status, 201);
    assert.equal(result.data.id, identity(principal.id, input.requestId));
    const client = actorClient();
    await must(
      client.auth.signInWithPassword({ email: input.email, password }),
    );
    const profile = await must(
      client
        .from('profiles')
        .select('role,school_id')
        .eq('id', result.data.id)
        .single(),
    );
    assert.equal(profile.role, input.role);
    assert.equal(profile.school_id, schoolIds[0]);
    if (input.role === 'parent')
      assert.deepEqual(
        (await must(client.from('students').select('id'))).map((s) => s.id),
        [students[0]],
      );
    if (input.role === 'teacher')
      assert.deepEqual(
        (
          await must(
            client.from('teacher_class_assignments').select('class_id'),
          )
        ).map((c) => c.class_id),
        [classes[0]],
      );
    await client.auth.signOut();
  }
  check(
    'all three roles created, signed in, correct profile and linked-child/class RLS verified',
  );
  const retry = await request(principal, p);
  assert.equal(retry.status, 201);
  assert.equal(retry.data.passwordUnchanged, true);
  assert.equal(
    (await request(principal, { ...p, name: 'Changed payload' })).status,
    409,
  );
  const audits = await must(
    admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'school_account_created')
      .eq('target_id', retry.data.id),
  );
  assert.equal(audits.length, 1);
  check(
    'exact retry returns original account, changed form conflicts, one audit only',
  );
  assert.equal(
    (
      await request(principal, {
        ...body('parent', [], [students[0]]),
        email: p.email,
      })
    ).status,
    409,
  );
  await login({ email: p.email });
  check('duplicate email cannot replace an existing password');
  const concurrent = body('teacher', [classes[0]]);
  const duplicate = await Promise.all([
    request(principal, concurrent),
    request(principal, concurrent),
  ]);
  assert.ok(duplicate.every((result) => result.status === 201));
  assert.equal(duplicate[0].data.id, duplicate[1].data.id);
  check('concurrent retry creates one Auth user/profile');
  // Emulate a previous HTTP attempt that created Auth but was interrupted before profile commit.
  const interrupted = body('teacher', [classes[0]]);
  const canonical = {
    name: interrupted.name,
    email: interrupted.email,
    role: interrupted.role,
    classIds: [...interrupted.classIds].sort(),
    childIds: [],
    confirmPrincipal: false,
  };
  const id = identity(principal.id, interrupted.requestId);
  userIds.add(id);
  await must(
    admin.auth.admin.createUser({
      id,
      email: interrupted.email,
      password,
      email_confirm: true,
      app_metadata: {
        provisioned_by: principal.id,
        provisioning_request: interrupted.requestId,
        provisioning_hash: createHash('sha256')
          .update(JSON.stringify(canonical))
          .digest('hex'),
      },
    }),
  );
  assert.equal(
    (
      await request(principal, {
        ...interrupted,
        password: 'Another-Password123!',
      })
    ).status,
    201,
  );
  await login({ email: interrupted.email });
  assert.ok(
    (
      await actorClient().auth.signInWithPassword({
        email: interrupted.email,
        password: 'Another-Password123!',
      })
    ).error,
  );
  check(
    'interrupted Auth/profile setup resumes without changing first password',
  );
  const denied = await parent.client.rpc('school_account_manager', {
    p_actor: principal.id,
    p_session: randomUUID(),
  });
  assert.ok(denied.error);
  assert.ok((await actorClient().rpc('school_account_manager', { p_actor: principal.id, p_session: randomUUID() })).error);
  const teacherSession = JSON.parse(Buffer.from(teacher.token.split('.')[1], 'base64url').toString()).session_id;
  assert.ok((await admin.rpc('school_account_manager', { p_actor: teacher.id, p_session: teacherSession })).error);
  check('browser roles cannot execute service-only account RPCs');
  const otherOptions = await request(other, null, 'GET');
  assert.deepEqual(
    otherOptions.data.students.map((s) => s.id),
    [students[1]],
  );
  check('other-school Principal never sees first-school roster');
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        name: p.name,
        email: p.email,
        role: p.role,
        classIds: [],
        childIds: [...p.childIds].sort(),
        confirmPrincipal: false,
      }),
    )
    .digest('hex');
  const session = JSON.parse(
    Buffer.from(principal.token.split('.')[1], 'base64url').toString(),
  ).session_id;
  const foreignRpc = await admin.rpc('finish_school_account', {
    p_actor: principal.id,
    p_session: session,
    p_user: identity(principal.id, p.requestId),
    p_request: p.requestId,
    p_hash: hash,
    p_name: p.name,
    p_email: p.email,
    p_role: p.role,
    p_classes: [],
    p_children: [students[1]],
    p_confirm_principal: false,
  });
  assert.ok(foreignRpc.error);
  check('transactional writer independently rejects a foreign child');
  await must(
    admin.from('profiles').update({ active: false }).eq('id', other.id),
  );
  assert.equal((await request(other, null, 'GET')).status, 403);
  await must(
    admin.from('profiles').update({ active: true }).eq('id', other.id),
  );
  check('inactive Principal cannot manage users');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    return ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ||
      ['about:', 'data:', 'blob:'].includes(u.protocol)
      ? route.continue()
      : route.abort();
  });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email', { exact: true }).fill(principal.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Sign in securely', exact: true })
    .click();
  await page.locator('.role-principal').waitFor();
  await page.getByRole('link', { name: 'Manage users', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Add a school account', exact: true })
    .waitFor();
  const browserInput = body('parent', [], [students[0]]);
  await page
    .getByLabel('Full name', { exact: true })
    .fill('Browser-created parent');
  await page.getByLabel('Email', { exact: true }).fill(browserInput.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('checkbox', { name: /Account QA child 0/ }).check();
  const post = page.waitForRequest(
    (req) =>
      req.url().endsWith('/api/school/accounts') && req.method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  const submitted = JSON.parse((await post).postData());
  userIds.add(identity(principal.id, submitted.requestId));
  await page
    .getByRole('status')
    .filter({ hasText: 'Account created for' })
    .waitFor({ timeout: 30000 });
  assert.equal(
    await page.getByLabel('Password', { exact: true }).inputValue(),
    '',
  );
  assert.ok(
    !(await page.evaluate(() => JSON.stringify(sessionStorage))).includes(
      password,
    ),
  );
  const scripts = await page
    .locator('script[src]')
    .evaluateAll((nodes) => nodes.map((node) => node.src));
  for (const script of scripts) {
    const response = await page.request.get(script);
    const source = await response.text();
    assert.ok(
      !source.includes(process.env.SUPABASE_SERVICE_ROLE_KEY),
      'Local service credential entered a browser chunk',
    );
  }
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const clipped = await page.locator('.manage-users form, .manage-users form input, .manage-users form select, .manage-users form button, .account-table-scroll').evaluateAll(nodes => nodes.filter(element => {
      const box = element.getBoundingClientRect();
      return element.getClientRects().length && (box.left < -1 || box.right > innerWidth + 1);
    }).map(element => element.tagName));
    assert.deepEqual(clipped, [], `Account form controls clipped at ${width}px`);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  const newParent = await login({ email: browserInput.email });
  assert.deepEqual(
    (await must(newParent.client.from('students').select('id'))).map(
      (s) => s.id,
    ),
    [students[0]],
  );
  check(
    'Principal browser creates a linked Parent; password cleared/not stored; desktop and phone have no page overflow',
  );
  await context.close();
  await browser.close();
  browser = null;
  await must(principal.client.auth.signOut());
  assert.ok(
    [401, 403].includes((await request(principal, null, 'GET')).status),
  );
  check('logged-out bearer token rejected by database session check');
} finally {
  await browser?.close();
  for (const school of schoolIds) {
    const profiles = await must(
      admin.from('profiles').select('id').eq('school_id', school),
    );
    const ids = profiles.map((p) => p.id);
    ids.forEach((id) => userIds.add(id));
    if (ids.length) {
      await must(
        admin.from('parent_student_links').delete().in('parent_id', ids),
      );
      await must(
        admin.from('teacher_class_assignments').delete().in('teacher_id', ids),
      );
    }
    await must(admin.from('audit_events').delete().eq('school_id', school));
    await must(admin.from('students').delete().eq('school_id', school));
    await must(admin.from('classes').delete().eq('school_id', school));
    await must(admin.from('profiles').delete().eq('school_id', school));
    await must(admin.from('schools').delete().eq('id', school));
  }
  for (const id of userIds) {
    const existing = await admin.auth.admin.getUserById(id);
    if (existing.data.user) await must(admin.auth.admin.deleteUser(id));
  }
  assert.equal(
    (await must(admin.from('schools').select('id').in('id', schoolIds))).length,
    0,
  );
  console.log(
    'Controlled account QA schools and Auth users cleaned; existing school/accounts preserved.',
  );
}
console.log(`Account management acceptance passed: ${passed} scenario groups.`);
