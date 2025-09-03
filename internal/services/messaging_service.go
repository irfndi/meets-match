package services

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/meetsmatch/meetsmatch/internal/database"
	"github.com/meetsmatch/meetsmatch/internal/telemetry"
)

type Message = database.Message
type Conversation = database.Conversation

type MessagingService struct {
	db *database.DB
}

func NewMessagingService(db *database.DB) *MessagingService {
	return &MessagingService{db: db}
}

func (s *MessagingService) SendMessage(senderID, receiverID, content, messageType string) (*Message, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"sender_id":    senderID,
		"receiver_id":  receiverID,
		"message_type": messageType,
		"operation":    "send_message",
	})

	logger.Info("Attempting to send message")
	// Check if users have a mutual match
	conversation, err := s.getOrCreateConversation(senderID, receiverID)
	if err != nil {
		logger.WithError(err).Error("Failed to get conversation for messaging")
		return nil, err
	}

	if conversation == nil {
		logger.Warn("No mutual match found between users")
		return nil, fmt.Errorf("no mutual match found between users")
	}

	// Create the message
	message := &Message{
		ID:          uuid.New().String(),
		MatchID:     conversation.MatchID,
		SenderID:    senderID,
		ReceiverID:  receiverID,
		Content:     content,
		MessageType: messageType,
		IsRead:      false,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err = s.db.WithTransaction(func(tx *sql.Tx) error {
		// Insert the message
		query := `
			INSERT INTO messages (id, match_id, sender_id, receiver_id, content, message_type, is_read, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id
		`

		insertErr := tx.QueryRow(
			query,
			message.ID, message.MatchID, message.SenderID, message.ReceiverID,
			message.Content, message.MessageType, message.IsRead,
			message.CreatedAt, message.UpdatedAt,
		).Scan(&message.ID)

		if insertErr != nil {
			return insertErr
		}

		// Update conversation's last activity and last message
		updateConvQuery := `
			UPDATE conversations 
			SET last_message = $1, last_activity = $2, updated_at = $3
			WHERE id = $4
		`
		_, err = tx.Exec(updateConvQuery, content, time.Now(), time.Now(), conversation.ID)
		if err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		logger.WithError(err).Error("Failed to send message in transaction")
		return nil, err
	}

	logger.WithField("message_id", message.ID).Info("Successfully sent message")
	return message, nil
}

func (s *MessagingService) getOrCreateConversation(user1ID, user2ID string) (*Conversation, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user1_id":  user1ID,
		"user2_id":  user2ID,
		"operation": "get_or_create_conversation",
	})

	logger.Debug("Getting or creating conversation")
	// First, try to find existing conversation
	conversation := &Conversation{}
	query := `
		SELECT c.id, c.match_id, c.user1_id, c.user2_id, c.last_message, c.last_activity, c.created_at, c.updated_at
		FROM conversations c
		INNER JOIN matches m ON c.match_id = m.id
		WHERE ((c.user1_id = $1 AND c.user2_id = $2) OR (c.user1_id = $2 AND c.user2_id = $1))
		  AND m.status = 'mutual'
	`

	err := s.db.QueryRow(query, user1ID, user2ID).Scan(
		&conversation.ID, &conversation.MatchID, &conversation.User1ID, &conversation.User2ID,
		&conversation.LastMessage, &conversation.LastActivity,
		&conversation.CreatedAt, &conversation.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			logger.Warn("No mutual match found for conversation")
			return nil, nil // No mutual match found
		}
		logger.WithError(err).Error("Failed to get conversation")
		return nil, err
	}

	logger.WithField("conversation_id", conversation.ID).Info("Successfully retrieved conversation")
	return conversation, nil
}

