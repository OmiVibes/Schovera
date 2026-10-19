export const SCHOOL_ENTRY_POLL_INTERVAL_MS = 20_000;
export const SCHOOL_ENTRY_MAX_RETRY_MS = 120_000;

type BoundedPollOptions = {
  poll: () => Promise<boolean | void>;
  isActive: () => boolean;
  intervalMs?: number;
  maxRetryMs?: number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
};

/** A one-shot poll loop: each next attempt is scheduled only after the prior one settles. */
export function createBoundedPoller({
  poll,
  isActive,
  intervalMs = SCHOOL_ENTRY_POLL_INTERVAL_MS,
  maxRetryMs = SCHOOL_ENTRY_MAX_RETRY_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
}: BoundedPollOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;
  let wakeAfterRun = false;
  let failures = 0;

  const clear = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };

  const nextDelay = () => Math.min(maxRetryMs, intervalMs * (2 ** Math.min(failures, 10)));

  const scheduleNext = (delay: number) => {
    if (stopped || !isActive() || timer !== undefined) return;
    timer = schedule(() => { void tick(); }, delay);
  };

  const tick = async () => {
    timer = undefined;
    if (stopped || !isActive() || running) return;
    running = true;
    try {
      if (await poll() === false) failures += 1;
      else failures = 0;
    } catch {
      failures += 1;
    } finally {
      running = false;
      const delay = wakeAfterRun ? 0 : nextDelay();
      wakeAfterRun = false;
      scheduleNext(delay);
    }
  };

  return {
    start() { scheduleNext(intervalMs); },
    /** Wake immediately after a visible/online transition; still enforces one request at a time. */
    wake() {
      clear();
      if (running) { wakeAfterRun = true; return; }
      scheduleNext(0);
    },
    /** Pause without discarding the retry history. */
    pause: clear,
    stop() {
      stopped = true;
      clear();
    },
  };
}
