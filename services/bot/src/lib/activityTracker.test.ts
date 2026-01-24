import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activityTrackerMiddleware } from './activityTracker.js';
import { userService } from '../services/userService.js';

// Mock userService
vi.mock('../services/userService.js', () => ({
  userService: {
    updateLastActive: vi.fn(),
  },
}));

describe('activityTrackerMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    (userService.updateLastActive as any).mockReturnValue(Effect.succeed({}));
  });

  it('should call updateLastActive for user interaction', async () => {
    const ctx: any = {
      from: { id: 12345 },
    };
    const next = vi.fn();

    await activityTrackerMiddleware(ctx, next);

    expect(next).toHaveBeenCalled();
    expect(userService.updateLastActive).toHaveBeenCalledWith('12345');
  });

  it('should not call updateLastActive for non-user interaction', async () => {
    const ctx: any = {
      from: undefined,
    };
    const next = vi.fn();

    await activityTrackerMiddleware(ctx, next);

    expect(next).toHaveBeenCalled();
    expect(userService.updateLastActive).not.toHaveBeenCalled();
  });

  it('should optimize calls by debouncing updates', async () => {
    const userId = 999;
    const ctx: any = {
      from: { id: userId },
    };
    const next = vi.fn();

    // First call: should update
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);
    expect(userService.updateLastActive).toHaveBeenCalledWith(String(userId));

    // Second call immediately after: should NOT update
    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(1);

    // Advance time by 6 minutes
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);

    await activityTrackerMiddleware(ctx, next);
    expect(userService.updateLastActive).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
