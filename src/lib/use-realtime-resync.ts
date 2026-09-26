'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type RealtimeStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'
  | string;

/**
 * Realtime makes Schovera prompt; persisted, authorized queries remain the
 * source of truth. This hook schedules at most one reconciliation cycle when
 * a browser comes back online or a channel re-establishes after interruption.
 */
export function useRealtimeResync(refresh: () => Promise<void> | void) {
  const refreshRef = useRef(refresh);
  const mountedRef = useRef(false);
  const hasSubscribedRef = useRef(false);
  const interruptedRef = useRef(false);
  const scheduledRef = useRef(false);
  const inFlightRef = useRef(false);
  const repeatRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const recoveryTimersRef = useRef<number[]>([]);
  const recoveryWindowRef = useRef(false);
  const [connectionState, setConnectionState] = useState<
    'online' | 'reconnecting' | 'offline'
  >('online');

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const reconcile = useCallback(() => {
    if (!mountedRef.current) return;
    if (inFlightRef.current) {
      repeatRef.current = true;
      return;
    }
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    timerRef.current = window.setTimeout(async () => {
      scheduledRef.current = false;
      if (!mountedRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await refreshRef.current();
        if (mountedRef.current) setConnectionState('online');
      } finally {
        inFlightRef.current = false;
        if (repeatRef.current) {
          repeatRef.current = false;
          reconcile();
        }
      }
    }, 80);
  }, [inFlightRef, mountedRef, refreshRef, repeatRef, scheduledRef, timerRef]);

  const scheduleRecovery = useCallback(() => {
    if (!mountedRef.current || recoveryWindowRef.current) return;
    recoveryWindowRef.current = true;
    // The browser's online event can precede a usable authenticated socket.
    // These bounded, coalesced retries cover connection establishment only;
    // each cycle still reads the current authorized persisted state.
    reconcile();
    for (const delay of [650, 1800, 4500]) {
      recoveryTimersRef.current.push(
        window.setTimeout(() => reconcile(), delay),
      );
    }
    recoveryTimersRef.current.push(
      window.setTimeout(() => {
        recoveryWindowRef.current = false;
        recoveryTimersRef.current = [];
      }, 5000),
    );
  }, [reconcile, recoveryTimersRef, recoveryWindowRef, mountedRef]);

  const onChannelStatus = useCallback(
    (status: RealtimeStatus) => {
      if (status === 'SUBSCRIBED') {
        const shouldReconcile = hasSubscribedRef.current || interruptedRef.current;
        hasSubscribedRef.current = true;
        interruptedRef.current = false;
        if (mountedRef.current) setConnectionState('online');
        if (shouldReconcile) scheduleRecovery();
        return;
      }
      if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        interruptedRef.current = true;
        if (mountedRef.current) setConnectionState('reconnecting');
      }
    },
    [hasSubscribedRef, interruptedRef, mountedRef, scheduleRecovery],
  );

  useEffect(() => {
    mountedRef.current = true;
    const offline = () => {
      interruptedRef.current = true;
      setConnectionState('offline');
    };
    const online = () => {
      interruptedRef.current = true;
      setConnectionState('reconnecting');
      scheduleRecovery();
    };
    const visible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) reconcile();
    };
    const focused = () => {
      if (navigator.onLine) reconcile();
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('focus', focused);
    document.addEventListener('visibilitychange', visible);
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
      recoveryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('focus', focused);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [interruptedRef, reconcile, scheduleRecovery]);

  return { onChannelStatus, connectionState, reconcile };
}
