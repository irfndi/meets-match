import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { authenticate, requireActiveUser, authorizeUser } from '../middleware/auth';
import { createRateLimitMiddleware } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError, ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';
import {
  ApiResponse,
  User,
  UpdateUserRequest,
  PaginationQuery,
  PhotoUploadResponse,
  UserPreferences,
  UserStats
} from '../types';

const router = Router();

// Rate limiting
const profileUpdateRateLimit = createRateLimitMiddleware('profileUpdate');
const photoUploadRateLimit = createRateLimitMiddleware('photoUpload');

// Multer configuration for photo uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JPEG, PNG, and WebP images are allowed', 400));
    }
  }
});

// Validation schemas
const updateUserSchema = Joi.object({
  firstName: Joi.string().min(1).max(50).optional(),
  lastName: Joi.string().min(1).max(50).optional(),
  bio: Joi.string().max(500).optional(),
  age: Joi.number().integer().min(18).max(100).optional(),
  gender: Joi.string().valid('male', 'female', 'other').optional(),
  location: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    city: Joi.string().max(100).optional(),
    country: Joi.string().max(100).optional()
  }).optional(),
  preferences: Joi.object({
    ageMin: Joi.number().integer().min(18).max(100).optional(),
    ageMax: Joi.number().integer().min(18).max(100).optional(),
    gender: Joi.string().valid('male', 'female', 'other', 'any').optional(),
    maxDistance: Joi.number().min(1).max(1000).optional(),
    interests: Joi.array().items(Joi.string().max(50)).max(20).optional()
  }).optional()
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('created_at', 'last_login', 'age').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// Helper function to process and save photos
const processAndSavePhoto = async (file: Express.Multer.File, userId: string): Promise<string> => {
  const photoId = uuidv4();
  const uploadsDir = path.join(process.cwd(), 'uploads', 'photos');
  
  // Ensure uploads directory exists
  await fs.mkdir(uploadsDir, { recursive: true });
  
  // Process image with sharp
  const processedImage = await sharp(file.buffer)
    .resize(800, 800, { 
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  
  // Save processed image
  const filename = `${photoId}.jpg`;
  const filepath = path.join(uploadsDir, filename);
  await fs.writeFile(filepath, processedImage);
  
  return `/uploads/photos/${filename}`;
};

// Get current user profile
router.get('/me', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  
  const result = await DatabaseService.query(
    `SELECT id, email, first_name, last_name, bio, age, gender, location, photos, 
            preferences, is_active, telegram_id, username, created_at, updated_at, last_login
     FROM users WHERE id = $1`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    throw new NotFoundError('User not found');
  }
  
  const user = result.rows[0];
  
  const response: ApiResponse<User> = {
    success: true,
    data: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      bio: user.bio,
      age: user.age,
      gender: user.gender,
      location: user.location,
      photos: user.photos || [],
      preferences: user.preferences,
      isActive: user.is_active,
      telegramId: user.telegram_id,
      username: user.username,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_login
    }
  };
  
  res.status(200).json(response);
}));

// Get user by ID
router.get('/:id', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const result = await DatabaseService.query(
    `SELECT id, first_name, last_name, bio, age, gender, photos, created_at
     FROM users WHERE id = $1 AND is_active = true`,
    [id]
  );
  
  if (result.rows.length === 0) {
    throw new NotFoundError('User not found');
  }
  
  const user = result.rows[0];
  
  const response: ApiResponse<Partial<User>> = {
    success: true,
    data: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      bio: user.bio,
      age: user.age,
      gender: user.gender,
      photos: user.photos || [],
      createdAt: user.created_at
    }
  };
  
  res.status(200).json(response);
}));

// Update user profile
router.put('/me', authenticate, requireActiveUser, profileUpdateRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = updateUserSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }
  
  const userId = req.user!.id;
  const updateData: UpdateUserRequest = value;
  
  // Validate age preferences
  if (updateData.preferences?.ageMin && updateData.preferences?.ageMax) {
    if (updateData.preferences.ageMin > updateData.preferences.ageMax) {
      throw new ValidationError('Minimum age cannot be greater than maximum age');
    }
  }
  
  // Build update query dynamically
  const updateFields: string[] = [];
  const updateValues: any[] = [];
  let paramIndex = 1;
  
  if (updateData.firstName !== undefined) {
    updateFields.push(`first_name = $${paramIndex++}`);
    updateValues.push(updateData.firstName);
  }
  
  if (updateData.lastName !== undefined) {
    updateFields.push(`last_name = $${paramIndex++}`);
    updateValues.push(updateData.lastName);
  }
  
  if (updateData.bio !== undefined) {
    updateFields.push(`bio = $${paramIndex++}`);
    updateValues.push(updateData.bio);
  }
  
  if (updateData.age !== undefined) {
    updateFields.push(`age = $${paramIndex++}`);
    updateValues.push(updateData.age);
  }
  
  if (updateData.gender !== undefined) {
    updateFields.push(`gender = $${paramIndex++}`);
    updateValues.push(updateData.gender);
  }
  
  if (updateData.location !== undefined) {
    updateFields.push(`location = $${paramIndex++}`);
    updateValues.push(JSON.stringify(updateData.location));
  }
  
  if (updateData.preferences !== undefined) {
    updateFields.push(`preferences = $${paramIndex++}`);
    updateValues.push(JSON.stringify(updateData.preferences));
  }
  
  if (updateFields.length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  
  updateFields.push(`updated_at = NOW()`);
  updateValues.push(userId);
  
  const query = `
    UPDATE users SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, email, first_name, last_name, bio, age, gender, location, photos, 
              preferences, is_active, telegram_id, username, created_at, updated_at, last_login
  `;
  
  const result = await DatabaseService.query(query, updateValues);
  const user = result.rows[0];
  
  const response: ApiResponse<User> = {
    success: true,
    data: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      bio: user.bio,
      age: user.age,
      gender: user.gender,
      location: user.location,
      photos: user.photos || [],
      preferences: user.preferences,
      isActive: user.is_active,
      telegramId: user.telegram_id,
      username: user.username,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_login
    }
  };
  
  res.status(200).json(response);
}));

