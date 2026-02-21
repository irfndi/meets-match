import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('activityTrackerMiddleware', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces last_active updates', async () => {
    // Mock userService
    const updateLastActiveMock = vi.fn(() => Effect.succeed({} as any));
    vi.doMock('../services/userService.js', () => ({
      userService: {
        updateLastActive: updateLastActiveMock,
      },
    }));

    // Import middleware dynamically to get fresh state
    const { activityTrackerMiddleware, DEBOUNCE_WINDOW_MS } = await import('./activityTracker.js');

    const ctx = {
      from: { id: 123 },
    } as any;
    const next = vi.fn();

    // First call
    await activityTrackerMiddleware(ctx, next);
    // Ensure any promise created by Effect.runPromise has a chance to start
    await Promise.resolve();

    expect(updateLastActiveMock).toHaveBeenCalledTimes(1);

    // Second call immediately (within debounce window)
    await activityTrackerMiddleware(ctx, next);
    await Promise.resolve();

    // Should NOT call service again
    expect(updateLastActiveMock).toHaveBeenCalledTimes(1);

    // Advance time beyond debounce window
    await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW_MS + 100);

    // Third call (after debounce window)
    await activityTrackerMiddleware(ctx, next);
    await Promise.resolve();

    // Should call service again
    expect(updateLastActiveMock).toHaveBeenCalledTimes(2);
  });

  it('clears cache when max size is exceeded', async () => {
    // Mock userService
    const updateLastActiveMock = vi.fn(() => Effect.succeed({} as any));
    vi.doMock('../services/userService.js', () => ({
      userService: {
        updateLastActive: updateLastActiveMock,
      },
    }));

    const { activityTrackerMiddleware, MAX_CACHE_SIZE, lastActiveCache } = await import(
      './activityTracker.js'
    );

    const next = vi.fn();

    // Fill the cache up to MAX_CACHE_SIZE manually
    for (let i = 0; i < MAX_CACHE_SIZE; i++) {
      lastActiveCache.set(String(i), Date.now());
    }

    expect(lastActiveCache.size).toBe(MAX_CACHE_SIZE);

    // Now make a request from a NEW user
    const newUserId = String(MAX_CACHE_SIZE + 1);
    const ctx = {
      from: { id: newUserId },
    } as any;

    await activityTrackerMiddleware(ctx, next);
    await Promise.resolve();

    // Cache should have been cleared and then the new user added
    // So size should be 1 (just the new user)
    expect(lastActiveCache.size).toBe(1);
    expect(lastActiveCache.has(newUserId)).toBe(true);
    expect(updateLastActiveMock).toHaveBeenCalledTimes(1);
  });
});
