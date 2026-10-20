import { createHash } from 'node:crypto';

export const scenarios = ['deliver', 'delay', 'temporary_failure', 'permanent_failure', 'unreachable', 'reject', 'timeout'] as const;
export type Scenario = typeof scenarios[number];
export type SimulationInput = {
  idempotency_key: string; recipient_ref: string; channel: 'sms' | 'ivr';
  title: string; body: string; content_hash: string; status: string; attempt_count: number;
};
export type FakeReceipt = { label: 'SIMULATED'; status: 'accepted' | 'delivered' | 'retry_wait' | 'failed' | 'uncertain'; receipt_ref: string | null; code: string };
export interface FallbackProvider { submit(input: SimulationInput, scenario: Scenario): FakeReceipt }

// Pure fake adapter: no HTTP client, socket, callback, timer, phone number or IO.
// Persistent queue identity, not process memory, gives retries the same receipt.
export const fakeProvider: FallbackProvider = {
  submit(input, scenario) {
    if (!/^SIM-[0-9a-f-]{36}$/.test(input.recipient_ref) || !/^[0-9a-f-]{36}$/.test(input.idempotency_key)
      || !['sms', 'ivr'].includes(input.channel) || !/^[0-9a-f]{64}$/.test(input.content_hash)
      || !input.title || !input.body || !scenarios.includes(scenario)) throw new Error('Invalid synthetic submission');
    const receipt = `SIMULATED-${createHash('sha256').update(input.idempotency_key).digest('hex').slice(0, 32)}`;
    if (['accepted', 'uncertain', 'delivered'].includes(input.status)) return { label: 'SIMULATED', status: 'delivered', receipt_ref: receipt, code: 'fake_confirmed' };
    if (scenario === 'temporary_failure') return { label: 'SIMULATED', status: 'retry_wait', receipt_ref: null, code: 'fake_temporary' };
    if (['permanent_failure', 'unreachable', 'reject'].includes(scenario)) return { label: 'SIMULATED', status: 'failed', receipt_ref: null, code: `fake_${scenario}` };
    return { label: 'SIMULATED', status: scenario === 'delay' ? 'accepted' : scenario === 'timeout' ? 'uncertain' : 'delivered', receipt_ref: receipt, code: `fake_${scenario}` };
  },
};
