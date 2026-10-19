const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function assertLoopbackHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an HTTP loopback URL for local-only tests.`);
  }
  if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`${label} must be an HTTP loopback URL for local-only tests.`);
  }
}

/**
 * Fail before any Supabase client is created unless this is explicitly local.
 * @param {Record<string, string | undefined>} env
 * @param {{ requireServiceRole?: boolean }} [options]
 */
export function assertLocalTestEnvironment(env = process.env, { requireServiceRole = true } = {}) {
  if (env.SCHOVERA_TEST_MODE !== 'local') {
    throw new Error('Refusing database test: set SCHOVERA_TEST_MODE=local in .env.test.local.');
  }
  assertLoopbackHttpUrl(env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL');
  if (env.SCHOVERA_TEST_URL) assertLoopbackHttpUrl(env.SCHOVERA_TEST_URL, 'SCHOVERA_TEST_URL');
  if (requireServiceRole && !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Refusing database test: local SUPABASE_SERVICE_ROLE_KEY is missing.');
  }
  if (requireServiceRole && !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Refusing database test: local publishable key is missing.');
  }
}
