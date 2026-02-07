import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock userService
// We need to do this before imports because of hoisting, but since we use dynamic import
// in tests, we need to ensure the mock is established.
vi.mock('../services/userService.js', () => ({
  userService: {
    updateLastActive: vi.fn(() => Effect.succeed({})),
  },
}));

describe('activityTrackerMiddleware', () => {
  let activityTrackerMiddleware: any;
  let userService: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();

    // Re-import to get a fresh instance of the module (and fresh cache)
    const trackerModule = await import('./activityTracker.js');
    activityTrackerMiddleware = trackerModule.activityTrackerMiddleware;

    // Re-import the mock to check calls
    const userModule = await import('../services/userService.js');
    userService = userModule.userService;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces updates: calls once per user within 5 minutes', async () => {
    const ctx = { from: { id: 12345 } } as any;
    const next = vi.fn();

    // 1st call
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);
    expect(userService.updateLastActive).toHaveBeenCalledWith('12345');

    // 2nd call immediately
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1); // Still 1

    // Advance time by 4 minutes
    vi.advanceTimersByTime(4 * 60 * 1000);
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1); // Still 1
  });

  it('updates again after 5 minutes', async () => {
    const ctx = { from: { id: 12345 } } as any;
    const next = vi.fn();

    // 1st call
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);

    // Advance time by 5 minutes + 1 second
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

    // 2nd call
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(2);
  });

  it('tracks different users independently', async () => {
    const ctx1 = { from: { id: 111 } } as any;
    const ctx2 = { from: { id: 222 } } as any;
    const next = vi.fn();

    await activityTrackerMiddleware(ctx1, next);
    expect(userService.updateLastActive).toHaveBeenCalledWith('111');
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);

    await activityTrackerMiddleware(ctx2, next);
    expect(userService.updateLastActive).toHaveBeenCalledWith('222');
    expect(userService.updateLastActive).toHaveBeenCalledTimes(2);
  });

  it('clears cache when limit is exceeded', async () => {
    const next = vi.fn();

    // Fill cache to limit (10000)
    for (let i = 0; i < 10000; i++) {
      await activityTrackerMiddleware({ from: { id: `user_${i}` } } as any, next);
    }

    // Each call should trigger update initially
    expect(userService.updateLastActive).toHaveBeenCalledTimes(10000);

    // Add one more (limit exceeded -> clear -> add new)
    await activityTrackerMiddleware({ from: { id: 'user_10000' } } as any, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(10001);

    // Now cache is cleared, except for user_10000.
    // So user_0 (from start) should be updated again if called now (even if < 5 mins passed, because cache was cleared)
    await activityTrackerMiddleware({ from: { id: 'user_0' } } as any, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(10002);
  });
});
