import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { JwtPayload, User } from '../types';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      token?: string;
    }
  }
}

interface TokenPayload extends JwtPayload {
  type: 'access' | 'refresh';
}

export class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  private static readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
  private static readonly JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  static generateTokens(user: User): { accessToken: string; refreshToken: string } {
    const payload = {
      userId: user.id,
      telegramId: user.telegram_id,
      username: user.username,
    };

    const accessToken = jwt.sign(
      { ...payload, type: 'access' },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { ...payload, type: 'refresh' },
      this.JWT_REFRESH_SECRET,
      { expiresIn: this.JWT_REFRESH_EXPIRES_IN }
    );

    return { accessToken, refreshToken };
  }

  static verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as TokenPayload;
      if (decoded.type !== 'access') {
        throw new AuthenticationError('Invalid token type');
      }
      return decoded;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Access token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid access token');
      }
      throw new AuthenticationError('Token verification failed');
    }
  }

  static verifyRefreshToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.JWT_REFRESH_SECRET) as TokenPayload;
      if (decoded.type !== 'refresh') {
        throw new AuthenticationError('Invalid token type');
      }
      return decoded;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Refresh token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid refresh token');
      }
      throw new AuthenticationError('Refresh token verification failed');
    }
  }

  static async blacklistToken(token: string, expiresIn: number): Promise<void> {
    try {
      await RedisService.set(`blacklist:${token}`, 'true', expiresIn);
    } catch (error) {
      console.error('Failed to blacklist token:', error);
      // Don't throw error, as this is not critical
    }
  }

  static async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const result = await RedisService.get(`blacklist:${token}`);
      return result === 'true';
    } catch (error) {
      console.error('Failed to check token blacklist:', error);
      return false; // Assume not blacklisted if Redis fails
    }
  }

  static async getUserById(userId: string): Promise<User | null> {
    try {
      const result = await DatabaseService.query(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Failed to get user by ID:', error);
      return null;
    }
  }

  static async getUserByTelegramId(telegramId: number): Promise<User | null> {
    try {
      const result = await DatabaseService.query(
        'SELECT * FROM users WHERE telegram_id = $1 AND is_active = true',
        [telegramId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Failed to get user by Telegram ID:', error);
      return null;
    }
  }
}

// Extract token from request
const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Also check for token in cookies
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }
  
  return null;
};

// Main authentication middleware
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new AuthenticationError('Access token required');
    }

    // Check if token is blacklisted
    const isBlacklisted = await AuthService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new AuthenticationError('Token has been revoked');
    }

    // Verify token
    const decoded = AuthService.verifyAccessToken(token);
    
    // Get user from database
    const user = await AuthService.getUserById(decoded.userId);
    if (!user) {
      throw new AuthenticationError('User not found or inactive');
    }

    // Attach user and token to request
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    next(error);
  }
};

// Optional authentication middleware (doesn't throw error if no token)
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (token) {
      // Check if token is blacklisted
      const isBlacklisted = await AuthService.isTokenBlacklisted(token);
      if (!isBlacklisted) {
        try {
          // Verify token
          const decoded = AuthService.verifyAccessToken(token);
          
          // Get user from database
          const user = await AuthService.getUserById(decoded.userId);
          if (user) {
            req.user = user;
            req.token = token;
          }
        } catch (error) {
          // Ignore token errors in optional authentication
          console.warn('Optional authentication failed:', error);
        }
      }
    }
    
    next();
  } catch (error) {
    // In optional auth, we don't want to stop the request
    console.warn('Optional authentication error:', error);
    next();
  }
};

// Authorization middleware for specific user actions
export const authorizeUser = (allowSelf: boolean = true) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const targetUserId = req.params.userId || req.params.id;
      
      if (allowSelf && targetUserId === req.user.id) {
        return next();
      }

      // Add more authorization logic here (e.g., admin roles)
      throw new AuthorizationError('Insufficient permissions');
    } catch (error) {
      next(error);
    }
  };
};

// Middleware to ensure user is active
export const requireActiveUser = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    if (!req.user.is_active) {
      throw new AuthorizationError('Account is inactive');
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to validate Telegram authentication
export const validateTelegramAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const { telegram_id, first_name } = req.body;
    
    if (!telegram_id || !first_name) {
      throw new AuthenticationError('Telegram ID and first name are required');
    }

    if (typeof telegram_id !== 'number' || telegram_id <= 0) {
      throw new AuthenticationError('Invalid Telegram ID');
    }

    if (typeof first_name !== 'string' || first_name.trim().length === 0) {
      throw new AuthenticationError('Invalid first name');
    }

    next();
  } catch (error) {
    next(error);
  }
};