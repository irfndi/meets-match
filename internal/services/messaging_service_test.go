package services

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewMessagingService(t *testing.T) {
	service := NewMessagingService(nil)
	assert.NotNil(t, service)
}

func TestMessage_Creation(t *testing.T) {
	senderID := "user-1"
	receiverID := "user-2"
	content := "Hello, how are you?"
	messageType := "text"

	message := &Message{
		ID:          "msg-123",
		MatchID:     "match-456",
		SenderID:    senderID,
		ReceiverID:  receiverID,
		Content:     content,
		MessageType: messageType,
		IsRead:      false,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	assert.Equal(t, senderID, message.SenderID)
	assert.Equal(t, receiverID, message.ReceiverID)
	assert.Equal(t, content, message.Content)
	assert.Equal(t, messageType, message.MessageType)
	assert.False(t, message.IsRead)
	assert.False(t, message.CreatedAt.IsZero())
	assert.False(t, message.UpdatedAt.IsZero())
}

func TestMessage_Validation(t *testing.T) {
	tests := []struct {
		name     string
		message  *Message
		expected bool
	}{
		{
			name: "Valid message",
			message: &Message{
				ID:          "msg-123",
				MatchID:     "match-456",
				SenderID:    "user-1",
				ReceiverID:  "user-2",
				Content:     "Hello",
				MessageType: "text",
				IsRead:      false,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
			expected: true,
		},
		{
			name: "Empty content",
			message: &Message{
				ID:          "msg-124",
				MatchID:     "match-457",
				SenderID:    "user-1",
				ReceiverID:  "user-2",
				Content:     "",
				MessageType: "text",
				IsRead:      false,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
			expected: false,
		},
		{
			name: "Missing sender",
			message: &Message{
				ID:          "msg-125",
				MatchID:     "match-458",
				SenderID:    "", // Empty sender
				ReceiverID:  "user-2",
				Content:     "Hello",
				MessageType: "text",
				IsRead:      false,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
			expected: false,
		},
		{
			name: "Invalid message type",
			message: &Message{
				ID:          "msg-126",
				MatchID:     "match-459",
				SenderID:    "user-1",
				ReceiverID:  "user-2",
				Content:     "Hello",
				MessageType: "invalid_type",
				IsRead:      false,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := validateMessage(tt.message)
			assert.Equal(t, tt.expected, valid)
		})
	}
}

// validateMessage validates message data before creation
func validateMessage(message *Message) bool {
	if message.ID == "" {
		return false
	}

	if message.MatchID == "" || message.SenderID == "" || message.ReceiverID == "" {
		return false
	}

	if message.Content == "" {
		return false
	}

	// Validate message type
	validTypes := map[string]bool{
		"text":     true,
		"image":    true,
		"location": true,
		"voice":    true,
		"video":    true,
	}

	return validTypes[message.MessageType]
}

func TestConversation_Creation(t *testing.T) {
	matchID := "match-123"
	user1ID := "user-1"
	user2ID := "user-2"
	lastMessage := "Hello there!"

	conversation := &Conversation{
		ID:           "conv-456",
		MatchID:      matchID,
		User1ID:      user1ID,
		User2ID:      user2ID,
		LastMessage:  &lastMessage,
		LastActivity: time.Now(),
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	assert.Equal(t, matchID, conversation.MatchID)
	assert.Equal(t, user1ID, conversation.User1ID)
	assert.Equal(t, user2ID, conversation.User2ID)
	assert.Equal(t, "Hello there!", *conversation.LastMessage)
	assert.False(t, conversation.CreatedAt.IsZero())
	assert.False(t, conversation.UpdatedAt.IsZero())
	assert.False(t, conversation.LastActivity.IsZero())
}

func TestConversation_LastActivity(t *testing.T) {
	conversation := &Conversation{
		ID:           "conv-123",
		MatchID:      "match-456",
		User1ID:      "user-1",
		User2ID:      "user-2",
		LastActivity: time.Now().Add(-1 * time.Hour),
		CreatedAt:    time.Now().Add(-2 * time.Hour),
		UpdatedAt:    time.Now().Add(-30 * time.Minute),
	}

	// Test last activity tracking
	assert.True(t, conversation.LastActivity.After(conversation.CreatedAt))
	assert.True(t, conversation.UpdatedAt.After(conversation.LastActivity))

	// Test updating last activity
	newActivity := time.Now()
	conversation.LastActivity = newActivity
	assert.Equal(t, newActivity, conversation.LastActivity)
}

// isValidConversationStatusTransition validates conversation status transitions
func isValidConversationStatusTransition(from, to string) bool {
	validTransitions := map[string][]string{
		"active":    {"archived", "blocked"},
		"archived":  {"active"},
		"blocked":   {"active"},
	}

	if transitions, exists := validTransitions[from]; exists {
		for _, validTo := range transitions {
			if validTo == to {
				return true
			}
		}
	}
	return false
}

func TestMessage_ReadStatus(t *testing.T) {
	message := &Message{
		ID:          "msg-123",
		IsRead:      false,
		CreatedAt:   time.Now().Add(-1 * time.Hour),
		UpdatedAt:   time.Now().Add(-1 * time.Hour),
	}

	// Test unread message
	assert.True(t, isMessageUnread(message))

	// Test read message
	message.IsRead = true
	message.UpdatedAt = time.Now()
	assert.False(t, isMessageUnread(message))
}

// isMessageUnread checks if a message is unread
func isMessageUnread(message *Message) bool {
	return !message.IsRead
}

func TestConversation_MessageSorting(t *testing.T) {
	// Test sorting by last message time
	earlierMessage := &Message{
		ID:        "msg-1",
		CreatedAt: time.Now().Add(-45 * time.Minute),
		IsRead:    true,
		UpdatedAt: time.Now().Add(-45 * time.Minute),
	}

	recentMessage := &Message{
		ID:        "msg-2",
		CreatedAt: time.Now().Add(-15 * time.Minute),
		IsRead:    false,
		UpdatedAt: time.Now().Add(-15 * time.Minute),
	}

	assert.True(t, earlierMessage.CreatedAt.Before(recentMessage.CreatedAt))
	assert.Equal(t, earlierMessage.ID, getOlderMessage(earlierMessage, recentMessage).ID)
}

// getOlderMessage returns the older of two messages
func getOlderMessage(msg1, msg2 *Message) *Message {
	if msg1.CreatedAt.Before(msg2.CreatedAt) {
		return msg1
	}
	return msg2
}

func TestMessaging_PermissionCheck(t *testing.T) {
	// Test messaging permission based on mutual match
	mutualMatch := &Match{
		ID:        "match-123",
		UserID:    "user-1",
		TargetID:  "user-2",
		Status:    "mutual",
		CreatedAt: time.Now(),
	}

	pendingMatch := &Match{
		ID:        "match-456",
		UserID:    "user-1",
		TargetID:  "user-2",
		Status:    "pending",
		CreatedAt: time.Now(),
	}

	// Test mutual match allows messaging
	assert.True(t, canSendMessage(mutualMatch, "user-1", "user-2"))
	assert.True(t, canSendMessage(mutualMatch, "user-2", "user-1"))

	// Test pending match prevents messaging
	assert.False(t, canSendMessage(pendingMatch, "user-1", "user-2"))
	assert.False(t, canSendMessage(pendingMatch, "user-2", "user-1"))

	// Test uninvolved party can't message
	rejectedMatch := &Match{
		ID:        "match-789",
		UserID:    "user-3",
		TargetID:  "user-4",
		Status:    "rejected",
		CreatedAt: time.Now(),
	}

	assert.False(t, canSendMessage(rejectedMatch, "user-1", "user-2"))
	assert.False(t, canSendMessage(rejectedMatch, "user-3", "user-5"))
}

// canSendMessage checks if users can message each other based on match status
func canSendMessage(match *Match, senderID, receiverID string) bool {
	// Only mutual matches allow messaging
	if match.Status != "mutual" {
		return false
	}

	// Check if sender and receiver are part of the match
	if (match.UserID == senderID && match.TargetID == receiverID) ||
		(match.UserID == receiverID && match.TargetID == senderID) {
		return true
	}

	return false
}

func TestMessageContent_Length(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected bool
	}{
		{
			name:     "Normal message",
			content:  "Hello, how are you today?",
			expected: true,
		},
		{
			name:     "Empty message",
			content:  "",
			expected: false,
		},
		{
			name:     "Too long message",
			content:  string(make([]byte, 10001)), // Over 10KB
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := validateMessageContent(tt.content)
			assert.Equal(t, tt.expected, valid)
		})
	}
}

// validateMessageContent validates message content length and format
func validateMessageContent(content string) bool {
	if content == "" {
		return false
	}

	// Check max length (10KB limit)
	if len(content) > 10000 {
		return false
	}

	return true
}

func TestMessageRateLimiting(t *testing.T) {
	senderID := "user-1"
	
	// Test rate limiting (simplified)
	allowed := checkMessageRateLimit(senderID, 5)
	assert.True(t, allowed)

	// Exceed rate limit
	exceeded := checkMessageRateLimit(senderID, 100)
	assert.False(t, exceeded)
}

// checkMessageRateLimit checks if user has exceeded message rate limit (simplified)
func checkMessageRateLimit(userID string, messageCount int) bool {
	// Simplified rate limiting: allow max 10 messages per minute
	return messageCount <= 10
}