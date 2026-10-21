import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Pure planning validation. Does not read env files, construct clients or contact a host. */
export function validateDemoReleasePlan({ appUrl, supabaseUrl, demoProjectRef, productionProjectRef }) {
  const app = new URL(appUrl), db = new URL(supabaseUrl);
  if (![app, db].every(u => u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/')) throw new Error('HTTPS origins only; no credentials, paths, queries or fragments');
  if (!/^[a-z]{20}$/.test(demoProjectRef ?? '') || !/^[a-z]{20}$/.test(productionProjectRef ?? '') || demoProjectRef === productionProjectRef) throw new Error('Owner must supply distinct verified demo/production project references, not secrets');
  if (db.hostname !== `${demoProjectRef}.supabase.co`) throw new Error('Database does not match the approved separate demo reference');
  if (!app.hostname.endsWith('.vercel.app') || app.hostname === 'schovera.vercel.app') throw new Error('A separate demo Vercel project is required, never the production app');
  return { planValid: true, deploymentAuthorized: false, hostedSeedingAuthorized: false, deviceIngestion: 'disabled', telephony: 'disabled', teacherAi: 'disabled until compatible backend separately approved' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 6) throw new Error('Planning only: supply app URL, demo Supabase URL, demo reference and production reference. No environment file is read.');
    console.log(JSON.stringify(validateDemoReleasePlan({ appUrl: process.argv[2], supabaseUrl: process.argv[3], demoProjectRef: process.argv[4], productionProjectRef: process.argv[5] }), null, 2));
  } catch (error) { console.error(`Release remains BLOCKED: ${error.message}`); process.exitCode = 1; }
}
