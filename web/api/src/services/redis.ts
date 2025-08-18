import { createClient, RedisClientType } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  enableReadyCheck?: boolean;
  maxRetriesPerRequest?: number;
}

export class RedisService {
  private static client: RedisClientType;
  private static config: RedisConfig;

  static async initialize(customConfig?: RedisConfig): Promise<void> {
    this.config = customConfig || {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3
    };

    const redisUrl = this.config.password
      ? `redis://:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.db}`
      : `redis://${this.config.host}:${this.config.port}/${this.config.db}`;

    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error('Redis connection failed after 10 retries');
          }
          return Math.min(retries * 50, 1000);
        }
      }
    });

    this.client.on('error', (error) => {
      console.error('Redis Client Error:', error);
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
    });

    this.client.on('ready', () => {
      console.log('Redis Client Ready');
    });

    this.client.on('end', () => {
      console.log('Redis Client Disconnected');
    });

    try {
      await this.client.connect();
      console.log('Redis connection established successfully');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  static getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis not initialized. Call initialize() first.');
    }
    return this.client;
  }

  // String operations
  static async set(key: string, value: string, ttl?: number): Promise<void> {
    const client = this.getClient();
    if (ttl) {
      await client.setEx(key, ttl, value);
    } else {
      await client.set(key, value);
    }
  }

  static async get(key: string): Promise<string | null> {
    const client = this.getClient();
    return await client.get(key);
  }

  static async del(key: string): Promise<number> {
    const client = this.getClient();
    return await client.del(key);
  }

  static async exists(key: string): Promise<boolean> {
    const client = this.getClient();
    const result = await client.exists(key);
    return result === 1;
  }

  static async expire(key: string, seconds: number): Promise<boolean> {
    const client = this.getClient();
    const result = await client.expire(key, seconds);
    return result === 1;
  }

  static async ttl(key: string): Promise<number> {
    const client = this.getClient();
    return await client.ttl(key);
  }

  // Hash operations
  static async hSet(key: string, field: string, value: string): Promise<number> {
    const client = this.getClient();
    return await client.hSet(key, field, value);
  }

  static async hGet(key: string, field: string): Promise<string | undefined> {
    const client = this.getClient();
    const result = await client.hGet(key, field);
    return result || undefined;
  }

  static async hGetAll(key: string): Promise<Record<string, string>> {
    const client = this.getClient();
    return await client.hGetAll(key);
  }

  static async hDel(key: string, field: string): Promise<number> {
    const client = this.getClient();
    return await client.hDel(key, field);
  }

  // Set operations
  static async sAdd(key: string, member: string): Promise<number> {
    const client = this.getClient();
    return await client.sAdd(key, member);
  }

  static async sMembers(key: string): Promise<string[]> {
    const client = this.getClient();
    return await client.sMembers(key);
  }

  static async sRem(key: string, member: string): Promise<number> {
    const client = this.getClient();
    return await client.sRem(key, member);
  }

  // List operations
  static async lPush(key: string, element: string): Promise<number> {
    const client = this.getClient();
    return await client.lPush(key, element);
  }

  static async rPush(key: string, element: string): Promise<number> {
    const client = this.getClient();
    return await client.rPush(key, element);
  }

  static async lPop(key: string): Promise<string | null> {
    const client = this.getClient();
    return await client.lPop(key);
  }

  static async lRange(key: string, start: number, stop: number): Promise<string[]> {
    const client = this.getClient();
    return await client.lRange(key, start, stop);
  }

  // JSON operations (for complex objects)
  static async setJSON(key: string, value: any, ttl?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttl);
  }

  static async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  // Session management
  static async setSession(sessionId: string, data: any, ttl: number = 3600): Promise<void> {
    await this.setJSON(`session:${sessionId}`, data, ttl);
  }

  static async getSession<T>(sessionId: string): Promise<T | null> {
    return await this.getJSON<T>(`session:${sessionId}`);
  }

  static async deleteSession(sessionId: string): Promise<number> {
    return await this.del(`session:${sessionId}`);
  }

  // Cache management
  static async setCache(key: string, data: any, ttl: number = 300): Promise<void> {
    await this.setJSON(`cache:${key}`, data, ttl);
  }

  static async getCache<T>(key: string): Promise<T | null> {
    return await this.getJSON<T>(`cache:${key}`);
  }

  static async deleteCache(key: string): Promise<number> {
    return await this.del(`cache:${key}`);
  }

  // Delete keys by pattern
  static async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.client.del(keys);
    } catch (error) {
      console.error('Redis deletePattern failed:', error);
      throw error;
    }
  }

  // Health check
  static async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  // Close connection
  static async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      console.log('Redis connection closed');
    }
  }

  static getConfig(): RedisConfig {
    return this.config;
  }
}