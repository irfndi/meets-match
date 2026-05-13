import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userService } from '../services/userService.js';
import {
  activityTrackerMiddleware,
  DEBOUNCE_WINDOW_MS,
  lastActiveCache,
  MAX_CACHE_SIZE,
} from './activityTracker.js';

// Mock userService
vi.mock('../services/userService.js', () => ({
  userService: {
    updateLastActive: vi.fn(() => Effect.succeed({ success: true })),
  },
}));

describe('activityTrackerMiddleware', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    lastActiveCache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call updateLastActive on first interaction and debounce subsequent ones', async () => {
    const next = vi.fn();
    const ctx = {
      from: { id: 12345 },
    } as any;

    // First call
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);
    expect(userService.updateLastActive).toHaveBeenCalledWith('12345');
    expect(lastActiveCache.get('12345')).toBeDefined();

    // Second call immediately after (should be throttled)
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);
  });

  it('should call updateLastActive again after debounce window expires', async () => {
    const next = vi.fn();
    const ctx = {
      from: { id: 12345 },
    } as any;

    // First call
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);

    // Advance time by 5 minutes + 1 second
    vi.advanceTimersByTime(DEBOUNCE_WINDOW_MS + 1000);

    // Call again (should be allowed)
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(2);
  });

  it('should track different users independently', async () => {
    const next = vi.fn();
    const ctx1 = { from: { id: 12345 } } as any;
    const ctx2 = { from: { id: 67890 } } as any;

    await activityTrackerMiddleware(ctx1, next);
    expect(userService.updateLastActive).toHaveBeenCalledWith('12345');

    await activityTrackerMiddleware(ctx2, next);
    expect(userService.updateLastActive).toHaveBeenCalledWith('67890');

    expect(userService.updateLastActive).toHaveBeenCalledTimes(2);
  });

  it('should clear cache when size limit is reached', async () => {
    const next = vi.fn();

    // Fill the cache up to the limit
    for (let i = 0; i < MAX_CACHE_SIZE; i++) {
      lastActiveCache.set(`user_${i}`, Date.now());
    }

    expect(lastActiveCache.size).toBe(MAX_CACHE_SIZE);

    // Next call should trigger clear and add new user
    const ctx = { from: { id: 999999 } } as any;
    await activityTrackerMiddleware(ctx, next);

    // Cache should be cleared (size becomes 1 because we just added the new user)
    expect(lastActiveCache.size).toBe(1);
    expect(lastActiveCache.has('999999')).toBe(true);
    expect(userService.updateLastActive).toHaveBeenCalledWith('999999');
  });
});
