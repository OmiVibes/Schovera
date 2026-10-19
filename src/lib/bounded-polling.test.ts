import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoundedPoller } from './bounded-polling';

afterEach(() => vi.useRealTimers());

describe('bounded school-entry polling', () => {
  it('waits for the configured interval and schedules the next poll after completion', async () => {
    vi.useFakeTimers();
    const poll = vi.fn(async () => true);
    const loop = createBoundedPoller({ poll, isActive: () => true, intervalMs: 20_000 });
    loop.start();
    await vi.advanceTimersByTimeAsync(19_999);
    expect(poll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(poll).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('does not run while hidden or offline and wakes when active again', async () => {
    vi.useFakeTimers();
    let active = true;
    const poll = vi.fn(async () => true);
    const loop = createBoundedPoller({ poll, isActive: () => active, intervalMs: 1_000 });
    loop.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(poll).toHaveBeenCalledTimes(1);
    active = false;
    loop.pause();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll).toHaveBeenCalledTimes(1);
    active = true;
    loop.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(2);
    loop.stop();
  });

  it('backs off transient errors and caps the retry delay', async () => {
    vi.useFakeTimers();
    const poll = vi.fn().mockResolvedValue(false);
    const loop = createBoundedPoller({ poll, isActive: () => true, intervalMs: 1_000, maxRetryMs: 3_000 });
    loop.start();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(poll).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it('does not start another request while one is unresolved and stops on unmount', async () => {
    vi.useFakeTimers();
    let resolvePoll: ((value: boolean) => void) | undefined;
    const poll = vi.fn(() => new Promise<boolean>((resolve) => { resolvePoll = resolve; }));
    const loop = createBoundedPoller({ poll, isActive: () => true, intervalMs: 1_000 });
    loop.start();
    await vi.advanceTimersByTimeAsync(1_000);
    loop.wake();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll).toHaveBeenCalledTimes(1);
    resolvePoll?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(2);
    resolvePoll?.(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(poll).toHaveBeenCalledTimes(3);
    loop.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(poll).toHaveBeenCalledTimes(3);
  });
});
