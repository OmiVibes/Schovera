import { describe, expect, it } from 'vitest';
import {
  assertSafeTarget,
  LocalEventProcessor,
  LocalReplayQueue,
  validateEvent,
  type DeviceEvent,
} from './core';

const event = (overrides: Partial<DeviceEvent> = {}): DeviceEvent => ({
  schema_version: 1,
  event_id: '10000000-0000-4000-8000-000000000001',
  device_id: 'device-synth-gate-a',
  credential_ref: 'cred-synth-001',
  event_type: 'check_in',
  observed_at: '2026-10-19T08:00:00+05:30',
  device_sequence: 1,
  ...overrides,
});

describe('hardware-free RFID event contract and simulator', () => {
  it('accepts valid check-in and check-out observations', () => {
    const processor = new LocalEventProcessor();
    expect(processor.process(event()).status).toBe('accepted');
    expect(processor.process(event({
      event_id: '10000000-0000-4000-8000-000000000002',
      event_type: 'check_out',
      device_sequence: 2,
      observed_at: '2026-10-19T14:00:00+05:30',
    })).status).toBe('accepted');
  });

  it('rejects unsupported schema versions, event types, and malformed UUIDs', () => {
    expect(validateEvent({ ...event(), schema_version: 2 }).ok).toBe(false);
    expect(validateEvent({ ...event(), event_type: 'entry' }).ok).toBe(false);
    expect(validateEvent({ ...event(), event_id: 'not-a-uuid' }).ok).toBe(false);
  });

  it('rejects missing fields, unexpected identity fields, and invalid timestamps', () => {
    const missing = { ...event() } as Record<string, unknown>;
    delete missing.credential_ref;
    expect(validateEvent(missing).ok).toBe(false);
    expect(validateEvent({ ...event(), student_name: 'not-allowed' }).ok).toBe(false);
    expect(validateEvent({ ...event(), observed_at: '2026-02-30T08:00:00Z' }).ok).toBe(false);
  });

  it('returns the original deterministic receipt for an exact retry', () => {
    const processor = new LocalEventProcessor();
    const first = processor.process(event());
    const retry = processor.process(event());
    expect(retry.status).toBe('duplicate');
    expect(retry.receipt).toEqual(first.receipt);
    expect(processor.acceptedCount).toBe(1);
  });

  it('conflicts when the same device event ID is reused with changed content', () => {
    const processor = new LocalEventProcessor();
    processor.process(event());
    expect(processor.process(event({ event_type: 'check_out' })).status).toBe('conflict');
    expect(processor.acceptedCount).toBe(1);
  });

  it('does not conflate distinct events', () => {
    const processor = new LocalEventProcessor();
    expect(processor.process(event()).status).toBe('accepted');
    expect(processor.process(event({
      event_id: '10000000-0000-4000-8000-000000000002',
      device_sequence: 2,
      observed_at: '2026-10-19T08:01:00+05:30',
    })).status).toBe('accepted');
    expect(processor.acceptedCount).toBe(2);
  });

  it('flags sequence gaps and late out-of-order events without dropping them', () => {
    const processor = new LocalEventProcessor();
    const later = processor.process(event({ device_sequence: 2 }));
    const earlier = processor.process(event({
      event_id: '10000000-0000-4000-8000-000000000002',
      device_sequence: 1,
    }));
    expect(later.receipt?.sequence_state).toBe('gap');
    expect(earlier.receipt?.sequence_state).toBe('out_of_order');
    expect(processor.acceptedCount).toBe(2);
  });

  it('returns privacy-safe unmatched results for revoked and unknown credentials', () => {
    const processor = new LocalEventProcessor({ 'cred-synth-revoked': 'revoked' });
    const revoked = processor.process(event({ credential_ref: 'cred-synth-revoked' }));
    const unknown = processor.process(event({
      event_id: '10000000-0000-4000-8000-000000000002',
      credential_ref: 'cred-synth-unknown',
      device_sequence: 2,
    }));
    expect(revoked.status).toBe('unmatched');
    expect(unknown.status).toBe('unmatched');
    expect(JSON.stringify([revoked, unknown])).not.toContain('student');
  });

  it('flags separate physical-style taps instead of calling them network retries', () => {
    const processor = new LocalEventProcessor();
    processor.process(event());
    const tap = processor.process(event({
      event_id: '10000000-0000-4000-8000-000000000002',
      device_sequence: 2,
      observed_at: '2026-10-19T08:00:01+05:30',
    }));
    expect(tap.status).toBe('accepted');
    expect(tap.receipt?.duplicate_tap).toBe(true);
    expect(processor.acceptedCount).toBe(2);
  });

  it('keeps events pending during an outage and accepts once after recovery', () => {
    const processor = new LocalEventProcessor();
    const queue = new LocalReplayQueue();
    queue.enqueue(event());
    expect(queue.replay(processor, false)).toBe(0);
    expect(queue.items[0].state).toBe('pending');
    expect(queue.replay(processor, true)).toBe(1);
    expect(queue.items[0].state).toBe('accepted');
    expect(queue.replay(processor, true)).toBe(0);
    expect(processor.acceptedCount).toBe(1);
  });

  it('allows local loopback targets but refuses production and other external targets', () => {
    expect(() => assertSafeTarget(undefined)).not.toThrow();
    expect(() => assertSafeTarget('http://127.0.0.1:3000')).not.toThrow();
    expect(() => assertSafeTarget('https://schovera.vercel.app')).toThrow(/refuses external destinations/);
    expect(() => assertSafeTarget('https://example.com')).toThrow(/refuses external destinations/);
  });
});
