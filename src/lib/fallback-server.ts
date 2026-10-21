import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { isLoopbackHostHeader, isLoopbackHttpUrl } from './rfid/server';

export function localFallbackEnabled(request: Request, env: Record<string, string | undefined> = process.env): boolean {
  return env.SCHOVERA_HOSTED_DEMO !== 'true' && env.SCHOVERA_FALLBACK_MODE === 'local' && env.SCHOVERA_TEST_MODE === 'local'
    && isLoopbackHttpUrl(env.NEXT_PUBLIC_SUPABASE_URL) && isLoopbackHttpUrl(request.url)
    && isLoopbackHostHeader(request.headers.get('host'))
    && Boolean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function fallbackClients(request: Request) {
  if (!localFallbackEnabled(request)) return null;
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const auth = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return { actor: data.user.id, auth, service };
}