func (s *MessagingService) GetConversations(userID string, limit, offset int) ([]*Conversation, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"limit":     limit,
		"offset":    offset,
		"operation": "get_conversations",
	})

	logger.Debug("Fetching user conversations")
	query := `
		SELECT id, match_id, user1_id, user2_id, last_message, last_activity, created_at, updated_at
		FROM conversations 
		WHERE user1_id = $1 OR user2_id = $1
		ORDER BY last_activity DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := s.db.Query(query, userID, limit, offset)
	if err != nil {
		logger.WithError(err).Error("Failed to query conversations")
		return nil, err
	}
	defer rows.Close()

	var conversations []*Conversation
	for rows.Next() {
		conv := &Conversation{}
		scanErr := rows.Scan(
			&conv.ID, &conv.MatchID, &conv.User1ID, &conv.User2ID,
			&conv.LastMessage, &conv.LastActivity,
			&conv.CreatedAt, &conv.UpdatedAt,
		)
		if scanErr != nil {
			logger.WithError(scanErr).Error("Failed to scan conversation row")
			return nil, scanErr
		}
		conversations = append(conversations, conv)
	}

	if err = rows.Err(); err != nil {
		logger.WithError(err).Error("Error iterating conversation rows")
		return nil, err
	}

	logger.WithField("count", len(conversations)).Info("Successfully retrieved conversations")
	return conversations, nil
}

func (s *MessagingService) GetMessages(conversationID string, limit, offset int) ([]*Message, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"conversation_id": conversationID,
		"limit":           limit,
		"offset":          offset,
		"operation":       "get_messages",
	})

	logger.Debug("Fetching conversation messages")
	query := `
		SELECT m.id, m.match_id, m.sender_id, m.receiver_id, m.content, m.message_type, m.is_read, m.created_at, m.updated_at
		FROM messages m
		INNER JOIN conversations c ON m.match_id = c.match_id
		WHERE c.id = $1
		ORDER BY m.created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := s.db.Query(query, conversationID, limit, offset)
	if err != nil {
		logger.WithError(err).Error("Failed to query messages")
		return nil, fmt.Errorf("failed to get messages: %w", err)
	}
	defer rows.Close()

	var messages []*Message
	for rows.Next() {
		msg := &Message{}
		scanErr := rows.Scan(
			&msg.ID, &msg.MatchID, &msg.SenderID, &msg.ReceiverID,
			&msg.Content, &msg.MessageType, &msg.IsRead,
			&msg.CreatedAt, &msg.UpdatedAt,
		)
		if scanErr != nil {
			logger.WithError(scanErr).Error("Failed to scan message row")
			return nil, fmt.Errorf("failed to scan message: %w", scanErr)
		}
		messages = append(messages, msg)
	}

	if err = rows.Err(); err != nil {
		logger.WithError(err).Error("Error iterating message rows")
		return nil, fmt.Errorf("error iterating messages: %w", err)
	}

	logger.WithField("count", len(messages)).Info("Successfully retrieved messages")
	return messages, nil
}

