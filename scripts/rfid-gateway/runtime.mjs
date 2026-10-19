import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openGatewayDatabase } from './storage.mjs';
import { hashReaderKey } from './ingress.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const gatewayDirectory = path.join(repoRoot, '.local', 'schovera-rfid-gateway');
export const gatewayDatabasePath = path.join(gatewayDirectory, 'gateway.sqlite');
const identityPath = path.join(gatewayDirectory, 'synthetic-reader.json');

export function openRuntime() {
  mkdirSync(gatewayDirectory, { recursive: true });
  if (!existsSync(identityPath)) {
    const identity = {
      reader_id: randomUUID(),
      device_id: 'device-synth-laptop-gateway',
      reader_key: randomBytes(32).toString('hex'),
    };
    writeFileSync(identityPath, `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    try { chmodSync(identityPath, 0o600); } catch { /* Windows ACLs are inherited from the user profile. */ }
  }
  const identity = JSON.parse(readFileSync(identityPath, 'utf8'));
  if (typeof identity.reader_id !== 'string' || typeof identity.device_id !== 'string'
      || typeof identity.reader_key !== 'string' || !/^[a-f0-9]{64}$/.test(identity.reader_key)) {
    throw new Error('synthetic reader identity file is invalid; preserve it for review');
  }
  const store = openGatewayDatabase(gatewayDatabasePath);
  const registered = store.getReader(identity.reader_id);
  if (registered) {
    if (registered.device_id !== identity.device_id || registered.token_sha256 !== hashReaderKey(identity.reader_key)) {
      store.close();
      throw new Error('synthetic reader identity does not match the local database; do not auto-rotate credentials');
    }
  } else {
    store.registerReader({ readerId: identity.reader_id, deviceId: identity.device_id,
      tokenHash: hashReaderKey(identity.reader_key), now: new Date().toISOString() });
  }
  return { store, identity };
}
