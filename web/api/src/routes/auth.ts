import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import Joi from 'joi';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { AuthService, authenticate, optionalAuthenticate, validateTelegramAuth } from '../middleware/auth';
import { createRateLimitMiddleware } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError, ValidationError, AuthenticationError, ConflictError } from '../middleware/errorHandler';
import {
  ApiResponse,
  LoginRequest,
  RegisterRequest,
  RefreshTokenRequest,
  TelegramAuthRequest,
  AuthResponse,
  User
} from '../types';

const router = Router();

// Rate limiting for auth routes
const authRateLimit = createRateLimitMiddleware('auth');

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  first_name: Joi.string().min(1).max(50).required(),
  last_name: Joi.string().min(1).max(50).optional(),
  telegram_id: Joi.number().integer().positive().optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required()
});

const telegramAuthSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
  first_name: Joi.string().required(),
  last_name: Joi.string().optional(),
  username: Joi.string().optional(),
  photo_url: Joi.string().uri().optional(),
  auth_date: Joi.number().integer().positive().required(),
  hash: Joi.string().required()
});

// Register new user
router.post('/register', authRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { email, password, first_name, last_name, telegram_id }: RegisterRequest = value;

  // Check if user already exists
  const existingUser = await DatabaseService.query(
    'SELECT id FROM users WHERE email = $1 OR telegram_id = $2',
    [email, telegram_id || null]
  );

  if (existingUser.rows.length > 0) {
    throw new ConflictError('User already exists with this email or Telegram ID');
  }

  // Hash password
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Create user
  const result = await DatabaseService.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, telegram_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     RETURNING id, email, first_name, last_name, telegram_id, created_at`,
    [email, hashedPassword, first_name, last_name, telegram_id || null]
  );

  const user = result.rows[0];

  // Generate tokens
  const { accessToken, refreshToken } = AuthService.generateTokens(user);

  // Store refresh token in Redis
  await RedisService.setSession(`refresh_token:${user.id}`, refreshToken, 7 * 24 * 60 * 60); // 7 days

  const response: ApiResponse<AuthResponse> = {
    success: true,
    data: {
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        bio: user.bio,
        location: user.location,
        photos: user.photos || [],
        preferences: user.preferences || {},
        is_active: user.is_active,
        state: user.state,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      token: accessToken,
      access_token: accessToken,
      refreshToken
    }
  };

  res.status(201).json(response);
}));

// Login user
router.post('/login', authRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { email, password }: LoginRequest = value;

  // Get user with password
  const result = await DatabaseService.query(
    `SELECT id, email, password_hash, first_name, last_name, telegram_id, is_active, created_at
     FROM users WHERE email = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    throw new AuthenticationError('Invalid email or password');
  }

  const user = result.rows[0];

  // Check if user is active
  if (!user.is_active) {
    throw new AuthenticationError('Account is deactivated');
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Update last login
  await DatabaseService.query(
    'UPDATE users SET last_login = NOW() WHERE id = $1',
    [user.id]
  );

  // Generate tokens
  const { accessToken, refreshToken } = AuthService.generateTokens(user);

  // Store refresh token in Redis
  await RedisService.setSession(`refresh_token:${user.id}`, refreshToken, 7 * 24 * 60 * 60); // 7 days

  const response: ApiResponse<AuthResponse> = {
    success: true,
    data: {
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        bio: user.bio,
        location: user.location,
        photos: user.photos || [],
        preferences: user.preferences || {},
        is_active: user.is_active || true,
        state: user.state || 'idle',
        created_at: user.created_at,
        updated_at: user.updated_at || user.created_at
      },
      token: accessToken,
      refreshToken
    }
  };

  res.status(200).json(response);
}));

