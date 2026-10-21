// Pure configuration checks. No environment-file discovery, network or cloud actions.
const reference = /^[a-z]{20}$/;
const projectId = /^prj_[A-Za-z0-9_-]+$/;
const publicNames = new Set(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SCHOVERA_DEMO', 'NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO', 'NEXT_PUBLIC_SCHOVERA_FALLBACK_MODE']);

function list(value, pattern) {
  const entries = typeof value === 'string' ? value.split(',').map(s => s.trim()) : [];
  if (!entries.length || entries.some(s => !pattern.test(s))) throw new Error('Verified production identity denylist required');
  return entries;
}

export function validateHostedDemoEnvironment(env) {
  if (env.SCHOVERA_HOSTED_DEMO !== 'true' && env.NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO !== 'true') {
    if ([env.SCHOVERA_HOSTED_DEMO,env.NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO].some(v=>v && v !== 'false')) throw new Error('Invalid hosted demo flag; use explicit boolean text');
    return { enabled: false };
  }
  if (env.SCHOVERA_HOSTED_DEMO !== 'true' || env.NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO !== 'true'
    || env.NEXT_PUBLIC_SCHOVERA_DEMO !== 'true') throw new Error('Hosted demo flags must agree');
  const demoRef = env.SCHOVERA_DEMO_PROJECT_REF;
  const productionRefs = list(env.SCHOVERA_PRODUCTION_PROJECT_REFS, reference);
  if (!reference.test(demoRef ?? '') || productionRefs.includes(demoRef)) throw new Error('Separate verified demo database identity required');
  let app;
  try { app = new URL(env.SCHOVERA_DEMO_APP_ORIGIN ?? ''); } catch { throw new Error('Invalid demo app origin; value withheld'); }
  if (app.protocol !== 'https:' || app.port || app.username || app.password || app.search || app.hash || app.pathname !== '/'
    || !app.hostname.endsWith('.vercel.app') || app.hostname === 'schovera.vercel.app') throw new Error('Separate HTTPS Vercel demo origin required');
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${demoRef}.supabase.co`) throw new Error('Demo database URL/identity mismatch');
  const demoId = env.SCHOVERA_DEMO_VERCEL_PROJECT_ID;
  if (!projectId.test(demoId ?? '') || list(env.SCHOVERA_PRODUCTION_VERCEL_PROJECT_IDS, projectId).includes(demoId)
    || env.VERCEL_PROJECT_ID !== demoId) throw new Error('Separate Vercel project identity required');
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '')) throw new Error('Use the demo publishable key, never a privileged key');
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY',
    'SCHOVERA_RFID_CAPABILITY_KEY_ID', 'SCHOVERA_TEST_MODE', 'SCHOVERA_RFID_API_MODE', 'SCHOVERA_FALLBACK_MODE',
    'NEXT_PUBLIC_SCHOVERA_FALLBACK_MODE', 'OLLAMA_BASE_URL', 'OLLAMA_MODEL']) {
    if (env[name]) throw new Error(`Hosted demo forbids ${name}`);
  }
  if (env.TEACHER_AI_PROVIDER !== 'disabled') throw new Error('Hosted AI must be disabled');
  if (Object.keys(env).some(name => name.startsWith('NEXT_PUBLIC_') && env[name] && !publicNames.has(name))) throw new Error('Unexpected public build variable');
  return { enabled: true, appOrigin: app.origin, demoProjectRef: demoRef, deploymentAuthorized: false };
}

// Synthetic preflight fixture only. These are not owned projects, usable credentials or a live demo.
export const hostedBuildFixture = Object.freeze({
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_preflight_not_a_credential',
  NEXT_PUBLIC_SCHOVERA_DEMO: 'true', NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO: 'true', SCHOVERA_HOSTED_DEMO: 'true',
  SCHOVERA_DEMO_PROJECT_REF: 'abcdefghijklmnopqrst', SCHOVERA_PRODUCTION_PROJECT_REFS: 'uvwxyzabcdefghijklmn',
  SCHOVERA_DEMO_APP_ORIGIN: 'https://schovera-preflight-fixture.vercel.app',
  SCHOVERA_DEMO_VERCEL_PROJECT_ID: 'prj_synthetic_demo', SCHOVERA_PRODUCTION_VERCEL_PROJECT_IDS: 'prj_synthetic_production',
  VERCEL_PROJECT_ID: 'prj_synthetic_demo',
  TEACHER_AI_PROVIDER: 'disabled',
});