func (s *MessagingService) GetMessagesBetweenUsers(user1ID, user2ID string, limit, offset int) ([]*Message, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user1_id":  user1ID,
		"user2_id":  user2ID,
		"limit":     limit,
		"offset":    offset,
		"operation": "get_messages_between_users",
	})

	logger.Debug("Fetching messages between users")
	query := `
		SELECT id, match_id, sender_id, receiver_id, content, message_type, is_read, created_at, updated_at
		FROM messages 
		WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := s.db.Query(query, user1ID, user2ID, limit, offset)
	if err != nil {
		logger.WithError(err).Error("Failed to query messages between users")
		return nil, fmt.Errorf("failed to get messages between users: %w", err)
	}
	defer rows.Close()

	var messages []*Message
	for rows.Next() {
		msg := &Message{}
		scanErr := rows.Scan(
			&msg.ID, &msg.MatchID, &msg.SenderID, &msg.ReceiverID,
			&msg.Content, &msg.MessageType, &msg.IsRead,
			&msg.CreatedAt, &msg.UpdatedAt,
		)
		if scanErr != nil {
			logger.WithError(scanErr).Error("Failed to scan message row")
			return nil, fmt.Errorf("failed to scan message: %w", scanErr)
		}
		messages = append(messages, msg)
	}

	if err = rows.Err(); err != nil {
		logger.WithError(err).Error("Error iterating message rows")
		return nil, fmt.Errorf("error iterating messages: %w", err)
	}

	logger.WithField("count", len(messages)).Info("Successfully retrieved messages between users")
	return messages, nil
}

func (s *MessagingService) MarkMessageAsRead(messageID string) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"message_id": messageID,
		"operation":  "mark_message_read",
	})

	logger.Debug("Marking message as read")
	query := `UPDATE messages SET is_read = true, updated_at = $1 WHERE id = $2`
	_, err := s.db.Exec(query, time.Now(), messageID)
	if err != nil {
		logger.WithError(err).Error("Failed to mark message as read")
		return fmt.Errorf("failed to mark message as read: %w", err)
	}
	logger.Info("Successfully marked message as read")
	return nil
}

func (s *MessagingService) MarkConversationAsRead(conversationID, userID string) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"conversation_id": conversationID,
		"user_id":         userID,
		"operation":       "mark_conversation_read",
	})

	logger.Debug("Marking conversation as read")
	// Mark all unread messages in the conversation as read for the user
	query := `
		UPDATE messages 
		SET is_read = true, updated_at = $1
		WHERE match_id IN (
			SELECT match_id FROM conversations WHERE id = $2
		) AND receiver_id = $3 AND is_read = false
	`
	_, err := s.db.Exec(query, time.Now(), conversationID, userID)
	if err != nil {
		logger.WithError(err).Error("Failed to mark conversation as read")
		return fmt.Errorf("failed to mark conversation as read: %w", err)
	}
	logger.Info("Successfully marked conversation as read")
	return nil
}

func (s *MessagingService) GetUnreadMessageCount(userID string) (int, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"operation": "get_unread_count",
	})

	logger.Debug("Getting unread message count")
	var count int
	query := `SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = false`
	err := s.db.QueryRow(query, userID).Scan(&count)
	if err != nil {
		logger.WithError(err).Error("Failed to get unread message count")
		return 0, fmt.Errorf("failed to get unread message count: %w", err)
	}
	logger.WithField("count", count).Info("Successfully retrieved unread message count")
	return count, nil
}

func (s *MessagingService) DeleteMessage(messageID, userID string) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"message_id": messageID,
		"user_id":    userID,
		"operation":  "delete_message",
	})

	logger.Info("Attempting to delete message")
	// Only allow deletion by the sender
	query := `DELETE FROM messages WHERE id = $1 AND sender_id = $2`
	result, err := s.db.Exec(query, messageID, userID)
	if err != nil {
		logger.WithError(err).Error("Failed to delete message")
		return fmt.Errorf("failed to delete message: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		logger.WithError(err).Error("Failed to get rows affected")
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		logger.Warn("Message not found or not authorized to delete")
		return fmt.Errorf("message not found or not authorized to delete")
	}

	logger.Info("Successfully deleted message")
	return nil
}

func (s *MessagingService) DeleteConversation(conversationID, userID string) error {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"conversation_id": conversationID,
		"user_id":         userID,
		"operation":       "delete_conversation",
	})

	logger.Debug("Deleting conversation")
	// Check if user is part of the conversation
	var count int
	query := `SELECT COUNT(*) FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)`
	err := s.db.QueryRow(query, conversationID, userID).Scan(&count)
	if err != nil {
		logger.WithError(err).Error("Failed to check conversation ownership")
		return fmt.Errorf("failed to check conversation ownership: %w", err)
	}

	if count == 0 {
		logger.Warn("Conversation not found or not authorized")
		return fmt.Errorf("conversation not found or not authorized")
	}

	return s.db.WithTransaction(func(tx *sql.Tx) error {
		// Delete all messages in the conversation
		_, err := tx.Exec(`
			DELETE FROM messages 
			WHERE match_id IN (
				SELECT match_id FROM conversations WHERE id = $1
			)
		`, conversationID)
		if err != nil {
			logger.WithError(err).Error("Failed to delete messages")
			return fmt.Errorf("failed to delete messages: %w", err)
		}

		// Delete the conversation
		_, err = tx.Exec(`DELETE FROM conversations WHERE id = $1`, conversationID)
		if err != nil {
			logger.WithError(err).Error("Failed to delete conversation")
			return fmt.Errorf("failed to delete conversation: %w", err)
		}

		logger.Info("Successfully deleted conversation")
		return nil
	})
}

func (s *MessagingService) GetConversationByUsers(user1ID, user2ID string) (*Conversation, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user1_id":  user1ID,
		"user2_id":  user2ID,
		"operation": "get_conversation_by_users",
	})

	logger.Debug("Getting conversation by users")
	conversation := &Conversation{}
	query := `
		SELECT id, match_id, user1_id, user2_id, last_message, last_activity, created_at, updated_at
		FROM conversations 
		WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)
	`

	err := s.db.QueryRow(query, user1ID, user2ID).Scan(
		&conversation.ID, &conversation.MatchID, &conversation.User1ID, &conversation.User2ID,
		&conversation.LastMessage, &conversation.LastActivity,
		&conversation.CreatedAt, &conversation.UpdatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			logger.Warn("Conversation not found")
			return nil, fmt.Errorf("conversation not found")
		}
		logger.WithError(err).Error("Failed to get conversation")
		return nil, fmt.Errorf("failed to get conversation: %w", err)
	}

	logger.WithField("conversation_id", conversation.ID).Info("Successfully retrieved conversation")
	return conversation, nil
}

func (s *MessagingService) GetRecentMessages(userID string, limit int) ([]*Message, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"user_id":   userID,
		"limit":     limit,
		"operation": "get_recent_messages",
	})

	logger.Debug("Getting recent messages")
	query := `
		SELECT id, match_id, sender_id, receiver_id, content, message_type, is_read, created_at, updated_at
		FROM messages 
		WHERE sender_id = $1 OR receiver_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := s.db.Query(query, userID, limit)
	if err != nil {
		logger.WithError(err).Error("Failed to get recent messages")
		return nil, fmt.Errorf("failed to get recent messages: %w", err)
	}
	defer rows.Close()

	var messages []*Message
	for rows.Next() {
		msg := &Message{}
		scanErr := rows.Scan(
			&msg.ID, &msg.MatchID, &msg.SenderID, &msg.ReceiverID,
			&msg.Content, &msg.MessageType, &msg.IsRead,
			&msg.CreatedAt, &msg.UpdatedAt,
		)
		if scanErr != nil {
			logger.WithError(scanErr).Error("Failed to scan message")
			return nil, fmt.Errorf("failed to scan message: %w", scanErr)
		}
		messages = append(messages, msg)
	}

	if err = rows.Err(); err != nil {
		logger.WithError(err).Error("Error iterating messages")
		return nil, fmt.Errorf("error iterating messages: %w", err)
	}

	logger.WithField("count", len(messages)).Info("Successfully retrieved recent messages")
	return messages, nil
}
