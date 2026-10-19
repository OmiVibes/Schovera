import { createHash } from 'node:crypto';

export const EVENT_SCHEMA_VERSION = 1 as const;
export const MAX_BATCH_EVENTS = 100;
export const MAX_BODY_BYTES = 256 * 1024;
export const TAP_DEBOUNCE_WINDOW_MS = 1_500;

export type DeviceEvent = {
  schema_version: 1;
  event_id: string;
  device_id: string;
  credential_ref: string;
  event_type: 'check_in' | 'check_out';
  observed_at: string;
  device_sequence: number;
};

export type ValidationResult =
  | { ok: true; event: DeviceEvent }
  | { ok: false; error: string };

export type EventOutcome = 'accepted' | 'unmatched';
export type SequenceState = 'in_order' | 'gap' | 'out_of_order';

export type Receipt = {
  receipt_id: string;
  device_id: string;
  event_id: string;
  outcome: EventOutcome;
  sequence_state: SequenceState;
  duplicate_tap: boolean;
  message: string;
};

const EVENT_FIELDS = [
  'schema_version',
  'event_id',
  'device_id',
  'credential_ref',
  'event_type',
  'observed_at',
  'device_sequence',
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function validTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === datePart;
}

export function validateEvent(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'event must be a JSON object' };
  }

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  const missing = EVENT_FIELDS.filter((field) => !Object.hasOwn(record, field));
  if (missing.length) return { ok: false, error: `missing required field: ${missing.join(', ')}` };
  const unexpected = keys.filter((field) => !(EVENT_FIELDS as readonly string[]).includes(field));
  if (unexpected.length) return { ok: false, error: `unexpected field: ${unexpected.join(', ')}` };
  if (record.schema_version !== EVENT_SCHEMA_VERSION) {
    return { ok: false, error: 'unsupported schema_version' };
  }
  if (typeof record.event_id !== 'string' || !UUID_PATTERN.test(record.event_id)) {
    return { ok: false, error: 'event_id must be a UUID' };
  }
  if (typeof record.device_id !== 'string' || !OPAQUE_REF_PATTERN.test(record.device_id)) {
    return { ok: false, error: 'device_id must be an opaque reference of 1–128 safe characters' };
  }
  if (typeof record.credential_ref !== 'string' || !OPAQUE_REF_PATTERN.test(record.credential_ref)) {
    return { ok: false, error: 'credential_ref must be an opaque reference of 1–128 safe characters' };
  }
  if (record.event_type !== 'check_in' && record.event_type !== 'check_out') {
    return { ok: false, error: 'event_type must be check_in or check_out' };
  }
  if (typeof record.observed_at !== 'string' || !validTimestamp(record.observed_at)) {
    return { ok: false, error: 'observed_at must be a valid timezone-qualified ISO-8601 timestamp' };
  }
  if (!Number.isSafeInteger(record.device_sequence) || (record.device_sequence as number) < 1) {
    return { ok: false, error: 'device_sequence must be a positive safe integer' };
  }

  return {
    ok: true,
    event: {
      schema_version: 1,
      event_id: record.event_id as string,
      device_id: record.device_id as string,
      credential_ref: record.credential_ref as string,
      event_type: record.event_type,
      observed_at: record.observed_at as string,
      device_sequence: record.device_sequence as number,
    },
  };
}

export function canonicalEvent(event: DeviceEvent): string {
  return JSON.stringify(Object.fromEntries(EVENT_FIELDS.map((field) => [field, event[field]])));
}

export function eventHash(event: DeviceEvent): string {
  return createHash('sha256').update(canonicalEvent(event)).digest('hex');
}

export function assertSafeTarget(target: string | undefined): void {
  if (!target) return;
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error('target must be a local HTTP URL; remote destinations are disabled');
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (parsed.protocol !== 'http:' || !localHosts.has(parsed.hostname)) {
    throw new Error('simulator refuses external destinations; no network delivery is implemented');
  }
}

export class LocalEventProcessor {
  private readonly credentials = new Map<string, 'active' | 'revoked'>();
  private readonly processed = new Map<string, { hash: string; receipt: Receipt }>();
  private readonly maxSequenceByDevice = new Map<string, number>();
  private readonly recentTaps = new Map<string, number>();

