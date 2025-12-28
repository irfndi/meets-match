import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration tests for Bot -> API gRPC communication.
 *
 * These tests require a running API server.
 * Set INTEGRATION_TEST_API_URL environment variable to enable.
 *
 * Example: INTEGRATION_TEST_API_URL=http://localhost:8080 bun run test
 */

const INTEGRATION_API_URL = process.env.INTEGRATION_TEST_API_URL;
const TEST_USER_ID = `integration-test-${Date.now()}`;

// Skip all tests if API URL is not configured
const skipTests = !INTEGRATION_API_URL;

describe.skipIf(skipTests)('Bot-API Integration', () => {
  beforeAll(() => {
    if (INTEGRATION_API_URL) {
      process.env.API_URL = INTEGRATION_API_URL;
      console.log(`Running integration tests against: ${INTEGRATION_API_URL}`);
    }
  });

  afterAll(() => {
    // Cleanup: delete test user if possible
    // Note: This would require a deleteUser endpoint
  });

  it('should create and fetch user via gRPC', async () => {
    // Dynamic import to pick up env changes
    const { userService } = await import('../../services/userService.js');

    // Create user
    const createResult = await Effect.runPromise(
      Effect.either(
        userService.createUser({
          id: TEST_USER_ID,
          firstName: 'Integration',
          lastName: 'Test',
          isActive: true,
        }),
      ),
    );

    expect(createResult._tag).toBe('Right');

    // Fetch user
    const getResult = await Effect.runPromise(Effect.either(userService.getUser(TEST_USER_ID)));

    expect(getResult._tag).toBe('Right');
    if (getResult._tag === 'Right') {
      expect(getResult.right.user?.firstName).toBe('Integration');
    }
  });

  it('should update user profile', async () => {
    const { userService } = await import('../../services/userService.js');

    const updateResult = await Effect.runPromise(
      Effect.either(
        userService.updateUser(TEST_USER_ID, {
          bio: 'Integration test bio',
          age: 25,
        }),
      ),
    );

    expect(updateResult._tag).toBe('Right');

    // Verify update
    const getResult = await Effect.runPromise(Effect.either(userService.getUser(TEST_USER_ID)));

    expect(getResult._tag).toBe('Right');
    if (getResult._tag === 'Right') {
      expect(getResult.right.user?.bio).toBe('Integration test bio');
    }
  });

  it('should get potential matches (may be empty)', async () => {
    const { matchService } = await import('../../services/matchService.js');

    const result = await Effect.runPromise(
      Effect.either(matchService.getPotentialMatches(TEST_USER_ID, 5)),
    );

    // May be empty but should not error
    expect(result._tag).toBe('Right');
    if (result._tag === 'Right') {
      expect(Array.isArray(result.right.potentialMatches)).toBe(true);
    }
  });

  it('should get match list (may be empty)', async () => {
    const { matchService } = await import('../../services/matchService.js');

    const result = await Effect.runPromise(Effect.either(matchService.getMatchList(TEST_USER_ID)));

    expect(result._tag).toBe('Right');
    if (result._tag === 'Right') {
      expect(Array.isArray(result.right.matches)).toBe(true);
    }
  });

  it('should handle NotFound for non-existent user', async () => {
    const { userService } = await import('../../services/userService.js');

    const result = await Effect.runPromise(
      Effect.either(userService.getUser('non-existent-user-id-12345')),
    );

    expect(result._tag).toBe('Left');
  });
});

// Informational test that always runs
describe('Integration Test Configuration', () => {
  it('should skip integration tests when INTEGRATION_TEST_API_URL is not set', () => {
    if (!INTEGRATION_API_URL) {
      console.log('Integration tests skipped: INTEGRATION_TEST_API_URL not set');
      console.log('To run integration tests:');
      console.log('  INTEGRATION_TEST_API_URL=http://localhost:8080 bun run test');
    }
    expect(true).toBe(true);
  });
});
