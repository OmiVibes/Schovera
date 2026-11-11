'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parsePrincipalCommunication, type PrincipalCommunicationPage } from './principal-communication';

export function usePrincipalCommunication(client: SupabaseClient, schoolId: string, filter: 'all' | 'awaiting', limit: number) {
  const context = `${schoolId}:${filter}:${limit}`;
  const currentContext = useRef(context);
  const generation = useRef(0), mounted = useRef(false), appending = useRef(false);
  const [snapshot, setSnapshot] = useState<{context: string; value: PrincipalCommunicationPage} | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false);
  const data = snapshot?.context === context ? snapshot.value : null;
  const request = useCallback(async (previous: PrincipalCommunicationPage | null = null) => {
    if (previous && appending.current) return;
    const version = ++generation.current;
    appending.current = Boolean(previous); setLoadingMore(Boolean(previous));
    setLoading(!previous); setError('');
    const cursor = previous?.updates.at(-1);
    try {
      const result = await client.rpc('principal_communication_page', {
        p_filter: filter, p_limit: limit,
        p_before_sent_at: cursor?.sent_at ?? null, p_before_id: cursor?.id ?? null,
      });
      if (result.error) throw new Error('Communication read failed');
      const value = parsePrincipalCommunication(result.data, schoolId);
      if (mounted.current && version === generation.current && context === currentContext.current) {
        if (previous) {
          const seen = new Set(previous.updates.map(u => u.id));
          value.updates = [...previous.updates, ...value.updates.filter(u => !seen.has(u.id))];
        }
        setSnapshot({context, value});
      }
    } catch {
      if (mounted.current && version === generation.current && context === currentContext.current)
        setError('Recent communication could not be loaded.');
    } finally {
      if (mounted.current && version === generation.current && context === currentContext.current) {
        appending.current = false; setLoading(false); setLoadingMore(false);
      }
    }
  }, [client, context, schoolId, filter, limit]);
  const refresh = useCallback(() => request(), [request]);
  const invalidate = useCallback(() => {
    mounted.current = false; generation.current++; appending.current = false;
  }, []);
  useEffect(() => {
    mounted.current = true; currentContext.current = context;
    void Promise.resolve().then(() => { if (mounted.current) void refresh(); });
    return invalidate;
  }, [context, refresh, invalidate]);
  return { data, error, loading: loading || (!data && !error), loadingMore, refresh,
    loadMore: () => data?.has_more ? request(data) : Promise.resolve() };
}
