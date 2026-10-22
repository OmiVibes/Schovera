import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DemoAdapter } from './adapter.mjs';
import { fingerprint } from './target.mjs';
import { fictionalNames } from './dataset.mjs';
import { assertLocalTestEnvironment } from '../lib/local-test-env.mjs';

export async function provisionBrowserFixture() {
  assertLocalTestEnvironment();
  const credentials = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  const expiresAt = new Date(Date.now() + 86400000).toISOString(),
    runId = randomUUID();
  const approval = {
    version: 1,
    purpose: 'schovera-fictional-demo',
    datasetSha256:
      'ac5db776b7d53974693a10cd888d69ae619ac90b5b35fb7597e9e365676ccb2a',
    mode: 'local',
    projectRef: 'local-Schovera',
    url: credentials.url,
    verifiedBy: 'local browser acceptance',
    verificationEvidence: 'isolated loopback Supabase configuration',
    expiresAt,
    secretKeySha256: fingerprint(credentials.key),
    publishableKeySha256: fingerprint(credentials.publishableKey),
  };
  const directory = mkdtempSync(
    path.join(tmpdir(), 'schovera-provisioner-browser-'),
  );
  const adapter = new DemoAdapter({ approval, credentials, directory });
  const dataset = JSON.parse(
    readFileSync(
      new URL('./fixtures/fictional-campus.json', import.meta.url),
      'utf8',
    ),
  );
  const options = { runId, expiresAt };
  await adapter.run(dataset, {
    ...options,
    confirm: `prepare:local-Schovera:${runId}`,
  });
  await adapter.run(dataset, {
    ...options,
    confirm: `prepare:local-Schovera:${runId}`,
  });
  const j = adapter.journal,
    t = j.rows;
  const accountByName = (name) =>
    j.accounts[dataset.tables.profiles.find((p) => p.full_name === name).id];
  const accounts = {
    principal: accountByName('Dr Meera Rao'),
    teacher: accountByName('Maya Kulkarni'),
    teacherB: accountByName('Vikram Shah'),
  };
  const students = fictionalNames.map((name) =>
    t.students.find((s) => s.full_name === name),
  );
  accounts.parent = Object.values(j.accounts).find(
    (a) =>
      a.id ===
      t.parent_student_links.find((l) => l.student_id === students[0].id)
        .parent_id,
  );
  const fixture = {
    runId,
    schoolId: j.schoolId,
    accounts,
    students,
    classes: [...t.classes].sort((a, b) =>
      a.division.localeCompare(b.division),
    ),
    dates: [
      ...new Set(t.attendance_records.map((r) => r.attendance_date)),
    ].sort(),
  };
  return {
    fixture,
    async checkSessions(parent) {
      // The currently-open browser has the OLD access/refresh session.
      const logical = Object.keys(j.accounts).find(
        (k) => j.accounts[k].id === accounts.parent.id,
      );
      await adapter.run(dataset, {
        ...options,
        operation: 'rotate',
        account: logical,
        confirm: `rotate:local-Schovera:${runId}`,
      });
      Object.assign(accounts.parent, adapter.journal.accounts[logical]);
      await parent.page.reload({ waitUntil: 'networkidle' });
      await parent.page.waitForFunction(
        () => !document.querySelector('.role-parent'),
      );
      if (
        await parent.page
          .getByRole('button', { name: 'Sign out', exact: true })
          .isVisible()
      )
        await parent.page
          .getByRole('button', { name: 'Sign out', exact: true })
          .click();
      await parent.page.getByLabel('Email').fill(accounts.parent.email);
      await parent.page
        .getByLabel('Password', { exact: true })
        .fill(accounts.parent.password);
      await parent.page
        .getByRole('button', { name: 'Sign in securely' })
        .click();
      await parent.page.locator('.role-parent').waitFor();
      await parent.page.reload({ waitUntil: 'networkidle' });
      await parent.page.locator('.role-parent').waitFor();
      console.log(
        'Provisioner fixture: browser old-session invalidation and rotated login / reload passed.',
      );
    },
    async cleanup() {
      await adapter.run(dataset, {
        ...options,
        operation: 'reset',
        confirm: `reset:local-Schovera:${runId}`,
      });
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
