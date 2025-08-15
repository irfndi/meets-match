import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { RedisService } from '../services/redis';
import { RateLimitError } from './errorHandler';
import { RateLimitInfo } from '../types';

interface RateLimiterOptions {
  keyPrefix: string;
  points: number; // Number of requests
  duration: number; // Per duration in seconds
  blockDuration?: number; // Block duration in seconds
  execEvenly?: boolean; // Spread requests evenly across duration
}

class RateLimiterService {
  private limiters: Map<string, RateLimiterRedis | RateLimiterMemory> = new Map();
  private useRedis: boolean = false;

  constructor() {
    // Check if Redis is available
    try {
      RedisService.getClient();
      this.useRedis = true;
    } catch (error) {
      console.warn('Redis not available, using memory-based rate limiting');
      this.useRedis = false;
    }
  }

  private createLimiter(options: RateLimiterOptions): RateLimiterRedis | RateLimiterMemory {
    const config = {
      keyPrefix: options.keyPrefix,
      points: options.points,
      duration: options.duration,
      blockDuration: options.blockDuration || options.duration,
      execEvenly: options.execEvenly || false,
    };

    if (this.useRedis) {
      return new RateLimiterRedis({
        ...config,
        storeClient: RedisService.getClient(),
      });
    } else {
      return new RateLimiterMemory(config);
    }
  }

  getLimiter(name: string, options: RateLimiterOptions): RateLimiterRedis | RateLimiterMemory {
    if (!this.limiters.has(name)) {
      this.limiters.set(name, this.createLimiter(options));
    }
    return this.limiters.get(name)!;
  }
}

const rateLimiterService = new RateLimiterService();

// Rate limiter configurations
const RATE_LIMITS = {
  // General API requests
  general: {
    keyPrefix: 'general_rl',
    points: 100, // 100 requests
    duration: 60, // per 60 seconds
    blockDuration: 60, // block for 60 seconds
  },
  // Authentication endpoints
  auth: {
    keyPrefix: 'auth_rl',
    points: 5, // 5 requests
    duration: 60, // per 60 seconds
    blockDuration: 300, // block for 5 minutes
  },
  // Message sending
  messages: {
    keyPrefix: 'messages_rl',
    points: 30, // 30 messages
    duration: 60, // per 60 seconds
    blockDuration: 60, // block for 60 seconds
  },
  // Photo uploads
  uploads: {
    keyPrefix: 'uploads_rl',
    points: 10, // 10 uploads
    duration: 300, // per 5 minutes
    blockDuration: 300, // block for 5 minutes
  },
  // Matching/swiping
  matching: {
    keyPrefix: 'matching_rl',
    points: 50, // 50 swipes
    duration: 60, // per 60 seconds
    blockDuration: 60, // block for 60 seconds
  },
  // Profile updates
  profile: {
    keyPrefix: 'profile_rl',
    points: 10, // 10 updates
    duration: 300, // per 5 minutes
    blockDuration: 300, // block for 5 minutes
  },
};

const getClientKey = (req: Request, keyPrefix: string): string => {
  // Use user ID if authenticated, otherwise use IP
  const userId = (req as any).user?.id;
  const clientId = userId || req.ip || 'unknown';
  return `${keyPrefix}:${clientId}`;
};

const setRateLimitHeaders = (res: Response, rateLimitInfo: RateLimitInfo): void => {
  res.set({
    'X-RateLimit-Limit': rateLimitInfo.limit.toString(),
    'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
    'X-RateLimit-Reset': rateLimitInfo.reset.toISOString(),
  });

  if (rateLimitInfo.retryAfter) {
    res.set('Retry-After', rateLimitInfo.retryAfter.toString());
  }
};

const createRateLimitMiddleware = (limitName: keyof typeof RATE_LIMITS) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = RATE_LIMITS[limitName];
      const limiter = rateLimiterService.getLimiter(limitName, config);
      const key = getClientKey(req, config.keyPrefix);

      try {
        const resRateLimiter = await limiter.consume(key);
        
        // Set rate limit headers
        const rateLimitInfo: RateLimitInfo = {
          limit: config.points,
          remaining: resRateLimiter.remainingPoints || 0,
          reset: new Date(Date.now() + resRateLimiter.msBeforeNext),
        };
        
        setRateLimitHeaders(res, rateLimitInfo);
        next();
      } catch (rejRes: any) {
        // Rate limit exceeded
        const rateLimitInfo: RateLimitInfo = {
          limit: config.points,
          remaining: 0,
          reset: new Date(Date.now() + rejRes.msBeforeNext),
          retryAfter: Math.round(rejRes.msBeforeNext / 1000),
        };
        
        setRateLimitHeaders(res, rateLimitInfo);
        
        const error = new RateLimitError(
          `Rate limit exceeded. Try again in ${rateLimitInfo.retryAfter} seconds.`
        );
        next(error);
      }
    } catch (error) {
      console.error('Rate limiter error:', error);
      // If rate limiter fails, allow the request to continue
      next();
    }
  };
};

// Export specific rate limiters
export const rateLimiter = createRateLimitMiddleware('general');
export const authRateLimiter = createRateLimitMiddleware('auth');
export const messageRateLimiter = createRateLimitMiddleware('messages');
export const uploadRateLimiter = createRateLimitMiddleware('uploads');
export const matchingRateLimiter = createRateLimitMiddleware('matching');
export const profileRateLimiter = createRateLimitMiddleware('profile');

// Custom rate limiter factory
export const createCustomRateLimiter = (options: RateLimiterOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limiter = rateLimiterService.getLimiter(`custom_${options.keyPrefix}`, options);
      const key = getClientKey(req, options.keyPrefix);

      try {
        const resRateLimiter = await limiter.consume(key);
        
        const rateLimitInfo: RateLimitInfo = {
          limit: options.points,
          remaining: resRateLimiter.remainingPoints || 0,
          reset: new Date(Date.now() + resRateLimiter.msBeforeNext),
        };
        
        setRateLimitHeaders(res, rateLimitInfo);
        next();
      } catch (rejRes: any) {
        const rateLimitInfo: RateLimitInfo = {
          limit: options.points,
          remaining: 0,
          reset: new Date(Date.now() + rejRes.msBeforeNext),
          retryAfter: Math.round(rejRes.msBeforeNext / 1000),
        };
        
        setRateLimitHeaders(res, rateLimitInfo);
        
        const error = new RateLimitError(
          `Rate limit exceeded. Try again in ${rateLimitInfo.retryAfter} seconds.`
        );
        next(error);
      }
    } catch (error) {
      console.error('Custom rate limiter error:', error);
      next();
    }
  };
};

export { RateLimiterService, RATE_LIMITS };