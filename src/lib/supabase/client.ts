import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    // Placeholders allow production compilation before a private .env.local exists.
    // Real authentication/data requests still require the project-specific values.
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'placeholder-anon-key',
  );
}
