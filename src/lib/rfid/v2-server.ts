import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { isLoopbackHostHeader, isLoopbackHttpUrl } from './server';

export type LocalRfidServer = {
  url: string;
  publishableKey: string;
  service: SupabaseClient;
  keyId: string;
  privateKey: ReturnType<typeof createPrivateKey>;
  publicKeyPem: string;
};

export function localRfidServer(request: Request): LocalRfidServer | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyId = process.env.SCHOVERA_RFID_CAPABILITY_KEY_ID;
  const privatePem = process.env.SCHOVERA_RFID_CAPABILITY_PRIVATE_KEY;
  if (process.env.SCHOVERA_RFID_API_MODE !== 'local' || process.env.SCHOVERA_TEST_MODE !== 'local'
    || !isLoopbackHttpUrl(url) || !isLoopbackHostHeader(request.headers.get('host'))
    || !publishableKey || !serviceKey || !keyId || !privatePem) return null;
  try {
    const privateKey = createPrivateKey(privatePem);
    if (privateKey.asymmetricKeyType !== 'ed25519') return null;
    const publicKeyPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
    const service = createClient(url!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    return { url: url!, publishableKey, service, keyId, privateKey, publicKeyPem };
  } catch { return null; }
}

export function authenticatedLocalClient(config: LocalRfidServer, request: Request) {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
  if (!match) return null;
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
  });
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown;
  } catch { return null; }
  finally { reader.releaseLock(); }
}
