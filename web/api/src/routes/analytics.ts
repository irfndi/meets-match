import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../middleware/errorHandler';
import {
  ApiResponse,
  Analytics,
  AnalyticsEventRequest
} from '../types';

const router = Router();

// Validation schemas
const trackEventSchema = Joi.object({
  eventType: Joi.string().valid(
    'profile_view', 'photo_view', 'swipe_right', 'swipe_left', 
    'message_sent', 'message_received', 'match_created', 'conversation_started',
    'app_open', 'app_close', 'profile_edit', 'photo_upload', 'settings_change'
  ).required(),
  eventData: Joi.object().optional(),
  targetUserId: Joi.string().uuid().optional()
});

const dateRangeSchema = Joi.object({
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  period: Joi.string().valid('day', 'week', 'month', 'year').default('week')
});

// Track analytics event
router.post('/track', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = trackEventSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const userId = req.user!.id;
  const { eventType, eventData, targetUserId }: AnalyticsEventRequest = value;

  // Insert analytics event
  await DatabaseService.query(
    `INSERT INTO analytics (user_id, event_type, event_data, target_user_id, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [userId, eventType, eventData ? JSON.stringify(eventData) : null, targetUserId]
  );

  // Cache recent events for real-time analytics
  const cacheKey = `analytics:recent:${userId}`;
  const recentEvents = await RedisService.get(cacheKey) ? JSON.parse(await RedisService.get(cacheKey) as string) : [];
  recentEvents.unshift({
    eventType,
    eventData,
    targetUserId,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 100 events
  if (recentEvents.length > 100) {
    recentEvents.splice(100);
  }
  
  await RedisService.set(cacheKey, JSON.stringify(recentEvents), 86400); // 24 hours

  const response: ApiResponse = {
    success: true,
    data: {
      message: 'Event tracked successfully'
    }
  };

  res.status(201).json(response);
}));

// Get user's analytics summary
router.get('/summary', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = dateRangeSchema.validate(req.query);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const userId = req.user!.id;
  const { startDate, endDate, period } = value;

  // Calculate date range
  let dateFilter = '';
  const params: any[] = [userId];
  let paramIndex = 2;

  if (startDate && endDate) {
    dateFilter = ` AND created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
    params.push(startDate, endDate);
    paramIndex += 2;
  } else {
    // Default to last period
    const intervals = {
      day: '1 day',
      week: '1 week', 
      month: '1 month',
      year: '1 year'
    };
    dateFilter = ` AND created_at >= NOW() - INTERVAL '${intervals[period as keyof typeof intervals]}'`;
  }

  // Get event counts by type
  const eventCountsResult = await DatabaseService.query(
    `SELECT event_type, COUNT(*) as count
     FROM analytics
     WHERE user_id = $1 ${dateFilter}
     GROUP BY event_type
     ORDER BY count DESC`,
    params
  );

  const eventCounts = eventCountsResult.rows.reduce((acc: any, row: any) => {
    acc[row.event_type] = parseInt(row.count);
    return acc;
  }, {});

  // Get daily activity for the period
  const dailyActivityResult = await DatabaseService.query(
    `SELECT DATE(created_at) as date, COUNT(*) as events
     FROM analytics
     WHERE user_id = $1 ${dateFilter}
     GROUP BY DATE(created_at)
     ORDER BY date DESC
     LIMIT 30`,
    params
  );

  const dailyActivity = dailyActivityResult.rows.map((row: any) => ({
    date: row.date,
    events: parseInt(row.events)
  }));

  // Get profile views received
  const profileViewsResult = await DatabaseService.query(
    `SELECT COUNT(*) as views
     FROM analytics
     WHERE target_user_id = $1 AND event_type = 'profile_view' ${dateFilter}`,
    params
  );

  const profileViews = parseInt(profileViewsResult.rows[0].views);

  // Get match statistics
  const matchStatsResult = await DatabaseService.query(
    `SELECT 
       COUNT(CASE WHEN status = 'matched' THEN 1 END) as matches,
       COUNT(CASE WHEN status = 'liked' AND user1_id = $1 THEN 1 END) as likes_sent,
       COUNT(CASE WHEN status = 'liked' AND user2_id = $1 THEN 1 END) as likes_received
     FROM matches
     WHERE (user1_id = $1 OR user2_id = $1) ${dateFilter.replace('created_at', 'matches.created_at')}`,
    params
  );

  const matchStats = matchStatsResult.rows[0];

  // Get message statistics
  const messageStatsResult = await DatabaseService.query(
    `SELECT 
       COUNT(CASE WHEN sender_id = $1 THEN 1 END) as messages_sent,
       COUNT(CASE WHEN sender_id != $1 THEN 1 END) as messages_received
     FROM messages m
     JOIN conversations c ON m.conversation_id = c.id
     WHERE (c.user1_id = $1 OR c.user2_id = $1) ${dateFilter.replace('created_at', 'm.created_at')}`,
    params
  );

  const messageStats = messageStatsResult.rows[0];

  const response: ApiResponse<{
    eventCounts: Record<string, number>,
    dailyActivity: Array<{ date: string, events: number }>,
    profileViews: number,
    matchStats: {
      matches: number,
      likesSent: number,
      likesReceived: number,
      matchRate: number
    },
    messageStats: {
      messagesSent: number,
      messagesReceived: number
    }
  }> = {
    success: true,
    data: {
      eventCounts,
      dailyActivity,
      profileViews,
      matchStats: {
        matches: parseInt(matchStats.matches),
        likesSent: parseInt(matchStats.likes_sent),
        likesReceived: parseInt(matchStats.likes_received),
        matchRate: parseInt(matchStats.likes_sent) > 0 
          ? Math.round((parseInt(matchStats.matches) / parseInt(matchStats.likes_sent)) * 100)
          : 0
      },
      messageStats: {
        messagesSent: parseInt(messageStats.messages_sent),
        messagesReceived: parseInt(messageStats.messages_received)
      }
    }
  };

  res.status(200).json(response);
}));

