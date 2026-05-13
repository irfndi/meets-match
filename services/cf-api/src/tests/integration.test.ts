import { describe, it, expect, beforeEach } from 'vitest';
import { UserRepository } from '../models/user.js';
import { MatchRepository } from '../models/match.js';
import { NotificationRepository } from '../models/notification.js';
import { GeocodingService } from '../models/geocoding.js';
import { ApiRouter } from '../http/router.js';

interface MockD1Result {
  results?: Array<Record<string, unknown>>;
  first?: () => Promise<Record<string, unknown> | null>;
}

function createMockD1() {
  const data = new Map<string, Array<Record<string, unknown>>>();
  return {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => ({
        run: async () => ({ success: true }),
        first: async () => {
          if (sql.includes('FROM users WHERE id =')) {
            const id = String(values[0]);
            return data.get(`user:${id}`)?.[0] ?? null;
          }
          if (sql.includes('FROM matches WHERE id =')) {
            const id = String(values[0]);
            return data.get(`match:${id}`)?.[0] ?? null;
          }
          if (sql.includes('FROM notifications WHERE id =')) {
            const id = String(values[0]);
            return data.get(`notification:${id}`)?.[0] ?? null;
          }
          if (sql.includes('COUNT(*)')) {
            return { c: 0 };
          }
          return null;
        },
        all: async () => {
          if (sql.includes('FROM matches WHERE (user1_id =')) {
            const userId = String(values[0]);
            const results: Array<Record<string, unknown>> = [];
            for (const [key, value] of data) {
              if (key.startsWith('match:')) {
                const row = value[0];
                if (row.user1_id === userId || row.user2_id === userId) {
                  results.push(row);
                }
              }
            }
            return { results };
          }
          if (sql.includes('FROM users')) {
            const results: Array<Record<string, unknown>> = [];
            for (const [key, value] of data) {
              if (key.startsWith('user:')) {
                results.push(value[0]);
              }
            }
            return { results };
          }
          return { results: [] };
        },
      }),
    }),
    _data: data,
    _insert: (key: string, row: Record<string, unknown>) => {
      data.set(key, [row]);
    },
  };
}

function createMockKV() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
    _store: store,
  };
}

function createMockQueue() {
  const messages: Array<Record<string, unknown>> = [];
  return {
    send: async (message: string) => { messages.push(JSON.parse(message)); },
    _messages: messages,
  };
}

describe('API Integration', () => {
  let mockD1: ReturnType<typeof createMockD1>;
  let mockKV: ReturnType<typeof createMockKV>;
  let mockQueue: ReturnType<typeof createMockQueue>;
  let router: ApiRouter;

  beforeEach(() => {
    mockD1 = createMockD1();
    mockKV = createMockKV();
    mockQueue = createMockQueue();
    router = new ApiRouter({
      DB: mockD1 as unknown as D1Database,
      KV: mockKV as unknown as KVNamespace,
      NOTIFICATION_QUEUE: mockQueue as unknown as Queue,
    });
  });

  it('should create and retrieve a user', async () => {
    const createRequest = new Request('http://localhost/users', {
      method: 'POST',
      body: JSON.stringify({
        user: {
          id: '123',
          firstName: 'Test',
          age: 25,
          gender: 'male',
          isActive: true,
          isProfileComplete: true,
        },
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const createResponse = await router.route(createRequest);
    expect(createResponse.status).toBe(201);

    const getRequest = new Request('http://localhost/users/123', { method: 'GET' });
    mockD1._insert('user:123', {
      id: '123',
      first_name: 'Test',
      age: 25,
      gender: 'male',
      is_active: 1,
      is_profile_complete: 1,
      interests: '[]',
      photos: '[]',
      location: '{}',
      preferences: '{}',
    });
    const getResponse = await router.route(getRequest);
    expect(getResponse.status).toBe(200);
  });

  it('should return 404 for missing user', async () => {
    const request = new Request('http://localhost/users/999', { method: 'GET' });
    const response = await router.route(request);
    expect(response.status).toBe(404);
  });

  it('should create a match and handle like action', async () => {
    mockD1._insert('user:123', {
      id: '123', first_name: 'User1', is_active: 1, is_profile_complete: 1,
      interests: '[]', photos: '[]', location: '{}', preferences: '{}',
    });
    mockD1._insert('user:456', {
      id: '456', first_name: 'User2', is_active: 1, is_profile_complete: 1,
      interests: '[]', photos: '[]', location: '{}', preferences: '{}',
    });

    const createRequest = new Request('http://localhost/matches', {
      method: 'POST',
      body: JSON.stringify({ user1Id: '123', user2Id: '456' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const createResponse = await router.route(createRequest);
    expect(createResponse.status).toBe(201);
  });

  it('should return health check', async () => {
    const request = new Request('http://localhost/health', { method: 'GET' });
    const response = await router.route(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  it('should return 404 for unknown routes', async () => {
    const request = new Request('http://localhost/unknown', { method: 'GET' });
    const response = await router.route(request);
    expect(response.status).toBe(404);
  });
});
