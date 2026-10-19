import { signAssignmentCapability } from '../../../../../../scripts/rfid-simulator/event-v2';
import { authenticatedLocalClient, localRfidServer, readBoundedJson } from '../../../../../lib/rfid/v2-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const config = localRfidServer(request);
  if (!config) return Response.json({ error: 'local capability issuer is disabled' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
    || Number(request.headers.get('content-length') ?? '0') > 1024) return Response.json({ error: 'invalid request' }, { status: 400 });
  const user = authenticatedLocalClient(config, request);
  if (!user) return Response.json({ error: 'authenticated Principal session required' }, { status: 401 });
  const token = request.headers.get('authorization')!.slice('Bearer '.length);
  const { data: auth, error: authError } = await user.auth.getUser(token);
  if (authError || !auth.user) return Response.json({ error: 'authenticated Principal session required' }, { status: 401 });
  const input = await readBoundedJson(request, 1024);
  if (input === null) return Response.json({ error: 'invalid request' }, { status: 400 });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return Response.json({ error: 'invalid request' }, { status: 400 });
  const body = input as Record<string, unknown>;
  if (Object.keys(body).sort().join(',') !== 'assignment_id,device_id'
    || typeof body.assignment_id !== 'string' || !UUID.test(body.assignment_id)
    || typeof body.device_id !== 'string' || !UUID.test(body.device_id)) return Response.json({ error: 'invalid request' }, { status: 400 });
  const { data: claims, error } = await user.rpc('issue_rfid_assignment_capability_claims', {
    p_assignment_id: body.assignment_id,
    p_device_id: body.device_id,
    p_key_id: config.keyId,
    p_public_key: config.publicKeyPem,
  });
  if (error || !claims) return Response.json({ error: 'assignment capability is not available' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const capability = signAssignmentCapability(claims, config.privateKey);
  return Response.json({ capability }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
