import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isLoopbackHostHeader, isLoopbackHttpUrl } from './rfid/server';

export const privateHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export const localError = (status: number, error: string) => Response.json({ error }, { status, headers: privateHeaders });
const windows = new Map<string, { at: number; count: number }>();

export async function authorizeLocalCommunication(request: Request, feature: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.SCHOVERA_TEST_MODE !== 'local' || process.env.SCHOVERA_HOSTED_DEMO === 'true'
    || !isLoopbackHttpUrl(url) || !isLoopbackHostHeader(request.headers.get('host')) || !key)
    return { error: localError(404, 'This local service is not enabled.') };
  if (request.headers.get('origin') !== `http://${request.headers.get('host')}`)
    return { error: localError(403, 'Open this request from the school website.') };
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token || token.length > 12000) return { error: localError(401, 'Please sign in again.') };
  const client = createClient(url!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
  });
  const { data: user, error } = await client.auth.getUser(token);
  if (error || !user.user) return { error: localError(401, 'Please sign in again.') };
  const { data: profile } = await client.from('profiles').select('id,active,role').eq('id', user.user.id).single();
  if (!profile?.active || !['parent','teacher','principal'].includes(profile.role)) return { error: localError(403, 'An active school account is required.') };
  const now = Date.now();
  for (const [id, value] of windows) if (now - value.at > 60000) windows.delete(id);
  const bucket = `${feature}:${user.user.id}`;
  const value = windows.get(bucket) ?? { at: now, count: 0 };
  windows.set(bucket, { ...value, count: value.count + 1 });
  if (value.count >= 20) return { error: localError(429, 'Please wait a minute before trying again.') };
  return { client, actor: user.user.id };
}
