// Owned loopback acceptance. No reset, seed, hardware port or protected records.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';
import { prepareManualFixture, cleanManualFixture, readManualFixture, actorClient } from './manual-demo.mjs';
import { uiText } from '../src/lib/ui-copy.ts';
assertLocalTestEnvironment();
const target = new URL(process.env.SCHOVERA_TEST_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const must = async p => { const r = await p; if (r.error) throw Error(r.error.message); return r.data; };
const denied = async (p, pattern) => { const r = await p; assert.ok(r.error, 'Unauthorized/conflicting operation unexpectedly succeeded'); if (pattern) assert.match(r.error.message, pattern); };
const out = path.resolve('.local', 'timetable-proposals-' + randomUUID()); mkdirSync(out, { recursive: true });
const record = { passed: false, checks: [] }; const check = s => { record.checks.push(s); console.log('PASS: ' + s); };
let f, browser, foreignSchool, foreignUser;
try {
  f = await prepareManualFixture({ onCreated: fixture => f = fixture });
  const teacher = await actorClient(f.accounts.teacher), principal = await actorClient(f.accounts.principal), parent = await actorClient(f.accounts.parent), unassigned = await actorClient(f.accounts.unassignedTeacher);
  const klass = f.classes[0].id, otherClass = f.classes[1].id;
  const baseline = await must(admin.from('timetable_entries').select('*').eq('school_id', f.schoolId).order('id'));
  const input = { p_class_id: klass, p_entry_id: null, p_expected_updated_at: null, p_weekday: 3, p_period_number: 16,
    p_subject: 'Synthetic proposed science', p_start_time: '15:00', p_end_time: '15:45', p_room: 'Proposal room', p_reason: 'Allow science practice', p_client_request_id: randomUUID() };
  const propose = (patch = {}) => must(teacher.rpc('submit_timetable_proposal', { ...input, p_client_request_id: randomUUID(), ...patch }));
  const decide = (id, decision = 'approved', reason = '') => principal.rpc('decide_timetable_proposal', { p_proposal_id: id, p_decision: decision, p_reason: reason });
  const row = id => must(admin.from('timetable_proposals').select('*').eq('id', id).single());
  const published = () => must(admin.from('timetable_entries').select('*').eq('school_id', f.schoolId).order('id'));
  const source = baseline.find(p => p.class_id === klass && p.weekday === 1);
  for (const actor of [parent, principal, unassigned]) await denied(actor.rpc('submit_timetable_proposal', input));
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await denied(anon.rpc('submit_timetable_proposal', input));
  await denied(teacher.rpc('submit_timetable_proposal', { ...input, p_reason: 'x' }));
  await denied(teacher.rpc('submit_timetable_proposal', { ...input, p_end_time: '14:00' }));
  const pending = await must(teacher.rpc('submit_timetable_proposal', input));
  assert.equal((await must(teacher.rpc('submit_timetable_proposal', input))).id, pending.id);
  await denied(teacher.rpc('submit_timetable_proposal', { ...input, p_subject: 'Changed identity' }), /request conflict/);
  for (const actor of [teacher, parent, unassigned, anon]) await denied(actor.rpc('decide_timetable_proposal', { p_proposal_id: pending.id, p_decision: 'approved' }));
  assert.deepEqual(await must(parent.from('timetable_proposals').select('*')), []);
  assert.deepEqual(await must(parent.from('timetable_proposal_events').select('*')), []);
  assert.deepEqual(await must(unassigned.from('timetable_proposals').select('*')), []);
  await denied(teacher.from('timetable_proposals').update({ status: 'approved' }).eq('id', pending.id));
  await denied(principal.from('timetable_proposal_events').insert({ proposal_id: pending.id, school_id: f.schoolId, actor_id: f.accounts.principal.id, event_type: 'approved' }));
  await denied(teacher.rpc('save_timetable_entry', { p_entry_id: null, p_class_id: klass, p_teacher_id: f.accounts.teacher.id, p_weekday: 3, p_period_number: 16, p_subject: 'Denied direct publication', p_start_time: '15:00', p_end_time: '15:45', p_room: null, p_client_request_id: randomUUID() }));
  assert.deepEqual(await published(), baseline);
  check('Teacher/self-class scope, anonymous/Parent/Teacher publication denial, private drafts/events, immutable DML, meaningful reason/time validation and unchanged published baseline');

  foreignSchool = await must(admin.from('schools').insert({ name: 'Synthetic proposal isolation', code: 'PROPOSAL-' + randomUUID(), timezone: 'Asia/Kolkata' }).select().single());
  const foreignAccount = { email: 'proposal-principal-' + randomUUID() + '@manual.local.test', password: 'Temporary-' + randomUUID() + '!aA1' };
  foreignUser = (await must(admin.auth.admin.createUser({ ...foreignAccount, email_confirm: true }))).user.id;
  await must(admin.from('profiles').insert({ id: foreignUser, school_id: foreignSchool.id, email: foreignAccount.email, role: 'principal', full_name: 'Synthetic foreign Principal', active: true }));
  const foreign = await actorClient(foreignAccount);
  assert.deepEqual((await must(foreign.rpc('timetable_proposal_page'))).items, []);
  assert.deepEqual(await must(foreign.from('timetable_proposals').select('*').eq('id', pending.id)), []);
  await denied(foreign.rpc('decide_timetable_proposal', { p_proposal_id: pending.id, p_decision: 'approved' }), /not available/);
  await denied(teacher.rpc('submit_timetable_proposal', { ...input, p_class_id: randomUUID(), p_client_request_id: randomUUID() }), /not assigned/);
  check('Cross-school list, direct row and guessed-decision denial; foreign class refused');

  const approvals = await Promise.all([decide(pending.id), decide(pending.id)]);
  for (const result of approvals) assert.equal(result.error, null);
  assert.equal(approvals[0].data.published_entry_id, approvals[1].data.published_entry_id);
  const approved = await row(pending.id); assert.equal(approved.status, 'approved'); assert.equal(approved.decided_by, f.accounts.principal.id);
  assert.equal((await published()).length, baseline.length + 1);
  assert.equal((await must(parent.from('timetable_entries').select('*').eq('id', approved.published_entry_id)))[0].subject, input.p_subject);
  assert.equal((await must(admin.from('timetable_proposal_events').select('*').eq('proposal_id', pending.id))).length, 2);
  const audit = await must(admin.from('audit_events').select('actor_id').eq('school_id', f.schoolId).eq('target_id', approved.published_entry_id).eq('event_type', 'timetable_entry_created'));
  assert.deepEqual(audit, [{ actor_id: f.accounts.principal.id }], 'Publication is audited once under the actual deciding Principal');
  await denied(decide(pending.id, 'rejected'), /no longer pending/);
  await denied(decide(pending.id, 'approved', 'Different retry reason'), /no longer pending/);
  const withdrawn = await propose({ p_subject: 'Unpublished withdrawal' });
  await denied(unassigned.rpc('withdraw_timetable_proposal', { p_proposal_id: withdrawn.id }));
  await must(teacher.rpc('withdraw_timetable_proposal', { p_proposal_id: withdrawn.id }));
  await must(teacher.rpc('withdraw_timetable_proposal', { p_proposal_id: withdrawn.id }));
  await denied(decide(withdrawn.id), /no longer pending/);
  const rejected = await propose({ p_subject: 'Unpublished rejection' });
  await must(decide(rejected.id, 'rejected', 'Keep the existing schedule'));
  await must(decide(rejected.id, 'rejected', 'Keep the existing schedule'));
  assert.equal((await published()).length, baseline.length + 1);
  assert.equal((await row(rejected.id)).decision_reason, 'Keep the existing schedule');
  check('Concurrent approvals publish once; same-action retry keeps receipt/actor/history; rejection/withdrawal remain unpublished');

  const edit = await propose({ p_entry_id: source.id, p_expected_updated_at: source.updated_at, p_weekday: source.weekday,
    p_period_number: source.period_number, p_start_time: source.start_time, p_end_time: source.end_time, p_room: source.room, p_subject: 'Synthetic revised science' });
  const write = (entry, patch = {}) => principal.rpc('save_timetable_entry', { p_entry_id: entry.id, p_class_id: entry.class_id, p_teacher_id: entry.teacher_id,
    p_weekday: entry.weekday, p_period_number: entry.period_number, p_subject: entry.subject, p_start_time: entry.start_time,
    p_end_time: entry.end_time, p_room: entry.room, p_expected_updated_at: entry.updated_at, p_client_request_id: null, ...patch });
  await must(write(source, { p_subject: edit.subject })); // Identical desired fields still require a fresh source version.
  await denied(decide(edit.id), /Stale proposal/); assert.equal((await row(edit.id)).status, 'pending');
  const updated = await must(admin.from('timetable_entries').select('*').eq('id', source.id).single());
  await denied(teacher.rpc('submit_timetable_proposal', { ...input, p_client_request_id: randomUUID(), p_entry_id: source.id, p_expected_updated_at: source.updated_at }), /Stale proposal/);
  const freshEdit = await propose({ p_entry_id: updated.id, p_expected_updated_at: updated.updated_at, p_weekday: updated.weekday,
    p_period_number: updated.period_number, p_start_time: updated.start_time, p_end_time: updated.end_time, p_room: updated.room, p_subject: 'Approved replacement science' });
  await must(decide(freshEdit.id));
  assert.equal((await must(parent.from('timetable_entries').select('subject').eq('id', updated.id).single())).subject, 'Approved replacement science');
  const deletedTarget = await propose({ p_entry_id: approved.published_entry_id, p_expected_updated_at: approved.published_updated_at });
  await must(principal.rpc('delete_timetable_entry', { p_entry_id: approved.published_entry_id }));
  await denied(decide(deletedTarget.id), /Stale proposal/);
  check('Principal direct edit/delete preserved; stale identical payload, stale submit and deleted source refused atomically; fresh edit publishes');

  // Current assignment and active identity are rechecked, not frozen at submission.
  const revoked = await propose({ p_weekday: 4, p_period_number: 18, p_start_time: '18:00', p_end_time: '18:45' });
  await must(admin.from('teacher_class_assignments').delete().eq('teacher_id', f.accounts.teacher.id).eq('class_id', klass));
  await denied(decide(revoked.id), /assign/i);
  await must(admin.from('teacher_class_assignments').insert({ teacher_id: f.accounts.teacher.id, class_id: klass }));
  await must(admin.from('profiles').update({ active: false }).eq('id', f.accounts.teacher.id));
  await denied(decide(revoked.id), /no longer authorized/);
  await must(admin.from('profiles').update({ active: true }).eq('id', f.accounts.teacher.id));
  const signedOut = await actorClient(f.accounts.teacher); const token = (await signedOut.auth.getSession()).data.session.access_token;
  await signedOut.auth.signOut({ scope: 'local' });
  const response = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/submit_timetable_proposal', { method: 'POST', headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, p_client_request_id: randomUUID() }) });
  assert.ok(!response.ok, 'A revoked session cannot submit directly');
  assert.equal((await row(revoked.id)).status, 'pending');
  check('Revoked assignment, inactive proposer and logged-out direct RPC denied; failed approval retains pending history');

  await must(admin.from('teacher_class_assignments').insert({ teacher_id: f.accounts.unassignedTeacher.id, class_id: otherClass }));
  const otherTeacherProposal = await must(unassigned.rpc('submit_timetable_proposal', { ...input, p_class_id: otherClass,
    p_weekday: 4, p_period_number: 19, p_start_time: '17:00', p_end_time: '17:45', p_client_request_id: randomUUID() }));
  assert.equal(otherTeacherProposal.teacher_id, f.accounts.unassignedTeacher.id, 'The server binds the proposing Teacher');
  assert.deepEqual(await must(teacher.from('timetable_proposals').select('*').eq('id', otherTeacherProposal.id)), []);
  assert.deepEqual(await must(teacher.from('timetable_proposal_events').select('*').eq('proposal_id', otherTeacherProposal.id)), []);
  await denied(teacher.rpc('withdraw_timetable_proposal', { p_proposal_id: otherTeacherProposal.id }));
  assert.ok((await must(principal.rpc('timetable_proposal_page', { p_class_id: otherClass }))).items.some(p => p.id === otherTeacherProposal.id));
  const direct = async patch => must(principal.rpc('save_timetable_entry', { p_entry_id: null, p_class_id: klass, p_teacher_id: f.accounts.teacher.id,
    p_weekday: 5, p_period_number: 12, p_subject: 'Synthetic conflict anchor', p_start_time: '12:00', p_end_time: '12:45', p_room: 'Anchor room', p_client_request_id: randomUUID(), ...patch }));
  await direct({});
  for (const patch of [
    { p_period_number: 13, p_start_time: '12:15', p_end_time: '12:50', p_room: 'Elsewhere' },
    { p_period_number: 12, p_start_time: '14:00', p_end_time: '14:45', p_room: 'Elsewhere' },
    { p_class_id: otherClass, p_period_number: 13, p_start_time: '12:15', p_end_time: '12:50', p_room: 'Elsewhere' },
  ]) {
    const p = await propose({ p_weekday: 5, ...patch });
    await denied(decide(p.id), /conflict|period/i); assert.equal((await row(p.id)).status, 'pending');
  }
  await direct({ p_class_id: otherClass, p_teacher_id: f.accounts.unassignedTeacher.id, p_period_number: 14, p_start_time: '14:00', p_end_time: '14:45', p_room: 'SHARED PROPOSAL ROOM' });
  const room = await propose({ p_weekday: 5, p_start_time: '14:15', p_end_time: '14:50', p_room: ' shared proposal room ', p_period_number: 15 });
  await denied(decide(room.id), /room has a timetable conflict/);
  const anotherTeacher = await must(admin.from('timetable_entries').select('*').eq('school_id', f.schoolId).eq('teacher_id', f.accounts.unassignedTeacher.id).single());
  await denied(teacher.rpc('submit_timetable_proposal', { ...input, p_class_id: otherClass, p_entry_id: anotherTeacher.id, p_expected_updated_at: anotherTeacher.updated_at, p_client_request_id: randomUUID() }), /not available/);
  const competition = await Promise.all([propose({ p_weekday: 6, p_period_number: 19, p_start_time: '18:00', p_end_time: '18:45' }), propose({ p_weekday: 6, p_period_number: 19, p_start_time: '18:00', p_end_time: '18:45' })]);
  const race = await Promise.all(competition.map(p => decide(p.id)));
  assert.equal(race.filter(r => !r.error).length, 1); assert.equal(race.filter(r => r.error).length, 1);
  check('Class overlap, occupied period, Teacher overlap, case/space-normalized room conflicts and competing-proposal approvals rejected; unrelated Teacher period cannot be proposed');

  for (let i = 0; i < 23; i++) await propose({ p_subject: 'Synthetic paged proposal ' + i });
  const seen = new Set(); let cursor;
  do {
    const page = await must(teacher.rpc('timetable_proposal_page', { p_limit: 7, p_before_created_at: cursor?.created_at ?? null, p_before_id: cursor?.id ?? null }));
    for (const p of page.items) { assert.ok(!seen.has(p.id)); seen.add(p.id); }
    cursor = page.has_more ? page.items.at(-1) : null;
  } while (cursor);
  const count = await admin.from('timetable_proposals').select('id', { count: 'exact', head: true }).eq('school_id', f.schoolId).eq('proposed_by', f.accounts.teacher.id);
  assert.equal(seen.size, count.count);
  const unchanged = baseline.filter(p => p.id !== source.id);
  for (const original of unchanged) assert.deepEqual((await published()).find(p => p.id === original.id), original);
  check('Full bounded keyset traversal agrees with database; assigned Teachers cannot read/withdraw another Teacher proposal/history; untouched pre-existing published periods preserved');

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const contexts = {}, pages = {}, runtime = [];
  for (const role of ['teacher', 'principal', 'parent']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); contexts[role] = context;
    await context.route('**/*', r => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
    const page = await context.newPage(); pages[role] = page; page.setDefaultTimeout(25000);
    page.on('pageerror', e => runtime.push(e.message));
    await page.goto(target.href); await page.getByLabel('Email', { exact: true }).fill(f.accounts[role].email);
    await page.getByLabel('Password', { exact: true }).fill(f.accounts[role].password);
    await page.getByRole('button', { name: 'Sign in securely', exact: true }).click(); await page.locator('.role-' + role).waitFor();
    await page.goto(target.origin + '/' + role + '/timetable');
  }
  const tp = pages.teacher, pp = pages.principal, par = pages.parent;
  const subject = 'Synthetic browser proposal ' + randomUUID().slice(0, 8);
  const form = tp.getByRole('form', { name: 'Propose a timetable change', exact: true });
  await form.getByLabel('Subject', { exact: true }).fill(subject); await form.getByLabel('Day', { exact: true }).selectOption('2');
  await form.getByLabel('Period', { exact: true }).fill('20'); await form.getByLabel('Start', { exact: true }).fill('19:00'); await form.getByLabel('End', { exact: true }).fill('19:45');
  await form.getByLabel('Reason for proposal', { exact: true }).fill('Allow browser science practice');
  await form.getByLabel('End', { exact: true }).fill('18:00');
  await form.getByRole('button', { name: 'Submit proposal', exact: true }).click();
  await tp.getByText('Enter a short reason and an end time after the start.', { exact: true }).waitFor();
  await tp.screenshot({ path: path.join(out, 'teacher-invalid-times.png'), fullPage: true });
  await form.getByLabel('End', { exact: true }).fill('19:45');
  await form.getByRole('button', { name: 'Submit proposal', exact: true }).focus(); await tp.keyboard.press('Enter');
  await tp.getByText('Proposal submitted. The published schedule is unchanged.', { exact: true }).waitFor();
  const browserProposal = await must(admin.from('timetable_proposals').select('*').eq('school_id', f.schoolId).eq('subject', subject).single());
  assert.equal((await must(parent.from('timetable_entries').select('id').eq('subject', subject))).length, 0);
  await pp.getByRole('button', { name: 'Refresh proposals', exact: true }).click();
  let card = pp.locator('[data-proposal-id="' + browserProposal.id + '"]');
  await card.getByRole('button', { name: 'Approve and publish', exact: true }).click();
  await pp.getByText('Proposal approved and timetable published.', { exact: true }).waitFor();
  assert.equal((await row(browserProposal.id)).status, 'approved');
  await par.reload(); await par.getByText(subject, { exact: true }).first().waitFor();
  assert.equal(await par.locator('.timetable-proposals').count(), 0);
  await form.getByRole('button', { name: 'Submit proposal', exact: true }).click();
  await tp.getByText('This proposal was already decided. Refresh its status.', { exact: true }).waitFor();
  assert.equal((await must(admin.from('timetable_proposals').select('id').eq('school_id', f.schoolId).eq('subject', subject))).length, 1);
  const rejectSubject = 'Synthetic browser rejection';
  await form.getByLabel('Subject', { exact: true }).fill(rejectSubject); await form.getByRole('button', { name: 'Submit proposal', exact: true }).click();
  await tp.getByText('Proposal submitted. The published schedule is unchanged.', { exact: true }).waitFor();
  const browserReject = await must(admin.from('timetable_proposals').select('*').eq('school_id', f.schoolId).eq('subject', rejectSubject).single());
  await pp.getByRole('button', { name: 'Refresh proposals', exact: true }).click(); card = pp.locator('[data-proposal-id="' + browserReject.id + '"]');
  await card.getByLabel('Decision reason (optional)', { exact: true }).fill('Keep the approved science period');
  await card.getByRole('button', { name: 'Reject proposal', exact: true }).click();
  await pp.getByText('Proposal rejected. Nothing was published.', { exact: true }).waitFor();
  assert.equal((await row(browserReject.id)).status, 'rejected');
  assert.equal((await must(parent.from('timetable_entries').select('id').eq('subject', rejectSubject))).length, 0);
  await tp.route('**/rest/v1/rpc/timetable_proposal_page', r => r.abort());
  await tp.getByRole('button', { name: 'Refresh proposals', exact: true }).click();
  await tp.getByText('Proposals could not be loaded. Refresh when connected.', { exact: true }).waitFor();
  await tp.screenshot({ path: path.join(out, 'teacher-query-unavailable.png'), fullPage: true });
  await tp.unroute('**/rest/v1/rpc/timetable_proposal_page'); await tp.getByRole('button', { name: 'Refresh proposals', exact: true }).click();
  await tp.getByText('Proposals could not be loaded. Refresh when connected.', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await tp.locator('[data-proposal-id]').count(), 5, 'Initial review is bounded to five cards');
  await tp.getByRole('button', { name: 'Load older proposals', exact: true }).click();
  await tp.locator('[data-proposal-id]').nth(9).waitFor();
  const oldClassProposal = await tp.locator('[data-proposal-id]').first().getAttribute('data-proposal-id');
  await tp.locator('.teacher-class-panel .chips button').nth(1).click();
  await tp.locator('[data-proposal-id="' + oldClassProposal + '"]').waitFor();
  assert.equal(await form.getByLabel('Subject', { exact: true }).inputValue(), '', 'Changing class must discard the previous class form context');
  await must(admin.from('teacher_class_assignments').delete().eq('teacher_id', f.accounts.teacher.id).eq('class_id', klass));
  await tp.locator('[data-proposal-id="' + oldClassProposal + '"]').getByRole('button', { name: 'Withdraw proposal', exact: true }).click();
  await tp.getByText('Proposal withdrawn. Nothing was published.', { exact: true }).waitFor();
  assert.equal((await row(oldClassProposal)).status, 'withdrawn', 'Earlier-class history remains visible/withdrawable after assignment revocation');
  await must(admin.from('teacher_class_assignments').insert({ teacher_id: f.accounts.teacher.id, class_id: klass }));
  await tp.locator('.teacher-class-panel .chips button').first().click();
  await pp.locator('.timetable-select select').selectOption(otherClass);
  await pp.getByLabel('Proposal status', { exact: true }).selectOption('approved');
  await pp.getByText('No proposals in this view.', { exact: true }).waitFor();
  await pp.screenshot({ path: path.join(out, 'principal-empty-class-history.png'), fullPage: true });
  await pp.locator('.timetable-select select').selectOption(klass);
  for (const [role, page] of Object.entries(pages)) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const lang of ['en', 'hi', 'mr']) {
        await page.locator('.language-selector select').selectOption(lang);
        if (role !== 'parent') await page.getByRole('heading', { name: uiText('Timetable proposals', lang), exact: true }).waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), role + '/' + width + '/' + lang + ' overflow');
        await page.screenshot({ path: path.join(out, role + '-' + width + '-' + lang + '.png'), fullPage: true });
      }
    }
  }
  assert.deepEqual(runtime, []); check('Actual mobile Teacher submission → Principal approval/rejection → Parent published only; failed-query recovery; 27 role/width/language captures and no runtime/overflow errors');
  record.passed = true;
} finally {
  await browser?.close();
  if (foreignUser) { await must(admin.from('profiles').delete().eq('id', foreignUser)); await must(admin.auth.admin.deleteUser(foreignUser)); }
  if (foreignSchool) await must(admin.from('schools').delete().eq('id', foreignSchool.id));
  if (f) {
    assert.equal(readManualFixture().runId, f.runId); await cleanManualFixture();
    for (const table of ['schools', 'timetable_proposals', 'timetable_proposal_events'])
      assert.equal((await must(admin.from(table).select('id').eq(table === 'schools' ? 'id' : 'school_id', f.schoolId))).length, 0, table + ' fixture cleanup');
  }
  writeFileSync(path.join(out, 'results.json'), JSON.stringify({ ...record, finished: new Date().toISOString(), ownedCleanupVerified: true }, null, 2));
  console.log('Proposal evidence: ' + out);
}
