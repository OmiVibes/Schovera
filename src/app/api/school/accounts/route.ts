import 'server-only';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { accountInput, accountPayload } from '@/lib/account-management';
import { isLoopbackHostHeader, isLoopbackHttpUrl } from '@/lib/rfid/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const respond = (status: number, error: string) =>
  Response.json({ error }, { status, headers });
const windows = new Map<string, { at: number; count: number }>();

async function authorize(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    process.env.SCHOVERA_ACCOUNT_MANAGEMENT_MODE !== 'local' ||
    process.env.SCHOVERA_TEST_MODE !== 'local' ||
    process.env.SCHOVERA_HOSTED_DEMO === 'true' ||
    !isLoopbackHttpUrl(url) ||
    !isLoopbackHostHeader(request.headers.get('host')) ||
    !key
  )
    return {
      error: respond(404, 'Account management is not enabled on this server.'),
    };
  if (
    request.method === 'POST' &&
    request.headers.get('origin') !== `http://${request.headers.get('host')}`
  )
    return { error: respond(403, 'Open this form from the school website.') };
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token || token.length > 12000)
    return { error: respond(401, 'Please sign in again.') };
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  };
  const caller = createClient(
    url!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    options,
  );
  const { data, error } = await caller.auth.getUser(token);
  if (error || !data.user)
    return { error: respond(401, 'Please sign in again.') };
  // Decode only AFTER Auth verifies the token. Database checks that the session still exists.
  let session: string;
  try {
    session = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    ).session_id;
  } catch {
    return { error: respond(401, 'Please sign in again.') };
  }
  if (!zUuid(session)) return { error: respond(401, 'Please sign in again.') };
  const admin = createClient(url!, key, options);
  const authorized = await admin.rpc('school_account_manager', {
    p_actor: data.user.id,
    p_session: session,
  });
  if (authorized.error || !authorized.data)
    return {
      error: respond(403, 'Only an active school Principal can manage users.'),
    };
  const bucket = `${data.user.id}:${request.method}`;
  const now = Date.now();
  for (const [id, value] of windows)
    if (now - value.at > 60000) windows.delete(id);
  const value = windows.get(bucket) ?? { at: now, count: 0 };
  value.count++;
  windows.set(bucket, value);
  if (value.count > (request.method === 'POST' ? 20 : 60))
    return {
      error: respond(429, 'Too many requests. Wait one minute and retry.'),
    };
  return {
    admin,
    actor: data.user.id,
    session,
    school: authorized.data as string,
  };
}
function zUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  );
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request);
    if (auth.error) return auth.error;
    const { admin, school } = auth;
    const [users, classes, students] = await Promise.all([
      admin
        .from('profiles')
        .select('id,full_name,email,role,active', { count: 'exact' })
        .eq('school_id', school)
        .order('full_name')
        .limit(1000),
      admin
        .from('classes')
        .select('id,grade,division', { count: 'exact' })
        .eq('school_id', school)
        .eq('active', true)
        .order('grade')
        .limit(1000),
      admin
        .from('students')
        .select('id,full_name,roll_number,class_id', { count: 'exact' })
        .eq('school_id', school)
        .eq('active', true)
        .order('full_name')
        .limit(1000),
    ]);
    if (
      [users, classes, students].some(
        (result) => result.error || (result.count ?? 0) > 1000,
      )
    )
      return respond(
        503,
        'The user list could not be loaded completely. Please contact your administrator.',
      );
    return Response.json(
      { users: users.data, classes: classes.data, students: students.data },
      { headers },
    );
  } catch {
    return respond(
      503,
      'Account management is temporarily unavailable. Please retry.',
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);
    if (auth.error) return auth.error;
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return respond(415, 'Send the account form as JSON.');
    const reader = request.body?.getReader();
    if (!reader) return respond(400, 'Complete the account form.');
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 16384) {
        await reader.cancel();
        return respond(413, 'Account form is too large.');
      }
      chunks.push(part.value);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return respond(400, 'Invalid account form.');
    }
    const parsed = accountInput.safeParse(raw);
    if (!parsed.success)
      return respond(
        400,
        'Check the name, email, password and role relationships. Password needs 12 characters with uppercase, lowercase, a number and a symbol.',
      );
    const input = parsed.data;
    const { admin, school, actor, session } = auth;
    // Validate school relationships before creating any Auth account; SQL rechecks atomically.
    for (const [table, ids] of [
      ['classes', input.classIds],
      ['students', input.childIds],
    ] as const) {
      if (!ids.length) continue;
      const match = await admin
        .from(table)
        .select('id')
        .eq('school_id', school)
        .eq('active', true)
        .in('id', ids);
      if (match.error || match.data?.length !== ids.length)
        return respond(
          400,
          'Choose only active children or classes in your school.',
        );
    }
    const hash = createHash('sha256')
      .update(JSON.stringify(accountPayload(input)))
      .digest('hex');
    const hex = createHash('sha256')
      .update(`school-account:${actor}:${input.requestId}`)
      .digest('hex');
    const userId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    const existing = await admin.auth.admin.getUserById(userId);
    if (existing.error && existing.error.status !== 404)
      return respond(503, 'Could not check this request. Retry the same form.');
    let user = existing.data.user;
    let reused = Boolean(user);
    if (!user) {
      const created = await admin.auth.admin.createUser({
        id: userId,
        email: input.email,
        password: input.password,
        email_confirm: true,
        app_metadata: {
          provisioned_by: actor,
          provisioning_request: input.requestId,
          provisioning_hash: hash,
        },
      });
      user = created.data.user;
      // A concurrent identical request may have won. Never reset its password.
      if (created.error) {
        const retry = await admin.auth.admin.getUserById(userId);
        user = retry.data.user;
        reused = Boolean(user);
        if (!user)
          return respond(
            created.error.status === 422 ? 409 : 503,
            'Account could not be created. The email may already be in use; no existing password was changed. Retry this form if the connection was interrupted.',
          );
      }
    }
    if (
      !user ||
      user.app_metadata.provisioned_by !== actor ||
      user.app_metadata.provisioning_hash !== hash ||
      user.app_metadata.provisioning_request !== input.requestId ||
      user.email?.toLowerCase() !== input.email
    )
      return respond(
        409,
        'This request belongs to a different account form. Existing credentials were not changed.',
      );
    const finished = await admin.rpc('finish_school_account', {
      p_actor: actor,
      p_session: session,
      p_user: userId,
      p_request: input.requestId,
      p_hash: hash,
      p_name: input.name,
      p_email: input.email,
      p_role: input.role,
      p_classes: input.classIds,
      p_children: input.childIds,
      p_confirm_principal: input.confirmPrincipal,
    });
    if (finished.error)
      return respond(
        503,
        'Account setup is not complete. Keep this form and retry; do not create another request.',
      );
    return Response.json(
      { id: userId, created: true, passwordUnchanged: reused },
      { status: 201, headers },
    );
  } catch {
    return respond(
      503,
      'Connection interrupted. Retry the same account form; passwords are never reset by a retry.',
    );
  }
}
