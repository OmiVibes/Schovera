import { describe, expect, it, vi } from 'vitest';
import { fakeProvider, scenarios, type SimulationInput } from './fallback-provider';
import { localFallbackEnabled } from './fallback-server';

const event: SimulationInput = { idempotency_key: 'd536cd08-99ef-4d51-9dbf-74742c88ba7c', recipient_ref: 'SIM-883a1ed8-2d73-40a2-b89b-61f1dfc6c2e4', channel: 'sms', title: 'Synthetic title', body: 'Synthetic message', content_hash: 'a'.repeat(64), status: 'pending', attempt_count: 0 };
describe('fake telephony, never delivery', () => {
  it.each(scenarios)('labels and deterministically repeats %s without network', (scenario) => {
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('network prohibited'); });
    try {
      const first = fakeProvider.submit(event, scenario);
      expect(first.label).toBe('SIMULATED');
      expect(fakeProvider.submit(event, scenario)).toEqual(first);
      expect(JSON.stringify(first)).not.toContain(event.body);
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
  it('confirms uncertain and accepted results using the same receipt for both channels', () => {
    for (const channel of ['sms', 'ivr'] as const) {
      const uncertain = fakeProvider.submit({ ...event, channel }, 'timeout');
      expect(uncertain.status).toBe('uncertain');
      expect(fakeProvider.submit({ ...event, channel, status: 'uncertain' }, 'deliver').receipt_ref).toBe(uncertain.receipt_ref);
      expect(fakeProvider.submit({ ...event, channel, status: 'accepted' }, 'deliver').status).toBe('delivered');
    }
  });
  it('rejects telephone numbers', () => expect(() => fakeProvider.submit({ ...event, recipient_ref: '+919999999999' }, 'deliver')).toThrow());
  it('fails closed before clients for hosted URLs and ordinary mode', () => {
    const env = { SCHOVERA_FALLBACK_MODE: 'local', SCHOVERA_TEST_MODE: 'local', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' };
    const local = new Request('http://127.0.0.1:3000/api/fallback-simulator', { headers: { host: '127.0.0.1:3000' } });
    expect(localFallbackEnabled(local, env)).toBe(true);
    expect(localFallbackEnabled(local, { ...env, SCHOVERA_FALLBACK_MODE: '' })).toBe(false);
    expect(localFallbackEnabled(local, { ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://production.supabase.co' })).toBe(false);
    expect(localFallbackEnabled(new Request('https://schovera.vercel.app/api/fallback-simulator', { headers: { host: 'schovera.vercel.app' } }), env)).toBe(false);
  });
});
