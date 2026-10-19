import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createPrivateKey, generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { POST as registerKey } from '../src/app/api/device/v2/capability-keys/route';
import { POST as issueCapability } from '../src/app/api/device/v2/capabilities/route';
import { POST as ingestV2 } from '../src/app/api/device/v2/events/route';
import { POST as ingestV1 } from '../src/app/api/device/v1/events/route';
import { canonicalSignedMessage } from '../src/lib/rfid/server';
import { canonicalEventV2, signAssignmentCapability, type AssignmentCapabilityClaims, type DeviceEventV2 } from './rfid-simulator/event-v2';
import { assertLocalTestEnvironment } from './lib/local-test-env.mjs';

type Account = { id: string; email: string; client: SupabaseClient; token: string };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const testUrl = process.env.SCHOVERA_TEST_URL ?? 'http://127.0.0.1:3000';
const applicationHost = '127.0.0.1:3000';
const uuid = () => randomUUID();
const suffix = uuid().slice(0, 8);
const password = `LocalRfidV2-${uuid()}!aA1`;
const created = { schools: [] as string[], classes: [] as string[], students: [] as string[], users: [] as string[], devices: [] as string[], credentials: [] as string[] };
let admin: SupabaseClient;
let principalA: Account; let principalB: Account; let parentA: Account; let teacherA: Account;
let schoolA: string; let schoolB: string; let classA: string; let classB: string;
let studentA: string; let studentB: string; let studentRace: string; let studentInactive: string;
let deviceA: { id: string; privateKey: KeyObject };
let deviceAOther: { id: string; privateKey: KeyObject };
let deviceB: { id: string; privateKey: KeyObject };
let assignmentA: string; let assignmentB: string; let assignmentRace: string; let assignmentInactive: string;
let refA: string; let refRace: string; let refInactive: string;
let capabilityA: string; let capabilityB: string; let capabilityRace: string; let capabilityInactive: string;
let issuerPrivate: KeyObject; let issuerKeyId: string;
function expected(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function must<T>(result: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<Exclude<T, null>> {
  const { data, error } = await result;
  if (error) throw new Error(error.message);
  return data as Exclude<T, null>;
}
async function count(result: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count: rows, error } = await result;
  if (error) throw new Error(error.message);
  return rows ?? 0;
}
async function createSchool(name: string): Promise<string> {
  const row = await must(admin.from('schools').insert({ name: `Synthetic RFID v2 ${name} ${suffix}`, code: `RF2-${name}-${suffix}-${uuid().slice(0, 4)}` }).select('id').single());
  created.schools.push(row.id);
  return row.id;
}
async function createAccount(role: 'principal' | 'parent' | 'teacher', schoolId: string): Promise<Account> {
  const email = `${role}-${suffix}-${uuid().slice(0, 4)}@rfid-v2.local.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('synthetic account creation failed');
  created.users.push(data.user.id);
  await must(admin.from('profiles').insert({ id: data.user.id, school_id: schoolId, email, full_name: `Synthetic ${role}`, role, active: true }));
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error('synthetic account sign-in failed');
  return { id: data.user.id, email, client, token: signedIn.data.session.access_token };
}
async function createClass(schoolId: string, division: string): Promise<string> {
  const row = await must(admin.from('classes').insert({ school_id: schoolId, grade: '9', division: `${division}-${suffix}`, academic_year: 'RFID-V2-TEST' }).select('id').single());
  created.classes.push(row.id);
  return row.id;
}
async function createStudent(schoolId: string, classId: string, roll: string): Promise<string> {
  const row = await must(admin.from('students').insert({ school_id: schoolId, class_id: classId, roll_number: `${roll}-${suffix}`, full_name: `Synthetic ${roll} ${suffix}`, active: true }).select('id').single());
  created.students.push(row.id);
  return row.id;
}
async function invoke(handler: (request: Request) => Promise<Response>, path: string, body?: unknown, token?: string): Promise<Response> {
  return handler(new Request(`http://${applicationHost}${path}`, {
    method: 'POST',
    headers: { host: applicationHost, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}
async function provisionDevice(principal: Account, label: string) {
  const pair = generateKeyPairSync('ed25519');
  const pem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const id = await must(principal.client.rpc('provision_school_device', { p_label: label, p_hardware_type: 'local_simulator', p_verification_public_key: pem }));
  created.devices.push(id);
  return { id, privateKey: pair.privateKey };
}
async function issueCredential(principal: Account, studentId: string, ref: string, version: number): Promise<string> {
  const id = await must(principal.client.rpc('issue_student_credential', { p_student_id: studentId, p_credential_ref: ref, p_credential_version: version }));
  created.credentials.push(id);
  return id;
}
async function capability(principal: Account, assignmentId: string, deviceId: string): Promise<string> {
  const response = await invoke(issueCapability, '/api/device/v2/capabilities', { assignment_id: assignmentId, device_id: deviceId }, principal.token);
  if (!response.ok) throw new Error(`capability issuance failed with ${response.status}`);
  return (await response.json()).capability as string;
}
function makeEvent(deviceId: string, assignmentId: string, assignmentVersion: number, credentialRef: string, token: string, sequence: number, overrides: Partial<DeviceEventV2> = {}): DeviceEventV2 {
  return { schema_version: 2, event_id: uuid(), device_id: deviceId, credential_ref: credentialRef,
    credential_assignment_id: assignmentId, credential_assignment_version: assignmentVersion,
    assignment_capability: token, event_type: sequence % 2 ? 'check_in' : 'check_out',
    observed_at: new Date().toISOString(), device_sequence: sequence, ...overrides };
}
async function send(event: DeviceEventV2, key: KeyObject, options: { timestamp?: string; nonce?: string; badSignature?: boolean; host?: string } = {}) {
  const body = canonicalEventV2(event);
  const timestamp = options.timestamp ?? String(Date.now());
  const nonce = options.nonce ?? uuid();
  const signature = options.badSignature ? 'invalid' : sign(null, canonicalSignedMessage('POST', timestamp, nonce, body, '/api/device/v2/events'), key).toString('base64');
  return ingestV2(new Request(`http://${options.host ?? applicationHost}/api/device/v2/events`, {
    method: 'POST', headers: { host: options.host ?? applicationHost, 'content-type': 'application/json',
      'x-schovera-device-id': event.device_id, 'x-schovera-timestamp': timestamp,
      'x-schovera-nonce': nonce, 'x-schovera-signature': signature }, body,
  }));
}
async function result(response: Response) { return response.json() as Promise<Record<string, unknown>>; }
async function setup() {
  assertLocalTestEnvironment(process.env);
  const target = new URL(testUrl);
  expected(target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'test app target must be loopback');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const keyDir = join(root, '.local', 'schovera-rfid-gateway');
  const privateText = await readFile(join(keyDir, 'capability-issuer.private.pem'), 'utf8');
  issuerKeyId = (await readFile(join(keyDir, 'capability-issuer.key-id'), 'utf8')).trim();
  issuerPrivate = createPrivateKey(privateText);
  expected(issuerPrivate.asymmetricKeyType === 'ed25519' && /^[A-Za-z0-9._:-]{1,128}$/.test(issuerKeyId), 'local synthetic Ed25519 issuer key required');
  process.env.SCHOVERA_RFID_API_MODE = 'local';
  process.env.SCHOVERA_RFID_CAPABILITY_KEY_ID = issuerKeyId;
  process.env.SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY = privateText;
  admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  schoolA = await createSchool('A'); schoolB = await createSchool('B');
  principalA = await createAccount('principal', schoolA); principalB = await createAccount('principal', schoolB);
  parentA = await createAccount('parent', schoolA); teacherA = await createAccount('teacher', schoolA);
  classA = await createClass(schoolA, 'A'); classB = await createClass(schoolA, 'B');
  studentA = await createStudent(schoolA, classA, 'A'); studentB = await createStudent(schoolA, classB, 'B');
  studentRace = await createStudent(schoolA, classA, 'R'); studentInactive = await createStudent(schoolA, classB, 'I');
  await must(admin.from('parent_student_links').insert({ parent_id: parentA.id, student_id: studentA, status: 'active' }));
  await must(admin.from('teacher_class_assignments').insert({ teacher_id: teacherA.id, class_id: classA }));
  const firstToken = await principalA.client.auth.getSession();
  expected(Boolean(firstToken.data.session?.access_token), 'local principal token missing');
  const registration = await invoke(registerKey, '/api/device/v2/capability-keys', undefined, principalA.token);
  expected(registration.status === 200, `local capability key registration failed: ${registration.status}`);
  const forbiddenRegistration = await invoke(registerKey, '/api/device/v2/capability-keys', undefined, parentA.token);
  expected(forbiddenRegistration.status === 403, 'non-Principal registered issuer key');
  deviceA = await provisionDevice(principalA, `synthetic-v2-a-${suffix}`);
  deviceAOther = await provisionDevice(principalA, `synthetic-v2-a-other-${suffix}`);
  deviceB = await provisionDevice(principalB, `synthetic-v2-b-${suffix}`);
  // Same local synthetic server key is scoped by school in the registry.
  const registeredB = await invoke(registerKey, '/api/device/v2/capability-keys', undefined, principalB.token);
  expected(registeredB.status === 200, 'same key ID could not be registered for an isolated second synthetic school');
  refA = `v2-reused-${suffix}`; refRace = `v2-race-${suffix}`; refInactive = `v2-inactive-${suffix}`;
  assignmentA = await issueCredential(principalA, studentA, refA, 1);
  assignmentRace = await issueCredential(principalA, studentRace, refRace, 1);
  assignmentInactive = await issueCredential(principalA, studentInactive, refInactive, 1);
  capabilityA = await capability(principalA, assignmentA, deviceA.id);
  capabilityRace = await capability(principalA, assignmentRace, deviceA.id);
  capabilityInactive = await capability(principalA, assignmentInactive, deviceA.id);
}

async function cleanup() {
  if (!admin) return;
  if (created.devices.length) {
    const receipts = await admin.from('device_event_receipts').delete().in('device_id', created.devices);
    const events = await admin.from('school_entry_events').delete().in('device_id', created.devices);
    const devices = await admin.from('school_devices').delete().in('id', created.devices);
    if (receipts.error || events.error || devices.error) throw new Error('RFID synthetic device/event cleanup failed');
  }
  if (created.credentials.length) {
    const credentials = await admin.from('student_credentials').delete().in('id', created.credentials);
    if (credentials.error) throw new Error('RFID synthetic credential cleanup failed');
  }
  if (created.schools.length) {
    const keys = await admin.from('rfid_capability_signing_keys').delete().in('school_id', created.schools);
    if (keys.error) throw new Error('RFID synthetic key cleanup failed');
  }
  if (created.students.length) {
    const links = await admin.from('parent_student_links').delete().in('student_id', created.students);
    const students = await admin.from('students').delete().in('id', created.students);
    if (links.error || students.error) throw new Error('RFID synthetic student cleanup failed');
  }
  if (created.classes.length) {
    const assignments = await admin.from('teacher_class_assignments').delete().in('class_id', created.classes);
    if (assignments.error) throw new Error('RFID synthetic assignment cleanup failed');
  }
  if (created.schools.length) {
    const audits = await admin.from('audit_events').delete().in('school_id', created.schools);
    if (audits.error) throw new Error('RFID synthetic audit cleanup failed');
  }
  if (created.users.length) {
    const profiles = await admin.from('profiles').delete().in('id', created.users);
    if (profiles.error) throw new Error('RFID synthetic profile cleanup failed');
  }
  if (created.classes.length) {
    const classes = await admin.from('classes').delete().in('id', created.classes);
    if (classes.error) throw new Error('RFID synthetic class cleanup failed');
  }
  for (const id of created.users) {
    const user = await admin.auth.admin.deleteUser(id);
    if (user.error) throw new Error('RFID synthetic Auth-user cleanup failed');
  }
  if (created.schools.length) {
    const schools = await admin.from('schools').delete().in('id', created.schools);
    if (schools.error) throw new Error('RFID synthetic school cleanup failed');
  }
  const remaining = created.schools.length
    ? await count(admin.from('schools').select('id', { count: 'exact', head: true }).in('id', created.schools)) : 0;
  if (remaining !== 0) throw new Error('RFID cleanup verification found leftover synthetic schools');
}

describe('Task 32G local RFID v2 integration', () => {
  beforeAll(setup, 120_000);
  afterAll(cleanup, 120_000);

  it('enforces capability issuance, immutable attribution, idempotency, revoke races, and role RLS', async () => {
    const v1 = await invoke(ingestV1, '/api/device/v1/events', { schema_version: 1 });
    expect(v1.status).toBe(410);

    const invalidIssue = await invoke(issueCapability, '/api/device/v2/capabilities', { assignment_id: uuid(), device_id: deviceA.id }, parentA.token);
    expect(invalidIssue.status).toBe(403);
    const wrongSchoolIssue = await invoke(issueCapability, '/api/device/v2/capabilities', { assignment_id: assignmentA, device_id: deviceA.id }, principalB.token);
    expect(wrongSchoolIssue.status).toBe(403);
    const oversizedIssue = await issueCapability(new Request(`http://${applicationHost}/api/device/v2/capabilities`, {
      method: 'POST', headers: { host: applicationHost, 'content-type': 'application/json', authorization: `Bearer ${principalA.token}` }, body: 'x'.repeat(1025),
    }));
    expect(oversizedIssue.status).toBe(400);
    const oversizedEvent = await ingestV2(new Request(`http://${applicationHost}/api/device/v2/events`, {
      method: 'POST', headers: { host: applicationHost, 'content-type': 'application/json' }, body: 'x'.repeat(16 * 1024 + 1),
    }));
    expect(oversizedEvent.status).toBe(413);

    const checkIn = makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 1);
    const accepted = await send(checkIn, deviceA.privateKey);
    expect(accepted.status).toBe(202);
    const acceptedResult = await result(accepted);
    expect(acceptedResult.outcome).toBe('accepted');
    const firstReceipt = await result(await send(checkIn, deviceA.privateKey));
    expect(firstReceipt.duplicate).toBe(true);
    expect(firstReceipt.receipt_id).toBe(acceptedResult.receipt_id);
    const checkOut = makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 2, { event_type: 'check_out' });
    expect((await result(await send(checkOut, deviceA.privateKey))).outcome).toBe('accepted');
    const reusedNonce = uuid();
    const nonceEvent = makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 3);
    expect((await send(nonceEvent, deviceA.privateKey, { nonce: reusedNonce })).status).toBe(202);
    const nonceReplay = makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 4);
    expect((await send(nonceReplay, deviceA.privateKey, { nonce: reusedNonce })).status).toBe(409);

    const tampered = { ...makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 3), assignment_capability: `${capabilityA.slice(0, -1)}x` };
    expect((await send(tampered, deviceA.privateKey)).status).toBe(401);
    expect((await send(makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 4), deviceA.privateKey, { timestamp: '1' })).status).toBe(401);
    expect((await send(makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 5), deviceA.privateKey, { badSignature: true })).status).toBe(401);
    expect((await send(makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 6), deviceA.privateKey, { host: 'schovera.vercel.app' })).status).toBe(404);
    expect((await send(makeEvent(deviceAOther.id, assignmentA, 1, refA, capabilityA, 1), deviceAOther.privateKey)).status).toBe(401);
    expect((await send(makeEvent(deviceA.id, assignmentA, 1, 'different-opaque-ref', capabilityA, 6), deviceA.privateKey)).status).toBe(401);

    const expiredClaims: AssignmentCapabilityClaims = { token_version: 1, key_id: issuerKeyId, assignment_id: assignmentA,
      assignment_version: 1, credential_ref: refA, device_id: deviceA.id, school_id: schoolA, not_before: 1, expires_at: 2 };
    const expired = makeEvent(deviceA.id, assignmentA, 1, refA, signAssignmentCapability(expiredClaims, issuerPrivate), 7);
    const expiredResponse = await send(expired, deviceA.privateKey);
    expect(expiredResponse.status).toBe(202);
    expect((await result(expiredResponse)).outcome).toBe('unresolved');
    const expiredReceipt = await must(admin.from('device_event_receipts').select('unresolved_reason,event_id').eq('device_event_id', expired.event_id).single());
    expect(expiredReceipt.unresolved_reason).toBe('capability_outside_validity');
    expect(expiredReceipt.event_id).toBeNull();
    const altered = makeEvent(deviceA.id, assignmentA, 2, refA, capabilityA, 8);
    expect((await send(altered, deviceA.privateKey)).status).toBe(401);
    const wrongDeviceEvent = makeEvent(deviceB.id, assignmentA, 1, refA, capabilityA, 1);
    expect((await send(wrongDeviceEvent, deviceB.privateKey)).status).toBe(403);

    // Revoke A, reuse the same opaque reference for B, then deliver A's old queued event.
    await must(principalA.client.rpc('revoke_student_credential', { p_credential_id: assignmentA }));
    assignmentB = await issueCredential(principalA, studentB, refA, 2);
    capabilityB = await capability(principalA, assignmentB, deviceA.id);
    const delayedA = makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 10, { observed_at: '2020-01-01T00:00:00Z' });
    const unresolved = await send(delayedA, deviceA.privateKey);
    expect(unresolved.status).toBe(202);
    const delayedResult = await result(unresolved);
    expect(delayedResult.outcome).toBe('unresolved');
    expect(delayedResult.sequence_state).toBe('gap');
    const newB = makeEvent(deviceA.id, assignmentB, 2, refA, capabilityB, 11);
    const acceptedB = await send(newB, deviceA.privateKey);
    expect((await result(acceptedB)).outcome).toBe('accepted');
    const resolvedB = await must(admin.from('school_entry_events').select('student_id,credential_assignment_id,timestamp_quality').eq('device_event_id', newB.event_id).single());
    expect(resolvedB.student_id).toBe(studentB);
    expect(resolvedB.credential_assignment_id).toBe(assignmentB);
    const eventMutation = await admin.from('school_entry_events').update({ student_id: studentA }).eq('device_event_id', newB.event_id);
    expect(Boolean(eventMutation.error)).toBe(true);
    const assignmentMutation = await admin.from('student_credentials').update({ student_id: studentA }).eq('id', assignmentB);
    expect(Boolean(assignmentMutation.error)).toBe(true);
    const unresolvedReceipt = await must(admin.from('device_event_receipts').select('event_id,outcome,credential_assignment_id,event_type,observed_at,device_sequence,unresolved_reason').eq('device_event_id', delayedA.event_id).single());
    expect(unresolvedReceipt.event_id).toBeNull();
    expect(unresolvedReceipt.outcome).toBe('unresolved');
    expect(unresolvedReceipt.credential_assignment_id).toBe(assignmentA);
    expect(unresolvedReceipt.event_type).toBe(delayedA.event_type);
    expect(unresolvedReceipt.observed_at).toBeTruthy();
    expect(unresolvedReceipt.device_sequence).toBe(delayedA.device_sequence);
    expect(unresolvedReceipt.unresolved_reason).toBe('assignment_unavailable');
    const changedEvidence = makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 11, { event_id: newB.event_id, event_type: 'check_out' });
    expect((await send(changedEvidence, deviceA.privateKey)).status).toBe(409);

    // Valid old observation times never select a historical owner; they only set a quality flag.
    const uncertainTime = makeEvent(deviceA.id, assignmentB, 2, refA, capabilityB, 12, { observed_at: '2001-01-01T00:00:00Z' });
    expect((await result(await send(uncertainTime, deviceA.privateKey))).outcome).toBe('accepted');
    const uncertainRow = await must(admin.from('school_entry_events').select('student_id,timestamp_quality').eq('device_event_id', uncertainTime.event_id).single());
    expect(uncertainRow.student_id).toBe(studentB);
    expect(uncertainRow.timestamp_quality).toBe('clock_uncertain');

    // Same signed event racing over independent request nonces creates one event and one durable receipt.
    const concurrent = makeEvent(deviceA.id, assignmentB, 2, refA, capabilityB, 13);
    const concurrentResponses = await Promise.all([send(concurrent, deviceA.privateKey), send(concurrent, deviceA.privateKey)]);
    expect(concurrentResponses.every((response) => response.status === 200 || response.status === 202)).toBe(true);
    expect(await count(admin.from('school_entry_events').select('id', { count: 'exact', head: true }).eq('device_event_id', concurrent.event_id))).toBe(1);
    expect(await count(admin.from('device_event_receipts').select('id', { count: 'exact', head: true }).eq('device_event_id', concurrent.event_id))).toBe(1);

    // Valid, signed unknown-assignment evidence is retained privately as unresolved, never guessed by ref.
    const unknownAssignment = uuid();
    const unknownClaims: AssignmentCapabilityClaims = { token_version: 1, key_id: issuerKeyId, assignment_id: unknownAssignment,
      assignment_version: 1, credential_ref: `unknown-${suffix}`, device_id: deviceA.id, school_id: schoolA,
      not_before: Math.floor(Date.now() / 1000) - 2, expires_at: Math.floor(Date.now() / 1000) + 300 };
    const unknownEvent = makeEvent(deviceA.id, unknownAssignment, 1, unknownClaims.credential_ref, signAssignmentCapability(unknownClaims, issuerPrivate), 14);
    const unknownResponse = await send(unknownEvent, deviceA.privateKey);
    const unknownResult = await result(unknownResponse);
    expect(unknownResponse.status, JSON.stringify(unknownResult)).toBe(202);
    expect(unknownResult.outcome).toBe('unresolved');

    // Revocation and sync serialize on the exact assignment; either valid winner is safe, neither may map to another child.
    const raceEvent = makeEvent(deviceA.id, assignmentRace, 1, refRace, capabilityRace, 15);
    const [raceResponse, raceRevocation] = await Promise.all([send(raceEvent, deviceA.privateKey), principalA.client.rpc('revoke_student_credential', { p_credential_id: assignmentRace })]);
    expect(raceResponse.status).toBe(202);
    expect(raceRevocation.error).toBeNull();
    const raceReceipt = await must(admin.from('device_event_receipts').select('outcome,event_id').eq('device_event_id', raceEvent.event_id).single());
    if (raceReceipt.outcome === 'accepted') {
      const row = await must(admin.from('school_entry_events').select('student_id,credential_assignment_id').eq('device_event_id', raceEvent.event_id).single());
      expect(row.student_id).toBe(studentRace); expect(row.credential_assignment_id).toBe(assignmentRace);
    } else expect(raceReceipt.outcome).toBe('unresolved');

    await must(admin.from('students').update({ active: false }).eq('id', studentInactive));
    const inactiveEvent = makeEvent(deviceA.id, assignmentInactive, 1, refInactive, capabilityInactive, 16);
    expect((await result(await send(inactiveEvent, deviceA.privateKey))).outcome).toBe('unresolved');
    const outOfOrder = makeEvent(deviceA.id, assignmentA, 1, refA, capabilityA, 5);
    const outOfOrderResult = await result(await send(outOfOrder, deviceA.privateKey));
    expect(outOfOrderResult.outcome).toBe('unresolved');
    expect(outOfOrderResult.sequence_state).toBe('out_of_order');

    // Per-role persisted RLS remains the dashboard source of truth; unresolved receipts are not role-readable.
    const parentRows = await must(parentA.client.from('school_entry_events').select('student_id'));
    expect(parentRows.length > 0 && parentRows.every((row) => row.student_id === studentA)).toBe(true);
    const teacherRows = await must(teacherA.client.from('school_entry_events').select('student_id'));
    expect(teacherRows.length > 0 && teacherRows.every((row) => row.student_id === studentA || row.student_id === studentRace)).toBe(true);
    const principalRows = await must(principalA.client.from('school_entry_events').select('school_id'));
    expect(principalRows.length > 0 && principalRows.every((row) => row.school_id === schoolA)).toBe(true);
    const principalBOwnSchool = await must(principalB.client.from('school_entry_events').select('school_id'));
    expect(principalBOwnSchool.length).toBe(0);
    const parentReceipts = await parentA.client.from('device_event_receipts').select('id');
    expect(Boolean(parentReceipts.error)).toBe(true);
    const directCredentials = await teacherA.client.from('student_credentials').select('credential_ref');
    expect(Boolean(directCredentials.error) || (directCredentials.data?.length ?? 0) === 0).toBe(true);
    const directDevices = await teacherA.client.from('school_devices').select('id');
    expect(Boolean(directDevices.error) || (directDevices.data?.length ?? 0) === 0).toBe(true);
    const browserInsert = await parentA.client.from('school_entry_events').insert({ school_id: schoolA, student_id: studentA,
      device_id: deviceA.id, device_event_id: uuid(), event_type: 'check_in', observed_at: new Date().toISOString(),
      device_sequence: 99, sequence_state: 'in_order', timestamp_quality: 'within_tolerance', credential_version: 1 });
    expect(Boolean(browserInsert.error)).toBe(true);
    const anon = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const anonymousEvents = await anon.from('school_entry_events').select('id');
    expect(Boolean(anonymousEvents.error) || (anonymousEvents.data?.length ?? 0) === 0).toBe(true);
    const attendanceCount = await count(admin.from('attendance_records').select('id', { count: 'exact', head: true }).in('student_id', [studentA, studentB, studentRace, studentInactive]));
    expect(attendanceCount).toBe(0);

    // Revoking a signing key immediately disables old tokens for that school.
    await must(principalA.client.rpc('revoke_rfid_capability_key', { p_key_id: issuerKeyId }));
    expect((await send(makeEvent(deviceA.id, assignmentB, 2, refA, capabilityB, 17), deviceA.privateKey)).status).toBe(401);
    const keyRowCount = await count(admin.from('rfid_capability_signing_keys').select('key_id', { count: 'exact', head: true }).eq('school_id', schoolA));
    expect(keyRowCount).toBe(1);
  }, 120_000);
});
