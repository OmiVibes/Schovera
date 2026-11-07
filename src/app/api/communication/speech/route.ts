import { z } from 'zod';
import { authorizeLocalCommunication, localError, privateHeaders } from '@/lib/local-communication-server';
import { readBoundedJson } from '@/lib/rfid/v2-server';
import { koreanVoiceNeedsKoreanText } from '@/lib/parent-speech';
import { synthesizeWindowsSpeech } from '@/lib/windows-speech';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const input = z.object({ text: z.string().trim().min(1).max(4000), language: z.enum(['en','hi','mr','ko']) }).strict();
export async function POST(request: Request) {
  const caller = await authorizeLocalCommunication(request, 'speech');
  if (caller.error) return caller.error;
  const parsed = input.safeParse(await readBoundedJson(request, 24000));
  if (!parsed.success || koreanVoiceNeedsKoreanText(parsed.data?.text ?? '', parsed.data?.language ?? 'auto')) return localError(400, 'Choose the language of the message text.');
  try {
    const { wave } = await synthesizeWindowsSpeech(parsed.data.text, parsed.data.language);
    return new Response(new Uint8Array(wave), { headers: { ...privateHeaders, 'Content-Type': 'audio/wav', 'Content-Length': String(wave.length) } });
  } catch (error) {
    return localError(error instanceof Error && error.message === 'BUSY' ? 429 : 503, 'Local voice is unavailable. Check the installed voice and try again.');
  }
}
