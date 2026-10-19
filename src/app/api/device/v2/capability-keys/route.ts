import { localRfidServer, authenticatedLocalClient } from '../../../../../lib/rfid/v2-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const config = localRfidServer(request);
  if (!config) return Response.json({ error: 'local capability issuer is disabled' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (Number(request.headers.get('content-length') ?? '0') > 1024) return Response.json({ error: 'invalid request' }, { status: 400 });
  const user = authenticatedLocalClient(config, request);
  if (!user) return Response.json({ error: 'authenticated Principal session required' }, { status: 401 });
  const token = request.headers.get('authorization')!.slice('Bearer '.length);
  const { data: auth, error: authError } = await user.auth.getUser(token);
  if (authError || !auth.user) return Response.json({ error: 'authenticated Principal session required' }, { status: 401 });
  const { error } = await user.rpc('register_rfid_capability_key', {
    p_key_id: config.keyId,
    p_public_key: config.publicKeyPem,
  });
  if (error) return Response.json({ error: 'capability key registration failed' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ key_id: config.keyId, registered: true }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
