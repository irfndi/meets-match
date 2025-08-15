import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { createRateLimitMiddleware } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler';
import {
  ApiResponse,
  Match,
  User,
  PaginationQuery,
  MatchActionRequest,
  PotentialMatchesQuery
} from '../types';

const router = Router();

// Rate limiting
const matchingRateLimit = createRateLimitMiddleware('matching');

// Validation schemas
const matchActionSchema = Joi.object({
  action: Joi.string().valid('like', 'pass').required(),
  targetUserId: Joi.string().uuid().required()
});

const potentialMatchesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
  maxDistance: Joi.number().min(1).max(1000).optional(),
  ageMin: Joi.number().integer().min(18).max(100).optional(),
  ageMax: Joi.number().integer().min(18).max(100).optional(),
  gender: Joi.string().valid('male', 'female', 'other', 'any').optional()
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('pending', 'matched', 'expired').optional()
});

// Helper function to calculate distance between two points (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Get potential matches
router.get('/potential', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = potentialMatchesSchema.validate(req.query);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const userId = req.user!.id;
  const { page, limit, maxDistance, ageMin, ageMax, gender }: PotentialMatchesQuery = value;
  const offset = (page - 1) * limit;

  // Get current user's location and preferences
  const userResult = await DatabaseService.query(
    'SELECT location, preferences, gender FROM users WHERE id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new NotFoundError('User not found');
  }

  const currentUser = userResult.rows[0];
  const userLocation = currentUser.location;
  const userPreferences = currentUser.preferences || {};

  // Build query conditions
  const conditions: string[] = [
    'u.id != $1',
    'u.is_active = true',
    'u.age IS NOT NULL',
    'u.location IS NOT NULL'
  ];
  const params: any[] = [userId];
  let paramIndex = 2;

  // Exclude users already matched or passed
  conditions.push(`
    u.id NOT IN (
      SELECT CASE 
        WHEN user1_id = $1 THEN user2_id 
        ELSE user1_id 
      END
      FROM matches 
      WHERE (user1_id = $1 OR user2_id = $1)
    )
  `);

  // Apply age filters (from preferences or query)
  const minAge = ageMin || userPreferences.ageMin || 18;
  const maxAge = ageMax || userPreferences.ageMax || 100;
  conditions.push(`u.age BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
  params.push(minAge, maxAge);
  paramIndex += 2;

  // Apply gender filter (from preferences or query)
  const preferredGender = gender || userPreferences.gender;
  if (preferredGender && preferredGender !== 'any') {
    conditions.push(`u.gender = $${paramIndex}`);
    params.push(preferredGender);
    paramIndex++;
  }

  // Apply mutual gender preference (other users should also be interested in current user's gender)
  if (currentUser.gender) {
    conditions.push(`
      (u.preferences IS NULL OR 
       u.preferences->>'gender' IS NULL OR 
       u.preferences->>'gender' = 'any' OR 
       u.preferences->>'gender' = $${paramIndex})
    `);
    params.push(currentUser.gender);
    paramIndex++;
  }

  const query = `
    SELECT u.id, u.first_name, u.last_name, u.bio, u.age, u.gender, 
           u.photos, u.location, u.created_at,
           CASE 
             WHEN u.location IS NOT NULL AND $${paramIndex} IS NOT NULL THEN
               6371 * acos(
                 cos(radians(($${paramIndex}->>'latitude')::float)) * 
                 cos(radians((u.location->>'latitude')::float)) * 
                 cos(radians((u.location->>'longitude')::float) - radians(($${paramIndex}->>'longitude')::float)) + 
                 sin(radians(($${paramIndex}->>'latitude')::float)) * 
                 sin(radians((u.location->>'latitude')::float))
               )
             ELSE NULL
           END as distance
    FROM users u
    WHERE ${conditions.join(' AND ')}
    ORDER BY 
      CASE WHEN u.location IS NOT NULL AND $${paramIndex} IS NOT NULL THEN distance END ASC,
      u.created_at DESC
    LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
  `;

  params.push(userLocation, userLocation, limit, offset);

  const result = await DatabaseService.query(query, params);

  // Filter by distance if specified
  const maxDistanceKm = maxDistance || userPreferences.maxDistance || 100;
  const filteredUsers = result.rows.filter(user => {
    if (!user.distance) return true;
    return user.distance <= maxDistanceKm;
  });

  const potentialMatches = filteredUsers.map(user => ({
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    bio: user.bio,
    age: user.age,
    gender: user.gender,
    photos: user.photos || [],
    distance: user.distance ? Math.round(user.distance) : null,
    createdAt: user.created_at
  }));

  const response: ApiResponse<{ users: Partial<User>[], hasMore: boolean }> = {
    success: true,
    data: {
      users: potentialMatches,
      hasMore: result.rows.length === limit
    }
  };

  res.status(200).json(response);
}));

// Perform match action (like or pass)
router.post('/action', authenticate, requireActiveUser, matchingRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = matchActionSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const userId = req.user!.id;
  const { action, targetUserId }: MatchActionRequest = value;

  if (userId === targetUserId) {
    throw new ValidationError('Cannot perform action on yourself');
  }

  // Check if target user exists and is active
  const targetUserResult = await DatabaseService.query(
    'SELECT id FROM users WHERE id = $1 AND is_active = true',
    [targetUserId]
  );

  if (targetUserResult.rows.length === 0) {
    throw new NotFoundError('Target user not found');
  }

  // Check if match already exists
  const existingMatchResult = await DatabaseService.query(
    'SELECT id, status FROM matches WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
    [userId, targetUserId]
  );

  if (existingMatchResult.rows.length > 0) {
    throw new ConflictError('Match action already performed');
  }

  const client = await DatabaseService.getClient();

  try {
    await client.query('BEGIN');

    if (action === 'like') {
      // Check if target user has already liked current user
      const mutualLikeResult = await client.query(
        'SELECT id FROM matches WHERE user1_id = $1 AND user2_id = $2 AND status = $3',
        [targetUserId, userId, 'pending']
      );

      let matchStatus = 'pending';
      let isMatch = false;

      if (mutualLikeResult.rows.length > 0) {
        // It's a mutual match!
        matchStatus = 'matched';
        isMatch = true;

        // Update the existing match to 'matched'
        await client.query(
          'UPDATE matches SET status = $1, matched_at = NOW(), updated_at = NOW() WHERE id = $2',
          ['matched', mutualLikeResult.rows[0].id]
        );
      }

      // Create new match record
      const matchResult = await client.query(
        `INSERT INTO matches (user1_id, user2_id, status, matched_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, status, matched_at, created_at`,
        [userId, targetUserId, matchStatus, isMatch ? new Date() : null]
      );

      const match = matchResult.rows[0];

      // If it's a match, create conversation
      if (isMatch) {
        await client.query(
          `INSERT INTO conversations (user1_id, user2_id, created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW())`,
          [userId, targetUserId]
        );

        // Cache match in Redis for real-time notifications
        await RedisService.setCache(`new_match:${userId}:${targetUserId}`, JSON.stringify({
          matchId: match.id,
          userId1: userId,
          userId2: targetUserId,
          matchedAt: match.matched_at
        }), 3600); // 1 hour
      }

      await client.query('COMMIT');

      const response: ApiResponse<{ match: boolean, matchId?: string }> = {
        success: true,
        data: {
          match: isMatch,
          matchId: isMatch ? match.id : undefined
        }
      };

      res.status(200).json(response);
    } else {
      // Pass action - just record it
      await client.query(
        `INSERT INTO matches (user1_id, user2_id, status, created_at, updated_at)
         VALUES ($1, $2, 'passed', NOW(), NOW())`,
        [userId, targetUserId]
      );

      await client.query('COMMIT');

      const response: ApiResponse<{ match: boolean }> = {
        success: true,
        data: {
          match: false
        }
      };

      res.status(200).json(response);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// Get user's matches
router.get('/', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = paginationSchema.validate(req.query);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const userId = req.user!.id;
  const { page, limit, status }: PaginationQuery & { status?: string } = value;
  const offset = (page - 1) * limit;

  let statusCondition = '';
  const params: any[] = [userId];
  let paramIndex = 2;

  if (status) {
    statusCondition = `AND m.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  const query = `
    SELECT m.id, m.status, m.matched_at, m.created_at,
           u.id as user_id, u.first_name, u.last_name, u.bio, u.age, 
           u.gender, u.photos, u.last_login
    FROM matches m
    JOIN users u ON (CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END) = u.id
    WHERE (m.user1_id = $1 OR m.user2_id = $1) ${statusCondition}
    ORDER BY 
      CASE WHEN m.status = 'matched' THEN m.matched_at ELSE m.created_at END DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  const result = await DatabaseService.query(query, params);

  const matches = result.rows.map(row => ({
    id: row.id,
    status: row.status,
    matchedAt: row.matched_at,
    createdAt: row.created_at,
    user: {
      id: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      bio: row.bio,
      age: row.age,
      gender: row.gender,
      photos: row.photos || [],
      lastLogin: row.last_login
    }
  }));

  // Get total count
  let countQuery = `
    SELECT COUNT(*) as total
    FROM matches m
    WHERE (m.user1_id = $1 OR m.user2_id = $1)
  `;
  const countParams = [userId];

  if (status) {
    countQuery += ' AND m.status = $2';
    countParams.push(status);
  }

  const countResult = await DatabaseService.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0].total);

  const response: ApiResponse<{
    matches: any[],
    pagination: {
      page: number,
      limit: number,
      total: number,
      totalPages: number,
      hasNext: boolean,
      hasPrev: boolean
    }
  }> = {
    success: true,
    data: {
      matches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1
      }
    }
  };

  res.status(200).json(response);
}));

// Get specific match details
router.get('/:matchId', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { matchId } = req.params;

  const result = await DatabaseService.query(
    `SELECT m.id, m.status, m.matched_at, m.created_at, m.user1_id, m.user2_id,
            u1.first_name as user1_first_name, u1.last_name as user1_last_name,
            u1.photos as user1_photos, u1.age as user1_age, u1.bio as user1_bio,
            u2.first_name as user2_first_name, u2.last_name as user2_last_name,
            u2.photos as user2_photos, u2.age as user2_age, u2.bio as user2_bio
     FROM matches m
     JOIN users u1 ON m.user1_id = u1.id
     JOIN users u2 ON m.user2_id = u2.id
     WHERE m.id = $1 AND (m.user1_id = $2 OR m.user2_id = $2)`,
    [matchId, userId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Match not found');
  }

  const match = result.rows[0];
  const otherUser = match.user1_id === userId ? {
    id: match.user2_id,
    firstName: match.user2_first_name,
    lastName: match.user2_last_name,
    photos: match.user2_photos || [],
    age: match.user2_age,
    bio: match.user2_bio
  } : {
    id: match.user1_id,
    firstName: match.user1_first_name,
    lastName: match.user1_last_name,
    photos: match.user1_photos || [],
    age: match.user1_age,
    bio: match.user1_bio
  };

  const response: ApiResponse<Match> = {
    success: true,
    data: {
      id: match.id,
      status: match.status,
      matchedAt: match.matched_at,
      createdAt: match.created_at,
      user: otherUser
    }
  };

  res.status(200).json(response);
}));

// Unmatch (delete match)
router.delete('/:matchId', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { matchId } = req.params;

  const client = await DatabaseService.getClient();

  try {
    await client.query('BEGIN');

    // Verify match exists and user is part of it
    const matchResult = await client.query(
      'SELECT id, user1_id, user2_id FROM matches WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [matchId, userId]
    );

    if (matchResult.rows.length === 0) {
      throw new NotFoundError('Match not found');
    }

    const match = matchResult.rows[0];
    const otherUserId = match.user1_id === userId ? match.user2_id : match.user1_id;

    // Delete associated conversation and messages
    await client.query(
      'DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1))',
      [userId, otherUserId]
    );

    await client.query(
      'DELETE FROM conversations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
      [userId, otherUserId]
    );

    // Delete match
    await client.query('DELETE FROM matches WHERE id = $1', [matchId]);

    // Clear cache
    await RedisService.deleteCache(`new_match:${userId}:${otherUserId}`);
    await RedisService.deleteCache(`new_match:${otherUserId}:${userId}`);

    await client.query('COMMIT');

    const response: ApiResponse = {
      success: true,
      data: {
        message: 'Match deleted successfully'
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

export { router as matchRoutes };