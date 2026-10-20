import { z } from 'zod';
import { fallbackClients, localFallbackEnabled } from '@/lib/fallback-server';
import { fakeProvider, scenarios, type SimulationInput } from '@/lib/fallback-provider';
import { readBoundedJson } from '@/lib/rfid/v2-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const source = z.object({ kind: z.enum(['update', 'announcement']), source_id: z.uuid() }).strict();
const operation = z.discriminatedUnion('op', [
  z.object({ op: z.literal('preferences'), sms: z.boolean(), ivr: z.boolean(), language: z.enum(['en', 'hi', 'mr']) }).strict(),
  source.extend({ op: z.literal('queue') }).strict(),
  z.object({ op: z.literal('dispatch'), delivery_id: z.uuid(), scenario: z.enum(scenarios) }).strict(),
]);
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  if (!localFallbackEnabled(request)) return reply({ error: 'Simulator unavailable' }, 404);
  try {
    const clients = await fallbackClients(request);
    if (!clients) return reply({ error: 'Sign in required' }, 401);
    const params = new URL(request.url).searchParams;
    if (!params.size) {
      const { data, error } = await clients.auth.from('fallback_simulation_preferences').select('channel,opted_in,preferred_language').order('channel');
      if (error) throw error;
      return reply({ simulated: true, preferences: data });
    }
    const parsed = source.parse(Object.fromEntries(params));
    const { data, error } = await clients.service.rpc('review_fallback_simulation', { p_actor: clients.actor, p_kind: parsed.kind, p_source_id: parsed.source_id });
    if (error) throw error;
    return reply(data);
  } catch { return reply({ error: 'Cannot review this simulation' }, 403); }
}

export async function POST(request: Request) {
  if (!localFallbackEnabled(request)) return reply({ error: 'Simulator unavailable' }, 404);
  const parsed = operation.safeParse(await readBoundedJson(request, 8192));
  if (!parsed.success) return reply({ error: 'Invalid simulation request' }, 400);
  try {
    const clients = await fallbackClients(request);
    if (!clients) return reply({ error: 'Sign in required' }, 401);
    const input = parsed.data;
    if (input.op === 'preferences') {
      const { error } = await clients.service.rpc('set_fallback_simulation_preferences', { p_actor: clients.actor, p_sms: input.sms, p_ivr: input.ivr, p_language: input.language });
      if (error) throw error;
      return reply({ simulated: true, saved: true });
    }
    if (input.op === 'queue') {
      const { data, error } = await clients.service.rpc('queue_fallback_simulation', { p_actor: clients.actor, p_kind: input.kind, p_source_id: input.source_id });
      if (error) throw error;
      return reply({ simulated: true, queued: data });
    }
    const args = { p_actor: clients.actor, p_delivery_id: input.delivery_id };
    const { data: prepared, error } = await clients.service.rpc('step_fallback_simulation', { ...args, p_phase: 'prepare' });
    if (error) throw error;
    if (!prepared.ready) return reply({ simulated: true, status: prepared.status });
    const result = fakeProvider.submit(prepared as SimulationInput, input.scenario);
    const finished = await clients.service.rpc('step_fallback_simulation', { ...args, p_phase: 'finish', p_expected_updated_at: prepared.updated_at, p_result: result });
    if (finished.error) throw finished.error;
    return reply(finished.data);
  } catch { return reply({ error: 'Simulation denied or unavailable' }, 403); }
}
