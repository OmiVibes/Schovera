import { randomUUID } from 'node:crypto';
import { validateHostedDemoEnvironment } from '../../src/lib/demo-deployment-policy.mjs';
import { datasetDigest } from './dataset.mjs';

export function planProvisioning(env, dataset, { runId = randomUUID(), expiresAt, now = Date.now() } = {}) {
  const identity = validateHostedDemoEnvironment(env);
  if (!identity.enabled || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) throw new Error('Explicit hosted identity and run UUID required');
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 14*86400000) throw new Error('Explicit demo expiry within 14 days required');
  return { version:1,projectRef:identity.demoProjectRef,appOrigin:identity.appOrigin,runId,digest:datasetDigest(dataset),expiresAt:new Date(expiry).toISOString(),cloudExecutionAuthorized:false };
}

/** Adapter contract exercised offline only. There is deliberately no hosted client
 * implementation or CLI apply/cleanup path in Task 32S. A later approved adapter
 * must independently verify identity, restrict rows by run ownership, generate
 * private per-presenter accounts, and durably journal every mutation/retry. */
export async function proveProvisioning(plan, dataset, adapter, operation='prepare', now=Date.now()) {
  if (adapter.mode !== 'offline-proof' || plan.cloudExecutionAuthorized !== false) throw new Error('Cloud execution is not authorized in Task 32S');
  if (datasetDigest(dataset) !== plan.digest || !['prepare','rotate','cleanup'].includes(operation)) throw new Error('Dataset changed or unsupported operation');
  if (operation !== 'cleanup' && Date.parse(plan.expiresAt) <= now) throw new Error('Demo expired');
  const identity = await adapter.identify();
  if (identity.projectRef !== plan.projectRef || identity.appOrigin !== plan.appOrigin) throw new Error('Adapter identity mismatch');
  const prior = await adapter.journal(plan.runId);
  if (prior && ['projectRef','digest','expiresAt'].some(k=>prior[k]!==plan[k])) throw new Error('Run ownership conflict');
  if (operation !== 'prepare' && !prior) throw new Error('Owned journal required');
  if (operation === 'cleanup') { await adapter.removeOwned(plan.runId); return { cleaned:true }; }
  if (operation === 'rotate') { await adapter.rotateOwned(plan.runId); return { rotated:true }; }
  if (prior?.complete) return { duplicate:true,runId:plan.runId };
  await adapter.reserve(plan);
  await adapter.upsertOwned(plan.runId,dataset); // Requires stable logical→new-ID journal; never a global reset.
  await adapter.complete(plan.runId);
  return { duplicate:false,runId:plan.runId };
}
