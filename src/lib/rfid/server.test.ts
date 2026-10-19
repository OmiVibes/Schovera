import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalSignedMessage,
  DeviceRateLimiter,
  isLoopbackHostHeader,
  isLoopbackHttpUrl,
  verifyDeviceSignature,
} from './server';

describe('local RFID server security helpers', () => {
  it('accepts only loopback HTTP service URLs and request hosts', () => {
    expect(isLoopbackHttpUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isLoopbackHttpUrl('https://schovera.vercel.app')).toBe(false);
    expect(isLoopbackHostHeader('127.0.0.1:3000')).toBe(true);
    expect(isLoopbackHostHeader('schovera.vercel.app')).toBe(false);
    expect(isLoopbackHostHeader('localhost:3000@evil.example')).toBe(false);
  });

  it('verifies Ed25519 signatures over method, fixed path, timestamp, nonce and raw-body digest', () => {
    const keys = generateKeyPairSync('ed25519');
    const timestamp = String(Date.now());
    const nonce = '20000000-0000-4000-8000-000000000001';
    const body = '{"schema_version":1}';
    const message = canonicalSignedMessage('POST', timestamp, nonce, body);
    const signature = sign(null, message, keys.privateKey).toString('base64');
    const publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(verifyDeviceSignature(publicPem, signature, 'POST', timestamp, nonce, body)).toBe(true);
    expect(verifyDeviceSignature(publicPem, signature, 'POST', timestamp, nonce, `${body} `)).toBe(false);
    expect(verifyDeviceSignature(publicPem, 'not-base64', 'POST', timestamp, nonce, body)).toBe(false);
  });

  it('applies a bounded per-device local rate window', () => {
    const limiter = new DeviceRateLimiter();
    expect(limiter.allow('device-a', 1_000, 2, 100)).toBe(true);
    expect(limiter.allow('device-a', 1_001, 2, 100)).toBe(true);
    expect(limiter.allow('device-a', 1_002, 2, 100)).toBe(false);
    expect(limiter.allow('device-b', 1_002, 2, 100)).toBe(true);
    expect(limiter.allow('device-a', 1_101, 2, 100)).toBe(true);
  });
});
