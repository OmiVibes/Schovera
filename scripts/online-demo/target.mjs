import { createHash } from 'node:crypto';

export const fingerprint = value => createHash('sha256').update(value).digest('hex');
// Approval file is an OUT-OF-BAND operator attestation, not ownership inferred
// from env variable names. No cloud discovery or dotenv loading occurs here.
export function validateTarget(approval, credentials, now = Date.now()) {
  if (approval?.version !== 1 || approval.purpose !== 'schovera-fictional-demo'
    || !approval.verifiedBy || !approval.verificationEvidence || !/^[0-9a-f]{64}$/.test(approval.datasetSha256 ?? '') || Date.parse(approval.expiresAt) <= now
    || !Number.isFinite(Date.parse(approval.expiresAt))) throw new Error('Current independently verified approval required');
  const { url, key, publishableKey } = credentials;
  let u; try { u = new URL(url); } catch { throw new Error('Target URL refused'); }
  if (u.origin !== url || u.username || u.password || u.search || u.hash) throw new Error('Exact target origin required');
  if (approval.mode === 'local') {
    if (url !== 'http://127.0.0.1:54321' || approval.projectRef !== 'local-Schovera') throw new Error('Local rehearsal target refused');
  } else if (approval.mode === 'hosted') {
    if (!/^[a-z]{20}$/.test(approval.projectRef ?? '') || url !== `https://${approval.projectRef}.supabase.co`
      || !Array.isArray(approval.productionProjectRefs) || !approval.productionProjectRefs.length
      || approval.productionProjectRefs.some(r => !/^[a-z]{20}$/.test(r))
      || approval.productionProjectRefs.includes(approval.projectRef)
      || approval.allowedDemoProjectRefs?.length !== 1 || approval.allowedDemoProjectRefs[0] !== approval.projectRef)
      throw new Error('Independent allowlist / production denylist refused target');
    if (!key?.startsWith('sb_secret_') || !publishableKey?.startsWith('sb_publishable_')) throw new Error('New demo-specific API keys required; legacy / production keys refused');
  } else throw new Error('Unknown target mode');
  if (!key || !publishableKey || approval.url !== url
    || approval.secretKeySha256 !== fingerprint(key) || approval.publishableKeySha256 !== fingerprint(publishableKey))
    throw new Error('Approved endpoint / key fingerprint mismatch');
  return { projectRef: approval.projectRef, url, approvalDigest: fingerprint(JSON.stringify(approval)), mode: approval.mode };
}

export function targetFetch(origin, fetcher = fetch) {
  return async (input, init = {}) => {
    const u = new URL(typeof input === 'string' ? input : input.url);
    if (u.origin !== origin || !/^\/(auth\/v1|rest\/v1)\//.test(u.pathname)) throw new Error('Provisioner egress refused');
    return fetcher(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) });
  };
}
