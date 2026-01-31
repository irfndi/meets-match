import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userService } from '../services/userService.js';
import { activityTrackerMiddleware } from './activityTracker.js';

// Mock userService
vi.mock('../services/userService.js', () => ({
  userService: {
    updateLastActive: vi.fn(() => Effect.void),
  },
}));

describe('activityTrackerMiddleware', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces last active updates', async () => {
    const userId = '12345';
    const ctx = {
      from: { id: parseInt(userId, 10) },
    } as any;
    const next = vi.fn();

    // First call - should trigger update
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);
    expect(userService.updateLastActive).toHaveBeenCalledWith(userId);

    // Second call immediately after - should SKIP update
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);

    // Advance time by 4 minutes (still within window)
    vi.advanceTimersByTime(4 * 60 * 1000);
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);

    // Advance time by another 1 minute + 1ms (total > 5 mins)
    vi.advanceTimersByTime(1 * 60 * 1000 + 1);
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(2);
  });

  it('tracks different users separately', async () => {
    const user1 = '111';
    const user2 = '222';
    const next = vi.fn();

    // User 1 interacts
    await activityTrackerMiddleware({ from: { id: 111 } } as any, next);
    expect(userService.updateLastActive).toHaveBeenCalledWith(user1);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);

    // User 2 interacts
    await activityTrackerMiddleware({ from: { id: 222 } } as any, next);
    expect(userService.updateLastActive).toHaveBeenCalledWith(user2);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(2);

    // User 1 interacts again (debounced)
    await activityTrackerMiddleware({ from: { id: 111 } } as any, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(2);
  });
});