// Upload photos
router.post('/me/photos', authenticate, requireActiveUser, photoUploadRateLimit, 
  upload.array('photos', 5), asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      throw new ValidationError('No photos provided');
    }
    
    // Get current photos
    const userResult = await DatabaseService.query(
      'SELECT photos FROM users WHERE id = $1',
      [userId]
    );
    
    const currentPhotos = userResult.rows[0]?.photos || [];
    
    // Check photo limit (max 5 photos)
    if (currentPhotos.length + files.length > 5) {
      throw new ValidationError('Maximum 5 photos allowed');
    }
    
    // Process and save photos
    const newPhotos: string[] = [];
    for (const file of files) {
      const photoUrl = await processAndSavePhoto(file, userId);
      newPhotos.push(photoUrl);
    }
    
    // Update user photos
    const updatedPhotos = [...currentPhotos, ...newPhotos];
    await DatabaseService.query(
      'UPDATE users SET photos = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updatedPhotos), userId]
    );
    
    const response: ApiResponse<PhotoUploadResponse> = {
      success: true,
      data: {
        photos: updatedPhotos,
        uploaded: newPhotos
      }
    };
    
    res.status(200).json(response);
  })
);

// Delete photo
router.delete('/me/photos/:index', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const photoIndex = parseInt(req.params.index);
  
  if (isNaN(photoIndex) || photoIndex < 0) {
    throw new ValidationError('Invalid photo index');
  }
  
  // Get current photos
  const userResult = await DatabaseService.query(
    'SELECT photos FROM users WHERE id = $1',
    [userId]
  );
  
  const currentPhotos = userResult.rows[0]?.photos || [];
  
  if (photoIndex >= currentPhotos.length) {
    throw new NotFoundError('Photo not found');
  }
  
  // Remove photo from array
  const updatedPhotos = currentPhotos.filter((_: string, index: number) => index !== photoIndex);
  
  // Update user photos
  await DatabaseService.query(
    'UPDATE users SET photos = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(updatedPhotos), userId]
  );
  
  // TODO: Delete physical file from storage
  
  const response: ApiResponse<{ photos: string[] }> = {
    success: true,
    data: {
      photos: updatedPhotos
    }
  };
  
  res.status(200).json(response);
}));

// Get user statistics
router.get('/me/stats', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  
  // Get various statistics
  const [matchesResult, messagesResult, profileViewsResult] = await Promise.all([
    DatabaseService.query(
      'SELECT COUNT(*) as total_matches FROM matches WHERE (user1_id = $1 OR user2_id = $1) AND status = $2',
      [userId, 'matched']
    ),
    DatabaseService.query(
      'SELECT COUNT(*) as total_messages FROM messages WHERE sender_id = $1',
      [userId]
    ),
    DatabaseService.query(
      'SELECT COUNT(*) as profile_views FROM analytics WHERE user_id = $1 AND event_type = $2',
      [userId, 'profile_view']
    )
  ]);
  
  const stats: UserStats = {
    totalMatches: parseInt(matchesResult.rows[0].total_matches),
    totalMessages: parseInt(messagesResult.rows[0].total_messages),
    profileViews: parseInt(profileViewsResult.rows[0].profile_views)
  };
  
  const response: ApiResponse<UserStats> = {
    success: true,
    data: stats
  };
  
  res.status(200).json(response);
}));

// Deactivate account
router.patch('/me/deactivate', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  
  await DatabaseService.query(
    'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
    [userId]
  );
  
  const response: ApiResponse = {
    success: true,
    data: {
      message: 'Account deactivated successfully'
    }
  };
  
  res.status(200).json(response);
}));

// Reactivate account
router.patch('/me/reactivate', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  
  await DatabaseService.query(
    'UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1',
    [userId]
  );
  
  const response: ApiResponse = {
    success: true,
    data: {
      message: 'Account reactivated successfully'
    }
  };
  
  res.status(200).json(response);
}));

// Delete account (soft delete)
router.delete('/me', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  
  // Start transaction
  const client = await DatabaseService.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Soft delete user
    await client.query(
      'UPDATE users SET is_active = false, email = $1, updated_at = NOW() WHERE id = $2',
      [`deleted_${userId}@deleted.com`, userId]
    );
    
    // Delete user sessions
    await RedisService.deletePattern(`session:${userId}:*`);
    await RedisService.deleteSession(`refresh_token:${userId}`);
    
    await client.query('COMMIT');
    
    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Account deleted successfully'
      }
    };
    
    res.status(200).json(response);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

export { router as userRoutes };