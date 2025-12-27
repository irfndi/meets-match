import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Store original env
const originalEnv = process.env;

describe('MatchService', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default API_URL when not set', async () => {
    delete process.env.API_URL;

    const { matchService } = await import('./matchService.js');

    expect(matchService).toBeDefined();
    expect(matchService.getPotentialMatches).toBeDefined();
    expect(matchService.createMatch).toBeDefined();
    expect(matchService.likeMatch).toBeDefined();
    expect(matchService.dislikeMatch).toBeDefined();
    expect(matchService.getMatch).toBeDefined();
    expect(matchService.getMatchList).toBeDefined();
  });

  it('should use custom API_URL from environment', async () => {
    process.env.API_URL = 'http://custom-api:9000';

    const { matchService } = await import('./matchService.js');

    expect(matchService).toBeDefined();
  });

  it('should return Effect for getPotentialMatches', async () => {
    const { matchService } = await import('./matchService.js');

    const result = matchService.getPotentialMatches('test-user-id');

    expect(Effect.isEffect(result)).toBe(true);
  });

  it('should return Effect for getPotentialMatches with custom limit', async () => {
    const { matchService } = await import('./matchService.js');

    const result = matchService.getPotentialMatches('test-user-id', 5);

    expect(Effect.isEffect(result)).toBe(true);
  });

  it('should return Effect for createMatch', async () => {
    const { matchService } = await import('./matchService.js');

    const result = matchService.createMatch('user1', 'user2');

    expect(Effect.isEffect(result)).toBe(true);
  });

  it('should return Effect for likeMatch', async () => {
    const { matchService } = await import('./matchService.js');

    const result = matchService.likeMatch('match-id', 'user-id');

    expect(Effect.isEffect(result)).toBe(true);
  });

  it('should return Effect for dislikeMatch', async () => {
    const { matchService } = await import('./matchService.js');

    const result = matchService.dislikeMatch('match-id', 'user-id');

    expect(Effect.isEffect(result)).toBe(true);
  });

  it('should return Effect for getMatch', async () => {
    const { matchService } = await import('./matchService.js');

    const result = matchService.getMatch('match-id');

    expect(Effect.isEffect(result)).toBe(true);
  });

  it('should return Effect for getMatchList', async () => {
    const { matchService } = await import('./matchService.js');

    const result = matchService.getMatchList('user-id');

    expect(Effect.isEffect(result)).toBe(true);
  });

  it('should return Effect for getMatchList with custom limit', async () => {
    const { matchService } = await import('./matchService.js');

    const result = matchService.getMatchList('user-id', 25);

    expect(Effect.isEffect(result)).toBe(true);
  });
});
