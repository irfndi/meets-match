import { Effect } from 'effect';
import type { Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGetUserResponse, createMockLocation, createMockUser } from '../test/fixtures.js';
import { profileCommand } from './profile.js';

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

    const mockUser = createMockUser({
      firstName: 'John',
      lastName: 'Doe',
      username: 'johndoe',
      age: 25,
      gender: 'Male',
      bio: 'Hello world',
      location: createMockLocation({ city: 'New York', country: 'USA' }),
    });

    vi.mocked(userService.getUser).mockReturnValue(Effect.succeed(createGetUserResponse(mockUser)));

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

    vi.mocked(userService.getUser).mockReturnValue(
      Effect.succeed(createGetUserResponse(undefined)),
    );

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

  it('should not process if no user ID', async () => {
    const mockContext = {
      from: undefined,
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    await profileCommand(mockContext);

    expect(userService.getUser).not.toHaveBeenCalled();
  });

  it('should display profile with missing optional fields', async () => {
    const mockContext = {
      from: { id: 12345 },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    const mockUser = createMockUser({
      firstName: 'Jane',
      lastName: '',
      bio: '',
      location: undefined,
    });

    vi.mocked(userService.getUser).mockReturnValue(Effect.succeed(createGetUserResponse(mockUser)));

    await profileCommand(mockContext);

    expect(mockContext.reply).toHaveBeenCalledWith(
      expect.stringContaining('Jane'),
      expect.any(Object),
    );
  });

  it('should display location with only city', async () => {
    const mockContext = {
      from: { id: 12345 },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    const mockUser = createMockUser({
      firstName: 'Alex',
      location: createMockLocation({ city: 'Tokyo', country: '' }),
    });

    vi.mocked(userService.getUser).mockReturnValue(Effect.succeed(createGetUserResponse(mockUser)));

    await profileCommand(mockContext);

    expect(mockContext.reply).toHaveBeenCalledWith(
      expect.stringContaining('Tokyo'),
      expect.any(Object),
    );
  });

  it('should show Unknown location when location is missing city', async () => {
    const mockContext = {
      from: { id: 12345 },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    const mockUser = createMockUser({
      firstName: 'Sam',
      location: createMockLocation({ city: '', country: 'Japan' }),
    });

    vi.mocked(userService.getUser).mockReturnValue(Effect.succeed(createGetUserResponse(mockUser)));

    await profileCommand(mockContext);

    expect(mockContext.reply).toHaveBeenCalledWith(
      expect.stringContaining('Unknown'),
      expect.any(Object),
    );
  });

  it('should handle user with username only', async () => {
    const mockContext = {
      from: { id: 12345 },
      reply: vi.fn().mockResolvedValue({}),
    } as unknown as Context;

    const mockUser = createMockUser({
      firstName: 'Test',
      lastName: '',
      username: 'testonly',
      age: 0,
      gender: '',
      bio: '',
    });

    vi.mocked(userService.getUser).mockReturnValue(Effect.succeed(createGetUserResponse(mockUser)));

    await profileCommand(mockContext);

    expect(mockContext.reply).toHaveBeenCalledWith(
      expect.stringContaining('@testonly'),
      expect.any(Object),
    );
  });
});