// Get user engagement metrics
router.get('/engagement', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  // Get session data from last 30 days
  const sessionResult = await DatabaseService.query(
    `SELECT 
       COUNT(*) as total_sessions,
       AVG(EXTRACT(EPOCH FROM (logout_at - login_at))/60) as avg_session_duration,
       MAX(login_at) as last_login
     FROM user_sessions
     WHERE user_id = $1 AND login_at >= NOW() - INTERVAL '30 days'`,
    [userId]
  );

  const sessionData = sessionResult.rows[0];

  // Get activity streaks
  const streakResult = await DatabaseService.query(
    `WITH daily_activity AS (
       SELECT DATE(created_at) as activity_date
       FROM analytics
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '90 days'
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) DESC
     ),
     streak_data AS (
       SELECT 
         activity_date,
         activity_date - ROW_NUMBER() OVER (ORDER BY activity_date) * INTERVAL '1 day' as streak_group
       FROM daily_activity
     )
     SELECT 
       COUNT(*) as current_streak,
       MIN(activity_date) as streak_start,
       MAX(activity_date) as streak_end
     FROM streak_data
     WHERE streak_group = (
       SELECT streak_group 
       FROM streak_data 
       WHERE activity_date = CURRENT_DATE
       LIMIT 1
     )
     GROUP BY streak_group`,
    [userId]
  );

  const currentStreak = streakResult.rows.length > 0 ? parseInt(streakResult.rows[0].current_streak) : 0;

  // Get response rate
  const responseRateResult = await DatabaseService.query(
    `WITH message_threads AS (
       SELECT 
         conversation_id,
         sender_id,
         LAG(sender_id) OVER (PARTITION BY conversation_id ORDER BY created_at) as prev_sender
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE (c.user1_id = $1 OR c.user2_id = $1)
         AND m.created_at >= NOW() - INTERVAL '30 days'
     )
     SELECT 
       COUNT(CASE WHEN sender_id = $1 AND prev_sender != $1 THEN 1 END) as responses_sent,
       COUNT(CASE WHEN sender_id != $1 AND prev_sender = $1 THEN 1 END) as responses_received,
       COUNT(CASE WHEN prev_sender != $1 AND prev_sender IS NOT NULL THEN 1 END) as messages_to_respond_to
     FROM message_threads`,
    [userId]
  );

  const responseData = responseRateResult.rows[0];
  const responseRate = parseInt(responseData.messages_to_respond_to) > 0
    ? Math.round((parseInt(responseData.responses_sent) / parseInt(responseData.messages_to_respond_to)) * 100)
    : 0;

  // Get popular times
  const popularTimesResult = await DatabaseService.query(
    `SELECT 
       EXTRACT(HOUR FROM created_at) as hour,
       COUNT(*) as activity_count
     FROM analytics
     WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
     GROUP BY EXTRACT(HOUR FROM created_at)
     ORDER BY activity_count DESC
     LIMIT 5`,
    [userId]
  );

  const popularTimes = popularTimesResult.rows.map((row: any) => ({
    hour: parseInt(row.hour),
    activityCount: parseInt(row.activity_count)
  }));

  const response: ApiResponse<{
    sessions: {
      totalSessions: number,
      avgSessionDuration: number,
      lastLogin: string | null
    },
    streak: {
      currentStreak: number,
      streakStart?: string,
      streakEnd?: string
    },
    responseRate: number,
    popularTimes: Array<{ hour: number, activityCount: number }>
  }> = {
    success: true,
    data: {
      sessions: {
        totalSessions: parseInt(sessionData.total_sessions),
        avgSessionDuration: parseFloat(sessionData.avg_session_duration) || 0,
        lastLogin: sessionData.last_login
      },
      streak: {
        currentStreak,
        streakStart: streakResult.rows[0]?.streak_start,
        streakEnd: streakResult.rows[0]?.streak_end
      },
      responseRate,
      popularTimes
    }
  };

  res.status(200).json(response);
}));

