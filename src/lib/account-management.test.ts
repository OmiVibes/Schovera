import { afterEach, expect, it, vi } from 'vitest';
import { accountInput, accountPayload } from './account-management';
import { GET, POST } from '../app/api/school/accounts/route';

const uuid = '70000000-0000-4000-8000-000000000001';
const base = {
  requestId: uuid,
  name: 'School Parent',
  email: 'parent@example.test',
  password: 'SchoolTest123!',
  role: 'parent',
  classIds: [],
  childIds: [uuid],
  confirmPrincipal: false,
};
afterEach(() => vi.unstubAllEnvs());
it('validates and normalizes an account without choosing its school from the form', () => {
  const result = accountInput.parse({
    ...base,
    name: ' School Parent ',
    email: ' PARENT@example.test ',
  });
  expect(result.email).toBe('parent@example.test');
  expect(result.name).toBe('School Parent');
  expect(accountInput.safeParse({ ...base, school_id: uuid }).success).toBe(
    false,
  );
});
it.each([
  'short',
  'alllowercase123!',
  'ALLUPPERCASE123!',
  'NoNumbersHere!',
  'NoSymbolsHere123',
])('rejects weak password %s', (password) => {
  expect(accountInput.safeParse({ ...base, password }).success).toBe(false);
});
it('requires children for a Parent and assigned classes for a Teacher', () => {
  expect(accountInput.safeParse({ ...base, childIds: [] }).success).toBe(false);
  expect(accountInput.safeParse({ ...base, role: 'teacher' }).success).toBe(
    false,
  );
  expect(
    accountInput.safeParse({
      ...base,
      role: 'teacher',
      childIds: [],
      classIds: [uuid],
    }).success,
  ).toBe(true);
});
it('requires explicit confirmation for a new Principal', () => {
  expect(
    accountInput.safeParse({ ...base, role: 'principal', childIds: [] })
      .success,
  ).toBe(false);
  expect(
    accountInput.safeParse({
      ...base,
      role: 'principal',
      childIds: [],
      confirmPrincipal: true,
    }).success,
  ).toBe(true);
});
it('rejects duplicate relationships and excessive lists', () => {
  expect(
    accountInput.safeParse({ ...base, childIds: [uuid, uuid] }).success,
  ).toBe(false);
  expect(
    accountInput.safeParse({ ...base, childIds: Array(51).fill(uuid) }).success,
  ).toBe(false);
});
it('does not include a password in the idempotency payload', () => {
  const value = accountInput.parse(base);
  expect(accountPayload(value)).not.toHaveProperty('password');
  expect(accountPayload(value)).toEqual(
    accountPayload({ ...value, password: 'DifferentPassword1!' }),
  );
});
it('disables both route methods before any Auth/network operation without explicit local mode', async () => {
  vi.stubEnv('SCHOVERA_ACCOUNT_MANAGEMENT_MODE', '');
  const request = () =>
    new Request('http://127.0.0.1:3103/api/school/accounts', {
      headers: { host: '127.0.0.1:3103' },
    });
  expect((await GET(request())).status).toBe(404);
  expect((await POST(request())).status).toBe(404);
});
it.each(['https://hosted.supabase.co', 'http://127.0.0.1.attacker.test'])(
  'refuses a hosted API %s',
  async (url) => {
    vi.stubEnv('SCHOVERA_ACCOUNT_MANAGEMENT_MODE', 'local');
    vi.stubEnv('SCHOVERA_TEST_MODE', 'local');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-only');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url);
    expect(
      (
        await GET(
          new Request('http://127.0.0.1:3103/api/school/accounts', {
            headers: { host: '127.0.0.1:3103' },
          }),
        )
      ).status,
    ).toBe(404);
  },
);
