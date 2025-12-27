import { Code, ConnectError } from '@connectrpc/connect';
import { Effect } from 'effect';
import type { Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock userService before importing the module under test
vi.mock('../services/userService.js', () => ({
  userService: {
    createUser: vi.fn(),
  },
}));

// Mock sentry to prevent actual error reporting
vi.mock('../lib/sentry.js', () => ({
  captureEffectError: vi.fn(() => () => Effect.void),
}));

import { userService } from '../services/userService.js';
import { startCommand } from './start.js';

describe('Start Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create user and send welcome message', async () => {
    const mockContext = {
      from: { id: 123456, username: 'testuser', first_name: 'Test', last_name: 'User' },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    vi.mocked(userService.createUser).mockReturnValue(Effect.succeed({ user: {} } as any));

    await startCommand(mockContext);

    expect(userService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '123456',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
      }),
    );
    expect(mockContext.reply).toHaveBeenCalledWith(expect.stringContaining('Welcome to MeetMatch'));
  });

  it('should handle AlreadyExists error gracefully', async () => {
    const mockContext = {
      from: { id: 123456, username: 'testuser', first_name: 'Test' },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    const alreadyExistsError = new ConnectError('User exists', Code.AlreadyExists);
    vi.mocked(userService.createUser).mockReturnValue(Effect.fail(alreadyExistsError));

    await startCommand(mockContext);

    // Should still show welcome message
    expect(mockContext.reply).toHaveBeenCalledWith(expect.stringContaining('Welcome to MeetMatch'));
  });

  it('should handle other errors and still show welcome', async () => {
    const mockContext = {
      from: { id: 123456, username: 'testuser', first_name: 'Test' },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    const internalError = new ConnectError('Internal error', Code.Internal);
    vi.mocked(userService.createUser).mockReturnValue(Effect.fail(internalError));

    await startCommand(mockContext);

    // Should still show welcome message even after error
    expect(mockContext.reply).toHaveBeenCalledWith(expect.stringContaining('Welcome to MeetMatch'));
  });

  it('should return early if ctx.from is undefined', async () => {
    const mockContext = {
      from: undefined,
      reply: vi.fn(),
    } as unknown as Context;

    await startCommand(mockContext);

    expect(userService.createUser).not.toHaveBeenCalled();
    expect(mockContext.reply).not.toHaveBeenCalled();
  });

  it('should handle user without optional fields', async () => {
    const mockContext = {
      from: { id: 789, first_name: 'NoUsername' },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    vi.mocked(userService.createUser).mockReturnValue(Effect.succeed({ user: {} } as any));

    await startCommand(mockContext);

    expect(userService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '789',
        firstName: 'NoUsername',
      }),
    );
    expect(mockContext.reply).toHaveBeenCalled();
  });
});
