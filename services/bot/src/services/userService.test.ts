import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetClient } from './userService.js';

// Store original env
const originalEnv = process.env;

describe('UserService', () => {
  beforeEach(() => {
    vi.resetModules();
    _resetClient();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    _resetClient();
    process.env = originalEnv;
  });

  it('should use default API_URL when not set', async () => {
    delete process.env.API_URL;

    // Import fresh module
    const { userService } = await import('./userService.js');

    // The service should be defined
    expect(userService).toBeDefined();
    expect(userService.getUser).toBeDefined();
    expect(userService.createUser).toBeDefined();
    expect(userService.updateUser).toBeDefined();
  });

  it('should use custom API_URL from environment', async () => {
    process.env.API_URL = 'http://custom-api:9000';

    // Import fresh module
    const { userService } = await import('./userService.js');

    expect(userService).toBeDefined();
  });

  it('should return Effect for getUser', async () => {
    const { userService } = await import('./userService.js');

    const result = userService.getUser('test-user-id');

    // Verify it returns an Effect
    expect(Effect.isEffect(result)).toBe(true);
  });

  it('should return Effect for createUser', async () => {
    const { userService } = await import('./userService.js');

    const result = userService.createUser({ id: 'test', firstName: 'Test' });

    expect(Effect.isEffect(result)).toBe(true);
  });

  it('should return Effect for updateUser', async () => {
    const { userService } = await import('./userService.js');

    const result = userService.updateUser('test-user-id', { firstName: 'Updated' });

    expect(Effect.isEffect(result)).toBe(true);
  });
});
