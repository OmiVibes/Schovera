'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const roles = ['teacher', 'parent', 'principal'] as const;

export default function ProtectedRoleRoute() {
  const db = useMemo(() => createClient(), []);
  const params = useParams<{ role: string }>();
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'denied'>('checking');

  useEffect(() => {
    async function verify() {
      const { data: { user } } = await db.auth.getUser();
      if (!user) { router.replace('/'); return; }
      const { data } = await db.from('profiles').select('role').eq('id', user.id).single();
      if (data && roles.includes(params.role as (typeof roles)[number]) && data.role === params.role) {
        router.replace('/'); // Root renders only the authenticated, trusted profile dashboard.
        return;
      }
      setState('denied');
    }
    verify();
  }, [db, params.role, router]);

  return <main className="center">{state === 'checking' ? 'Checking access…' : 'You do not have permission to open this area.'}</main>;
}
