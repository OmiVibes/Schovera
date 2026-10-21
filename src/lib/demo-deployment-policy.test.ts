import { afterEach, describe, expect, it, vi } from 'vitest';
import { hostedBuildFixture, validateHostedDemoEnvironment } from './demo-deployment-policy.mjs';
import { localRfidServer } from './rfid/v2-server';
import { localFallbackEnabled } from './fallback-server';
import { POST as legacy } from '@/app/api/device/v1/events/route';
import { createClient } from './supabase/client';
const browserClient = vi.hoisted(() => vi.fn());
vi.mock('@supabase/ssr', () => ({ createBrowserClient: browserClient }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('hosted configuration fails closed', () => {
  it('keeps unflagged production behavior unchanged', () => expect(validateHostedDemoEnvironment({})).toEqual({ enabled: false }));
  it('validates a synthetic independent plan without authorizing it', () => expect(validateHostedDemoEnvironment(hostedBuildFixture)).toMatchObject({ enabled: true, deploymentAuthorized: false }));
  it.each([
    { SCHOVERA_PRODUCTION_PROJECT_REFS: '' }, { SCHOVERA_PRODUCTION_PROJECT_REFS: hostedBuildFixture.SCHOVERA_DEMO_PROJECT_REF },
    { SCHOVERA_DEMO_APP_ORIGIN: 'https://schovera.vercel.app' }, { SCHOVERA_DEMO_APP_ORIGIN: 'http://demo.vercel.app' },
    { SCHOVERA_DEMO_APP_ORIGIN: 'https://demo.vercel.app:444' }, { SCHOVERA_DEMO_APP_ORIGIN: 'https://demo.vercel.app/?token=example' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://uvwxyzabcdefghijklmn.supabase.co' },
    { SCHOVERA_DEMO_VERCEL_PROJECT_ID: 'prj_synthetic_production' }, { VERCEL: '1', VERCEL_PROJECT_ID: 'prj_other' },
    { SCHOVERA_PRODUCTION_VERCEL_PROJECT_IDS: '' }, { NEXT_PUBLIC_SCHOVERA_DEMO: '' }, { SCHOVERA_HOSTED_DEMO: '' },
    { NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO: '' }, { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not_allowed' },
    { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-private' }, { OPENAI_API_KEY: 'synthetic-private' },
    { SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY: 'synthetic-private' }, { SCHOVERA_RFID_API_MODE: 'local' },
    { SCHOVERA_TEST_MODE: 'local' }, { SCHOVERA_FALLBACK_MODE: 'local' }, { NEXT_PUBLIC_SCHOVERA_FALLBACK_MODE: 'local' },
    { OLLAMA_BASE_URL: 'http://127.0.0.1:11434' }, { TEACHER_AI_PROVIDER: 'ollama' }, { NEXT_PUBLIC_UNAPPROVED: 'synthetic-private' },
  ])('rejects unsafe config %#', override => expect(() => validateHostedDemoEnvironment({ ...hostedBuildFixture, ...override })).toThrow());
  it('checks the actual Vercel project identity when supplied by Vercel', () => expect(validateHostedDemoEnvironment({ ...hostedBuildFixture, VERCEL: '1', VERCEL_PROJECT_ID: 'prj_synthetic_demo' }).enabled).toBe(true));
});
it('refuses every local adapter even if local flags are accidentally inherited', async () => {
  for (const [name, value] of Object.entries({ SCHOVERA_HOSTED_DEMO:'true', SCHOVERA_TEST_MODE:'local', SCHOVERA_RFID_API_MODE:'local', SCHOVERA_FALLBACK_MODE:'local', NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY:'synthetic-private', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic-public' })) vi.stubEnv(name, value);
  const request = new Request('http://127.0.0.1/api/device/v1/events', { method:'POST', headers:{host:'127.0.0.1'} });
  expect(localRfidServer(request)).toBeNull(); expect(localFallbackEnabled(request)).toBe(false); expect((await legacy(request)).status).toBe(404);
});
it('sets Secure and SameSite cookies only for the hosted demo', () => {
  vi.stubEnv('NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO','true'); createClient();
  expect(browserClient.mock.calls.at(-1)?.[2]).toEqual({cookieOptions:{secure:true,sameSite:'lax'}});
  vi.stubEnv('NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO',''); createClient(); expect(browserClient.mock.calls.at(-1)?.[2]).toBeUndefined();
});
