import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { DatabaseService } from '../services/database';
import { RedisService } from '../services/redis';
import { authenticate, requireActiveUser } from '../middleware/auth';
import { createRateLimitMiddleware } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError, NotFoundError, AuthorizationError } from '../middleware/errorHandler';
import {
  ApiResponse,
  Message,
  Conversation,
  SendMessageRequest,
  PaginationQuery
} from '../types';

const router = Router();

// Rate limiting
const messagingRateLimit = createRateLimitMiddleware('messaging');

// Validation schemas
const sendMessageSchema = Joi.object({
  conversationId: Joi.string().uuid().required(),
  content: Joi.string().min(1).max(1000).required(),
  messageType: Joi.string().valid('text', 'image', 'emoji').default('text')
});

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  before: Joi.string().isoDate().optional() // For cursor-based pagination
});

// Helper function to check if users are matched
const checkUsersMatched = async (userId1: string, userId2: string): Promise<boolean> => {
  const result = await DatabaseService.query(
    `SELECT id FROM matches 
     WHERE ((user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)) 
     AND status = 'matched'`,
    [userId1, userId2]
  );
  return result.rows.length > 0;
};

// Get user's conversations
router.get('/conversations', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = paginationSchema.validate(req.query);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const userId = req.user!.id;
  const { page, limit }: PaginationQuery = value;
  const offset = (page - 1) * limit;

  const query = `
    SELECT c.id, c.created_at, c.updated_at,
           u.id as other_user_id, u.first_name, u.last_name, u.photos,
           m.content as last_message_content, m.created_at as last_message_at,
           m.sender_id as last_message_sender_id,
           COALESCE(unread.unread_count, 0) as unread_count
    FROM conversations c
    JOIN users u ON (CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END) = u.id
    LEFT JOIN LATERAL (
      SELECT content, created_at, sender_id
      FROM messages 
      WHERE conversation_id = c.id 
      ORDER BY created_at DESC 
      LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) as unread_count
      FROM messages 
      WHERE conversation_id = c.id 
        AND sender_id != $1 
        AND read_at IS NULL
    ) unread ON true
    WHERE (c.user1_id = $1 OR c.user2_id = $1)
      AND u.is_active = true
    ORDER BY COALESCE(m.created_at, c.created_at) DESC
    LIMIT $2 OFFSET $3
  `;

  const result = await DatabaseService.query(query, [userId, limit, offset]);

  const conversations = result.rows.map(row => ({
    id: row.id,
    otherUser: {
      id: row.other_user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      photos: row.photos || []
    },
    lastMessage: row.last_message_content ? {
      content: row.last_message_content,
      createdAt: row.last_message_at,
      isFromCurrentUser: row.last_message_sender_id === userId
    } : null,
    unreadCount: parseInt(row.unread_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));

  // Get total count
  const countResult = await DatabaseService.query(
    `SELECT COUNT(*) as total
     FROM conversations c
     JOIN users u ON (CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END) = u.id
     WHERE (c.user1_id = $1 OR c.user2_id = $1) AND u.is_active = true`,
    [userId]
  );
  const total = parseInt(countResult.rows[0].total);

  const response: ApiResponse<{
    conversations: any[],
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
      conversations,
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

// Get specific conversation
router.get('/conversations/:conversationId', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { conversationId } = req.params;

  // Verify user is part of the conversation
  const conversationResult = await DatabaseService.query(
    `SELECT c.id, c.user1_id, c.user2_id, c.created_at,
            u.id as other_user_id, u.first_name, u.last_name, u.photos, u.last_login
     FROM conversations c
     JOIN users u ON (CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END) = u.id
     WHERE c.id = $2 AND (c.user1_id = $1 OR c.user2_id = $1)`,
    [userId, conversationId]
  );

  if (conversationResult.rows.length === 0) {
    throw new NotFoundError('Conversation not found');
  }

  const conversation = conversationResult.rows[0];

  const response: ApiResponse<Conversation> = {
    success: true,
    data: {
      id: conversation.id,
      otherUser: {
        id: conversation.other_user_id,
        firstName: conversation.first_name,
        lastName: conversation.last_name,
        photos: conversation.photos || [],
        lastLogin: conversation.last_login
      },
      createdAt: conversation.created_at
    }
  };

  res.status(200).json(response);
}));

// Get messages in a conversation
router.get('/conversations/:conversationId/messages', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = paginationSchema.validate(req.query);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const userId = req.user!.id;
  const { conversationId } = req.params;
  const { page, limit, before }: PaginationQuery & { before?: string } = value;

  // Verify user is part of the conversation
  const conversationResult = await DatabaseService.query(
    'SELECT id FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
    [conversationId, userId]
  );

  if (conversationResult.rows.length === 0) {
    throw new NotFoundError('Conversation not found');
  }

  // Build query with optional cursor-based pagination
  let query = `
    SELECT m.id, m.content, m.message_type, m.sender_id, m.read_at, m.created_at,
           u.first_name, u.last_name
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = $1
  `;
  const params: any[] = [conversationId];
  let paramIndex = 2;

  if (before) {
    query += ` AND m.created_at < $${paramIndex}`;
    params.push(before);
    paramIndex++;
  }

  query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  if (!before) {
    // Only use offset for first page when not using cursor pagination
    const offset = (page - 1) * limit;
    query += ` OFFSET $${paramIndex + 1}`;
    params.push(offset);
  }

  const result = await DatabaseService.query(query, params);

  const messages = result.rows.map(row => ({
    id: row.id,
    content: row.content,
    messageType: row.message_type,
    senderId: row.sender_id,
    senderName: `${row.first_name} ${row.last_name}`,
    isFromCurrentUser: row.sender_id === userId,
    readAt: row.read_at,
    createdAt: row.created_at
  }));

  // Mark messages as read
  await DatabaseService.query(
    `UPDATE messages SET read_at = NOW() 
     WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
    [conversationId, userId]
  );

  const response: ApiResponse<{
    messages: any[],
    hasMore: boolean,
    nextCursor?: string
  }> = {
    success: true,
    data: {
      messages: messages.reverse(), // Reverse to show oldest first
      hasMore: result.rows.length === limit,
      nextCursor: result.rows.length === limit ? result.rows[result.rows.length - 1].created_at : undefined
    }
  };

  res.status(200).json(response);
}));

// Send a message
router.post('/send', authenticate, requireActiveUser, messagingRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const { error, value } = sendMessageSchema.validate(req.body);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }

  const userId = req.user!.id;
  const { conversationId, content, messageType }: SendMessageRequest = value;

  // Verify user is part of the conversation
  const conversationResult = await DatabaseService.query(
    'SELECT user1_id, user2_id FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
    [conversationId, userId]
  );

  if (conversationResult.rows.length === 0) {
    throw new NotFoundError('Conversation not found');
  }

  const conversation = conversationResult.rows[0];
  const otherUserId = conversation.user1_id === userId ? conversation.user2_id : conversation.user1_id;

  // Verify users are still matched
  const isMatched = await checkUsersMatched(userId, otherUserId);
  if (!isMatched) {
    throw new AuthorizationError('Users are no longer matched');
  }

  const client = await DatabaseService.getClient();

  try {
    await client.query('BEGIN');

    // Insert message
    const messageResult = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, content, message_type, sender_id, created_at`,
      [conversationId, userId, content, messageType]
    );

    const message = messageResult.rows[0];

    // Update conversation timestamp
    await client.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [conversationId]
    );

    await client.query('COMMIT');

    // Cache new message for real-time notifications
    await RedisService.setCache(`new_message:${conversationId}:${message.id}`, JSON.stringify({
      messageId: message.id,
      conversationId,
      senderId: userId,
      content: message.content,
      messageType: message.message_type,
      createdAt: message.created_at,
      recipientId: otherUserId
    }), 3600); // 1 hour

    // Get sender info for response
    const senderResult = await DatabaseService.query(
      'SELECT first_name, last_name FROM users WHERE id = $1',
      [userId]
    );
    const sender = senderResult.rows[0];

    const response: ApiResponse<Message> = {
      success: true,
      data: {
        id: message.id,
        content: message.content,
        messageType: message.message_type,
        senderId: message.sender_id,
        senderName: `${sender.first_name} ${sender.last_name}`,
        isFromCurrentUser: true,
        readAt: null,
        createdAt: message.created_at
      }
    };

    res.status(201).json(response);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// Mark conversation as read
router.patch('/conversations/:conversationId/read', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { conversationId } = req.params;

  // Verify user is part of the conversation
  const conversationResult = await DatabaseService.query(
    'SELECT id FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
    [conversationId, userId]
  );

  if (conversationResult.rows.length === 0) {
    throw new NotFoundError('Conversation not found');
  }

  // Mark all unread messages as read
  const result = await DatabaseService.query(
    `UPDATE messages SET read_at = NOW() 
     WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL
     RETURNING id`,
    [conversationId, userId]
  );

  const response: ApiResponse<{ markedAsRead: number }> = {
    success: true,
    data: {
      markedAsRead: result.rows.length
    }
  };

  res.status(200).json(response);
}));