// Telegram authentication
router.post('/telegram', authRateLimit, validateTelegramAuth, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = telegramAuthSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const telegramData: TelegramAuthRequest = value;

  // Check if user exists
  let result = await DatabaseService.query(
    'SELECT id, email, first_name, last_name, telegram_id, is_active, created_at FROM users WHERE telegram_id = $1',
    [telegramData.telegram_id]
  );

  let user;
  if (result.rows.length === 0) {
    // Create new user from Telegram data
    const insertResult = await DatabaseService.query(
      `INSERT INTO users (telegram_id, first_name, last_name, username, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())
       RETURNING id, email, first_name, last_name, telegram_id, created_at`,
      [telegramData.telegram_id, telegramData.first_name, telegramData.last_name || '', telegramData.username]
    );
    user = insertResult.rows[0];
  } else {
    user = result.rows[0];
    
    // Check if user is active
    if (!user.is_active) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Update user info from Telegram
    await DatabaseService.query(
      `UPDATE users SET 
         first_name = $1, 
         last_name = $2, 
         username = $3, 
         last_login = NOW(), 
         updated_at = NOW()
       WHERE telegram_id = $4`,
      [telegramData.first_name, telegramData.last_name || '', telegramData.username, telegramData.telegram_id]
    );
  }

  // Generate tokens
  const { accessToken, refreshToken } = AuthService.generateTokens(user);

  // Store refresh token in Redis
  await RedisService.setSession(`refresh_token:${user.id}`, refreshToken, 7 * 24 * 60 * 60); // 7 days

  const response: ApiResponse<AuthResponse> = {
    success: true,
    data: {
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        bio: user.bio,
        location: user.location,
        photos: user.photos || [],
        preferences: user.preferences || {},
        is_active: user.is_active || true,
        state: user.state || 'idle',
        created_at: user.created_at,
        updated_at: user.updated_at || user.created_at
      },
      token: accessToken,
      refreshToken
    }
  };

  res.status(200).json(response);
}));

// Refresh access token
router.post('/refresh', authRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = refreshTokenSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { refreshToken }: RefreshTokenRequest = value;

  // Verify refresh token
  const payload = AuthService.verifyRefreshToken(refreshToken);
  if (!payload) {
    throw new AuthenticationError('Invalid refresh token');
  }

  // Check if refresh token exists in Redis
  const storedToken = await RedisService.getSession(`refresh_token:${payload.userId}`);
  if (!storedToken || storedToken !== refreshToken) {
    throw new AuthenticationError('Invalid refresh token');
  }

  // Get user
  const result = await DatabaseService.query(
    'SELECT id, email, first_name, last_name, telegram_id, is_active, created_at FROM users WHERE id = $1',
    [payload.userId]
  );

  if (result.rows.length === 0 || !result.rows[0].is_active) {
    throw new AuthenticationError('User not found or inactive');
  }

  const user = result.rows[0];

  // Generate new tokens
  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = AuthService.generateTokens(user);

  // Update refresh token in Redis
  await RedisService.setSession(`refresh_token:${user.id}`, newRefreshToken, 7 * 24 * 60 * 60); // 7 days

  const response: ApiResponse<AuthResponse> = {
    success: true,
    data: {
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        bio: user.bio,
        location: user.location,
        photos: user.photos || [],
        preferences: user.preferences || {},
        is_active: user.is_active,
        state: user.state,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      token: newAccessToken,
      refreshToken: newRefreshToken
    }
  };

  res.status(200).json(response);
}));

// Logout user
router.post('/logout', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const token = req.token!;

  // Blacklist access token
  await AuthService.blacklistToken(token, 3600);

  // Remove refresh token from Redis
  await RedisService.deleteSession(`refresh_token:${userId}`);

  const response: ApiResponse = {
    success: true,
    data: {
      message: 'Logged out successfully'
    }
  };

  res.status(200).json(response);
}));

// Logout from all devices
router.post('/logout-all', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const token = req.token!;

  // Blacklist current access token
  await AuthService.blacklistToken(token, 3600);

  // Remove all refresh tokens for this user
  await RedisService.deleteSession(`refresh_token:${userId}`);

  // Invalidate all user sessions
  await RedisService.deletePattern(`session:${userId}:*`);

  const response: ApiResponse = {
    success: true,
    data: {
      message: 'Logged out from all devices successfully'
    }
  };

  res.status(200).json(response);
}));

// Get current user
router.get('/me', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;

  const response: ApiResponse<User> = {
    success: true,
    data: user
  };

  res.status(200).json(response);
}));

// Verify token (for other services)
router.get('/verify', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;

  const response: ApiResponse = {
    success: true,
    data: {
      valid: true,
      userId: user.id,
      email: user.email
    }
  };

  res.status(200).json(response);
}));

export { router as authRoutes };