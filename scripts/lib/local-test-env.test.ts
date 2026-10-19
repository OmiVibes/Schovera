import { describe, expect, it } from 'vitest';
import { assertLocalTestEnvironment } from './local-test-env.mjs';

const localEnv = {
  SCHOVERA_TEST_MODE: 'local',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
  SCHOVERA_TEST_URL: 'http://localhost:3000',
};

describe('local Supabase test environment guard', () => {
  it('allows explicit loopback-only test configuration', () => {
    expect(() => assertLocalTestEnvironment(localEnv)).not.toThrow();
  });

  it('rejects hosted Supabase before client creation even when a test mode is set', () => {
    expect(() => assertLocalTestEnvironment({
      ...localEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    })).toThrow(/loopback URL/);
  });

  it('requires explicit local test mode', () => {
    expect(() => assertLocalTestEnvironment({ ...localEnv, SCHOVERA_TEST_MODE: undefined })).toThrow(/SCHOVERA_TEST_MODE/);
  });

  it('rejects a remote browser target and localhost lookalikes', () => {
    expect(() => assertLocalTestEnvironment({ ...localEnv, SCHOVERA_TEST_URL: 'https://schovera.vercel.app' })).toThrow(/loopback URL/);
    expect(() => assertLocalTestEnvironment({ ...localEnv, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost.attacker.invalid' })).toThrow(/loopback URL/);
  });

  it('requires local integration-test credentials', () => {
    expect(() => assertLocalTestEnvironment({ ...localEnv, SUPABASE_SERVICE_ROLE_KEY: '' })).toThrow(/SERVICE_ROLE_KEY/);
    expect(() => assertLocalTestEnvironment({ ...localEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' })).toThrow(/publishable key/);
  });
});
