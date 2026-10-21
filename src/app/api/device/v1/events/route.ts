import { isLoopbackHostHeader, isLoopbackHttpUrl } from '../../../../../lib/rfid/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const localOnly = process.env.SCHOVERA_HOSTED_DEMO !== 'true' && process.env.SCHOVERA_RFID_API_MODE === 'local'
    && process.env.SCHOVERA_TEST_MODE === 'local'
    && isLoopbackHttpUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
    && isLoopbackHostHeader(request.headers.get('host'));
  if (!localOnly) return Response.json({ error: 'local device ingestion is disabled' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ error: 'event v1 is retired; submit an assignment-bound v2 event' }, {
    status: 410,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