// Admin: Get platform analytics (requires admin authorization)
router.get('/platform', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = dateRangeSchema.validate(req.query);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const { startDate, endDate, period } = value;

  // Calculate date range
  let dateFilter = '';
  const params: any[] = [];
  let paramIndex = 1;

  if (startDate && endDate) {
    dateFilter = ` WHERE created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
    params.push(startDate, endDate);
    paramIndex += 2;
  } else {
    const intervals = {
      day: '1 day',
      week: '1 week',
      month: '1 month', 
      year: '1 year'
    };
    dateFilter = ` WHERE created_at >= NOW() - INTERVAL '${intervals[period as keyof typeof intervals]}'`;
  }

  // Get user statistics
  const userStatsResult = await DatabaseService.query(
    `SELECT 
       COUNT(*) as total_users,
       COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
       COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_users_week,
       COUNT(CASE WHEN last_login >= NOW() - INTERVAL '24 hours' THEN 1 END) as daily_active_users
     FROM users ${dateFilter.replace('created_at', 'users.created_at')}`,
    params
  );

  const userStats = userStatsResult.rows[0];

  // Get match statistics
  const matchStatsResult = await DatabaseService.query(
    `SELECT 
       COUNT(*) as total_matches,
       COUNT(CASE WHEN status = 'matched' THEN 1 END) as successful_matches,
       AVG(CASE WHEN status = 'matched' THEN 
         EXTRACT(EPOCH FROM (updated_at - created_at))/3600 
       END) as avg_time_to_match_hours
     FROM matches ${dateFilter.replace('created_at', 'matches.created_at')}`,
    params
  );

  const matchStats = matchStatsResult.rows[0];

  // Get message statistics
  const messageStatsResult = await DatabaseService.query(
    `SELECT 
       COUNT(*) as total_messages,
       COUNT(DISTINCT conversation_id) as active_conversations,
       AVG(LENGTH(content)) as avg_message_length
     FROM messages ${dateFilter.replace('created_at', 'messages.created_at')}`,
    params
  );

  const messageStats = messageStatsResult.rows[0];

  // Get top events
  const topEventsResult = await DatabaseService.query(
    `SELECT event_type, COUNT(*) as count
     FROM analytics ${dateFilter}
     GROUP BY event_type
     ORDER BY count DESC
     LIMIT 10`,
    params
  );

  const topEvents = topEventsResult.rows.map((row: any) => ({
    eventType: row.event_type,
    count: parseInt(row.count)
  }));

  // Get retention data (7-day retention)
  const retentionResult = await DatabaseService.query(
    `WITH user_cohorts AS (
       SELECT 
         user_id,
         DATE(created_at) as signup_date,
         MIN(DATE(created_at)) OVER () as cohort_start
       FROM users
       WHERE created_at >= NOW() - INTERVAL '30 days'
     ),
     user_activity AS (
       SELECT DISTINCT
         a.user_id,
         DATE(a.created_at) as activity_date
       FROM analytics a
       JOIN user_cohorts uc ON a.user_id = uc.user_id
       WHERE a.created_at >= NOW() - INTERVAL '30 days'
     )
     SELECT 
       uc.signup_date,
       COUNT(DISTINCT uc.user_id) as cohort_size,
       COUNT(DISTINCT CASE WHEN ua.activity_date >= uc.signup_date + INTERVAL '7 days' 
                           AND ua.activity_date < uc.signup_date + INTERVAL '14 days'
                      THEN uc.user_id END) as retained_users
     FROM user_cohorts uc
     LEFT JOIN user_activity ua ON uc.user_id = ua.user_id
     GROUP BY uc.signup_date
     HAVING COUNT(DISTINCT uc.user_id) >= 5
     ORDER BY uc.signup_date DESC
     LIMIT 10`,
    []
  );

  const retention = retentionResult.rows.map((row: any) => ({
    signupDate: row.signup_date,
    cohortSize: parseInt(row.cohort_size),
    retainedUsers: parseInt(row.retained_users),
    retentionRate: parseInt(row.cohort_size) > 0 
      ? Math.round((parseInt(row.retained_users) / parseInt(row.cohort_size)) * 100)
      : 0
  }));

  const response: ApiResponse<{
    userStats: {
      totalUsers: number,
      activeUsers: number,
      newUsersWeek: number,
      dailyActiveUsers: number
    },
    matchStats: {
      totalMatches: number,
      successfulMatches: number,
      avgTimeToMatchHours: number,
      successRate: number
    },
    messageStats: {
      totalMessages: number,
      activeConversations: number,
      avgMessageLength: number
    },
    topEvents: Array<{ eventType: string, count: number }>,
    retention: Array<{
      signupDate: string,
      cohortSize: number,
      retainedUsers: number,
      retentionRate: number
    }>
  }> = {
    success: true,
    data: {
      userStats: {
        totalUsers: parseInt(userStats.total_users),
        activeUsers: parseInt(userStats.active_users),
        newUsersWeek: parseInt(userStats.new_users_week),
        dailyActiveUsers: parseInt(userStats.daily_active_users)
      },
      matchStats: {
        totalMatches: parseInt(matchStats.total_matches),
        successfulMatches: parseInt(matchStats.successful_matches),
        avgTimeToMatchHours: parseFloat(matchStats.avg_time_to_match_hours) || 0,
        successRate: parseInt(matchStats.total_matches) > 0
          ? Math.round((parseInt(matchStats.successful_matches) / parseInt(matchStats.total_matches)) * 100)
          : 0
      },
      messageStats: {
        totalMessages: parseInt(messageStats.total_messages),
        activeConversations: parseInt(messageStats.active_conversations),
        avgMessageLength: parseFloat(messageStats.avg_message_length) || 0
      },
      topEvents,
      retention
    }
  };

  res.status(200).json(response);
}));

// Get analytics events for a user (admin only)
router.get('/events/:userId', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { page = 1, limit = 50, eventType } = req.query;

  const offset = (Number(page) - 1) * Number(limit);
  
  let query = `
    SELECT a.id, a.event_type, a.event_data, a.target_user_id, a.created_at,
           u.first_name, u.last_name,
           tu.first_name as target_first_name, tu.last_name as target_last_name
    FROM analytics a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN users tu ON a.target_user_id = tu.id
    WHERE a.user_id = $1
  `;
  
  const params: any[] = [userId];
  let paramIndex = 2;
  
  if (eventType && typeof eventType === 'string') {
    query += ` AND a.event_type = $${paramIndex}`;
    params.push(eventType);
    paramIndex++;
  }
  
  query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(Number(limit), offset);

  const result = await DatabaseService.query(query, params);

  const events = result.rows.map((row: any) => ({
    id: row.id,
    eventType: row.event_type,
    eventData: row.event_data,
    targetUser: row.target_user_id ? {
      id: row.target_user_id,
      firstName: row.target_first_name,
      lastName: row.target_last_name
    } : null,
    createdAt: row.created_at
  }));

  const response: ApiResponse<{ events: any[] }> = {
    success: true,
    data: {
      events
    }
  };

  res.status(200).json(response);
}));

export { router as analyticsRoutes };