// Get unread message count
router.get('/unread-count', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const result = await DatabaseService.query(
    `SELECT COUNT(*) as unread_count
     FROM messages m
     JOIN conversations c ON m.conversation_id = c.id
     WHERE (c.user1_id = $1 OR c.user2_id = $1)
       AND m.sender_id != $1
       AND m.read_at IS NULL`,
    [userId]
  );

  const unreadCount = parseInt(result.rows[0].unread_count);

  const response: ApiResponse<{ unreadCount: number }> = {
    success: true,
    data: {
      unreadCount
    }
  };

  res.status(200).json(response);
}));

// Delete a message (soft delete)
router.delete('/:messageId', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { messageId } = req.params;

  // Verify message exists and user is the sender
  const messageResult = await DatabaseService.query(
    `SELECT m.id, m.conversation_id, c.user1_id, c.user2_id
     FROM messages m
     JOIN conversations c ON m.conversation_id = c.id
     WHERE m.id = $1 AND m.sender_id = $2`,
    [messageId, userId]
  );

  if (messageResult.rows.length === 0) {
    throw new NotFoundError('Message not found or unauthorized');
  }

  // Soft delete the message
  await DatabaseService.query(
    `UPDATE messages SET content = '[Message deleted]', message_type = 'deleted', updated_at = NOW()
     WHERE id = $1`,
    [messageId]
  );

  const response: ApiResponse = {
    success: true,
    data: {
      message: 'Message deleted successfully'
    }
  };

  res.status(200).json(response);
}));

