import { describe, it, expect, vi, beforeEach } from 'vitest';
import { profileCommand } from './profile.js';
import type { Context } from 'grammy';
import { Effect } from 'effect';

// Mock the userService to return Effect values
vi.mock('../services/userService.js', () => ({
  userService: {
    getUser: vi.fn(),
  },
}));

import { userService } from '../services/userService.js';

describe('Profile Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reply with profile info when user exists', async () => {
    const mockContext = {
      from: { id: 12345 },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    const mockUser = {
      firstName: 'John',
      lastName: 'Doe',
      username: 'johndoe',
      age: 25,
      gender: 'Male',
      bio: 'Hello world',
      location: { city: 'New York', country: 'USA' },
    };

    vi.mocked(userService.getUser).mockReturnValue(Effect.succeed({ user: mockUser }));

    await profileCommand(mockContext);

    expect(userService.getUser).toHaveBeenCalledWith('12345');
    expect(mockContext.reply).toHaveBeenCalledWith(
      expect.stringContaining('Name: John Doe'),
      expect.any(Object),
    );
  });

  it('should reply with not found message when user does not exist', async () => {
    const mockContext = {
      from: { id: 99999 },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    vi.mocked(userService.getUser).mockReturnValue(Effect.succeed({ user: undefined }));

    await profileCommand(mockContext);

    expect(mockContext.reply).toHaveBeenCalledWith(expect.stringContaining('Profile not found'));
  });

  it('should handle errors when fetching profile', async () => {
    const mockContext = {
      from: { id: 12345 },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    vi.mocked(userService.getUser).mockReturnValue(Effect.fail(new Error('Network error')));

    await profileCommand(mockContext);

    expect(mockContext.reply).toHaveBeenCalledWith(
      expect.stringContaining('Could not load profile'),
    );
  });
});
