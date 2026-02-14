import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userService } from '../services/userService.js';
import {
  activityTrackerMiddleware,
  DEBOUNCE_WINDOW_MS,
  lastActiveCache,
} from './activityTracker.js';

// Mock userService
vi.mock('../services/userService.js', () => ({
  userService: {
    updateLastActive: vi.fn(() => Effect.succeed({})),
  },
}));

describe('activityTrackerMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    lastActiveCache.clear(); // Reset cache
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should only call updateLastActive once per window (optimized behavior)', async () => {
    const ctx: any = {
      from: { id: 12345 },
    };
    const next = vi.fn();

    // First call
    await activityTrackerMiddleware(ctx, next);

    // Wait for promise
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    // Second call immediately
    await activityTrackerMiddleware(ctx, next);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    // Expect ONLY 1 call
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);
    expect(userService.updateLastActive).toHaveBeenCalledWith('12345');
  });

  it('should call updateLastActive again after debounce window expires', async () => {
    const ctx: any = {
      from: { id: 12345 },
    };
    const next = vi.fn();

    // First call
    await activityTrackerMiddleware(ctx, next);
    await Promise.resolve();

    // Advance time past the window
    await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW_MS + 1000);

    // Second call
    await activityTrackerMiddleware(ctx, next);
    await Promise.resolve();

    // Expect 2 calls total
    expect(userService.updateLastActive).toHaveBeenCalledTimes(2);
  });
});