// Search messages in conversations
router.get('/search', authenticate, requireActiveUser, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { q: query, page = 1, limit = 20 } = req.query;

  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    throw new ValidationError('Search query must be at least 2 characters long');
  }

  const offset = (Number(page) - 1) * Number(limit);

  const searchResult = await DatabaseService.query(
    `SELECT m.id, m.content, m.message_type, m.sender_id, m.created_at,
            c.id as conversation_id,
            u1.first_name as sender_first_name, u1.last_name as sender_last_name,
            u2.id as other_user_id, u2.first_name as other_user_first_name, 
            u2.last_name as other_user_last_name
     FROM messages m
     JOIN conversations c ON m.conversation_id = c.id
     JOIN users u1 ON m.sender_id = u1.id
     JOIN users u2 ON (CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END) = u2.id
     WHERE (c.user1_id = $1 OR c.user2_id = $1)
       AND m.content ILIKE $2
       AND m.message_type != 'deleted'
     ORDER BY m.created_at DESC
     LIMIT $3 OFFSET $4`,
    [userId, `%${query}%`, Number(limit), offset]
  );

  const messages = searchResult.rows.map(row => ({
    id: row.id,
    content: row.content,
    messageType: row.message_type,
    senderId: row.sender_id,
    senderName: `${row.sender_first_name} ${row.sender_last_name}`,
    isFromCurrentUser: row.sender_id === userId,
    createdAt: row.created_at,
    conversation: {
      id: row.conversation_id,
      otherUser: {
        id: row.other_user_id,
        firstName: row.other_user_first_name,
        lastName: row.other_user_last_name
      }
    }
  }));

  const response: ApiResponse<{ messages: any[], query: string }> = {
    success: true,
    data: {
      messages,
      query: query.toString()
    }
  };

  res.status(200).json(response);
}));

export { router as messageRoutes };