  constructor(credentials: Record<string, 'active' | 'revoked'> = { 'cred-synth-001': 'active' }) {
    for (const [credentialRef, state] of Object.entries(credentials)) this.credentials.set(credentialRef, state);
  }

  setCredentialState(credentialRef: string, state: 'active' | 'revoked'): void {
    this.credentials.set(credentialRef, state);
  }

  process(input: unknown): { status: 'accepted' | 'unmatched' | 'duplicate' | 'conflict' | 'rejected'; receipt?: Receipt; error?: string } {
    const validation = validateEvent(input);
    if (!validation.ok) return { status: 'rejected', error: validation.error };
    const event = validation.event;
    const key = `${event.device_id}:${event.event_id}`;
    const hash = eventHash(event);
    const prior = this.processed.get(key);
    if (prior) {
      if (prior.hash !== hash) return { status: 'conflict', error: 'event ID was already used with a different canonical payload' };
      return { status: 'duplicate', receipt: prior.receipt };
    }

    const previousSequence = this.maxSequenceByDevice.get(event.device_id) ?? 0;
    const sequenceState: SequenceState = event.device_sequence <= previousSequence
      ? 'out_of_order'
      : event.device_sequence > previousSequence + 1
        ? 'gap'
        : 'in_order';
    if (event.device_sequence > previousSequence) this.maxSequenceByDevice.set(event.device_id, event.device_sequence);

    const credentialState = this.credentials.get(event.credential_ref);
    const outcome: EventOutcome = credentialState === 'active' ? 'accepted' : 'unmatched';
    const tapKey = `${event.device_id}:${event.credential_ref}:${event.event_type}`;
    const observedAtMs = Date.parse(event.observed_at);
    const lastTap = this.recentTaps.get(tapKey);
    const duplicateTap = lastTap !== undefined && Math.abs(observedAtMs - lastTap) <= TAP_DEBOUNCE_WINDOW_MS;
    if (lastTap === undefined || observedAtMs > lastTap) this.recentTaps.set(tapKey, observedAtMs);

    const receipt: Receipt = {
      receipt_id: `sim-receipt-${event.device_id}-${event.event_id}`,
      device_id: event.device_id,
      event_id: event.event_id,
      outcome,
      sequence_state: sequenceState,
      duplicate_tap: duplicateTap,
      message: outcome === 'accepted'
        ? (duplicateTap ? 'accepted; separate physical-style tap flagged by debounce policy' : 'accepted; synthetic credential matched')
        : (credentialState === 'revoked' ? 'unmatched; synthetic credential is revoked' : 'unmatched; synthetic credential is unknown'),
    };
    this.processed.set(key, { hash, receipt });
    return { status: outcome, receipt };
  }

  get acceptedCount(): number {
    return [...this.processed.values()].filter(({ receipt }) => receipt.outcome === 'accepted').length;
  }

  get processedCount(): number {
    return this.processed.size;
  }
}

export type QueueItem = { event: unknown; state: 'pending' | 'accepted' | 'unmatched' | 'rejected' | 'conflict' };

/** In-memory only. This demonstrates cloud outage/replay, not Pi durability. */
export class LocalReplayQueue {
  readonly items: QueueItem[] = [];

  enqueue(event: unknown): void {
    this.items.push({ event, state: 'pending' });
  }

  replay(processor: LocalEventProcessor, destinationAvailable: boolean): number {
    if (!destinationAvailable) return 0;
    let delivered = 0;
    for (const item of this.items) {
      if (item.state !== 'pending') continue;
      const result = processor.process(item.event);
      item.state = result.status === 'accepted' || result.status === 'duplicate'
        ? 'accepted'
        : result.status;
      delivered += 1;
    }
    return delivered;
  }
}

export function parseEventLines(text: string): unknown[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      throw new Error(`invalid JSON on line ${index + 1}`);
    }
  });
}

export function validateBatch(events: unknown[]): string | null {
  if (events.length > MAX_BATCH_EVENTS) return `batch exceeds ${MAX_BATCH_EVENTS} events`;
  const bytes = Buffer.byteLength(JSON.stringify(events), 'utf8');
  if (bytes > MAX_BODY_BYTES) return `batch exceeds ${MAX_BODY_BYTES} bytes`;
  return null;
}
