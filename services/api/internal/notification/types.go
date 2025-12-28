// Package notification provides a robust notification queue system with
// dead letter queue (DLQ) support, exponential backoff retries, and
// multi-channel delivery (Telegram, Email, Push, SMS).
//
// Architecture:
//
//	Bot → gRPC → NotificationService → Redis Queue → Worker → Channel Sender
//	                    ↓                   ↓
//	              PostgreSQL            DLQ (Redis)
//	              (audit trail)         (failed items)
//
// Usage:
//
//	svc := notification.NewService(repo, queue, config)
//	svc.RegisterSender(notification.ChannelTelegram, telegramSender)
//
//	// Enqueue a notification
//	n, err := svc.Enqueue(ctx, notification.CreateRequest{
//	    UserID:  "123",
//	    Type:    notification.TypeMutualMatch,
//	    Channel: notification.ChannelTelegram,
//	    Payload: notification.Payload{
//	        Telegram: &notification.TelegramPayload{
//	            ChatID: "123",
//	            Text:   "You have a new match!",
//	        },
//	    },
//	    IdempotencyKey: ptr("mutual:match123:user123"),
//	})
package notification

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

// Channel represents a notification delivery channel.
// Extensible to support email, push, SMS in the future.
type Channel string

const (
	ChannelTelegram Channel = "telegram"
	ChannelEmail    Channel = "email"
	ChannelPush     Channel = "push"
	ChannelSMS      Channel = "sms"
)

// Status represents the lifecycle state of a notification.
type Status string

const (
	StatusPending    Status = "pending"    // Initial state, awaiting first attempt
	StatusProcessing Status = "processing" // Currently being processed by worker
	StatusDelivered  Status = "delivered"  // Successfully delivered to channel
	StatusFailed     Status = "failed"     // Failed but may retry
	StatusDLQ        Status = "dlq"        // Moved to dead letter queue after max retries
	StatusCancelled  Status = "cancelled"  // Manually cancelled
)

// Type represents the category of notification.
type Type string

const (
	TypeMutualMatch            Type = "mutual_match"             // Both users liked each other
	TypeNewLike                Type = "new_like"                 // Someone liked the user
	TypeMatchReminder          Type = "match_reminder"           // Reminder about pending matches
	TypeProfileIncomplete      Type = "profile_incomplete"       // Profile completion reminder
	TypeWelcome                Type = "welcome"                  // Welcome message for new users
	TypeSystem                 Type = "system"                   // System announcements
	TypeReengagementGentle     Type = "reengagement_gentle"      // 3-7 days inactive
	TypeReengagementUrgent     Type = "reengagement_urgent"      // 7-14 days inactive
	TypeReengagementLastChance Type = "reengagement_last_chance" // 14-21 days inactive
)

// ErrorCode categorizes delivery failures for retry decisions.
// Some errors are retryable (network issues), others are not (user blocked bot).
type ErrorCode string

const (
	ErrorCodeRateLimited    ErrorCode = "RATE_LIMITED"    // Retry with backoff
	ErrorCodeUserBlocked    ErrorCode = "USER_BLOCKED"    // Move to DLQ immediately
	ErrorCodeNetworkError   ErrorCode = "NETWORK_ERROR"   // Retry
	ErrorCodeInvalidPayload ErrorCode = "INVALID_PAYLOAD" // Move to DLQ
	ErrorCodeServiceDown    ErrorCode = "SERVICE_DOWN"    // Retry with backoff
	ErrorCodeUnknown        ErrorCode = "UNKNOWN"         // Retry
)

// ShouldRetry returns true if this error code should trigger a retry.
// Non-retryable errors (user blocked, invalid payload) go directly to DLQ.
func (e ErrorCode) ShouldRetry() bool {
	switch e {
	case ErrorCodeUserBlocked, ErrorCodeInvalidPayload:
		return false
	default:
		return true
	}
}

// TelegramPayload is the channel-specific payload for Telegram notifications.
type TelegramPayload struct {
	ChatID      string          `json:"chat_id"`
	Text        string          `json:"text"`
	ParseMode   string          `json:"parse_mode,omitempty"`   // "Markdown" or "HTML"
	ReplyMarkup json.RawMessage `json:"reply_markup,omitempty"` // Inline keyboard JSON
}

// EmailPayload is the channel-specific payload for email notifications.
// Prepared for future implementation.
type EmailPayload struct {
	To         string `json:"to"`
	Subject    string `json:"subject"`
	Body       string `json:"body"`
	TemplateID string `json:"template_id,omitempty"`
}

// PushPayload is the channel-specific payload for push notifications.
// Prepared for future implementation.
type PushPayload struct {
	Token   string            `json:"token"`   // FCM/APNs token
	Title   string            `json:"title"`
	Body    string            `json:"body"`
	Data    map[string]string `json:"data,omitempty"`
	ImageURL string           `json:"image_url,omitempty"`
}

// SMSPayload is the channel-specific payload for SMS notifications.
// Prepared for future implementation.
type SMSPayload struct {
	PhoneNumber string `json:"phone_number"`
	Message     string `json:"message"`
}

// Payload is a generic notification payload that wraps channel-specific data.
// Only one channel payload should be set per notification.
type Payload struct {
	Telegram *TelegramPayload `json:"telegram,omitempty"`
	Email    *EmailPayload    `json:"email,omitempty"`
	Push     *PushPayload     `json:"push,omitempty"`
	SMS      *SMSPayload      `json:"sms,omitempty"`
}

// Value implements driver.Valuer for database storage.
func (p Payload) Value() (driver.Value, error) {
	return json.Marshal(p)
}

// Scan implements sql.Scanner for database retrieval.
func (p *Payload) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	b, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(b, p)
}

// Notification represents a notification record in the database.
type Notification struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	UserID         string     `json:"user_id" db:"user_id"`
	Type           Type       `json:"type" db:"type"`
	Channel        Channel    `json:"channel" db:"channel"`
	Payload        Payload    `json:"payload" db:"payload"`
	Status         Status     `json:"status" db:"status"`
	Priority       int        `json:"priority" db:"priority"`
	AttemptCount   int        `json:"attempt_count" db:"attempt_count"`
	MaxAttempts    int        `json:"max_attempts" db:"max_attempts"`
	NextRetryAt    *time.Time `json:"next_retry_at,omitempty" db:"next_retry_at"`
	LastError      *string    `json:"last_error,omitempty" db:"last_error"`
	LastErrorCode  *ErrorCode `json:"last_error_code,omitempty" db:"last_error_code"`
	RelatedMatchID *string    `json:"related_match_id,omitempty" db:"related_match_id"`
	RelatedUserID  *string    `json:"related_user_id,omitempty" db:"related_user_id"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at" db:"updated_at"`
	DeliveredAt    *time.Time `json:"delivered_at,omitempty" db:"delivered_at"`
	DLQAt          *time.Time `json:"dlq_at,omitempty" db:"dlq_at"`
	IdempotencyKey *string    `json:"idempotency_key,omitempty" db:"idempotency_key"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty" db:"expires_at"`
}

// Attempt represents a single delivery attempt for a notification.
type Attempt struct {
	ID             uuid.UUID       `json:"id" db:"id"`
	NotificationID uuid.UUID       `json:"notification_id" db:"notification_id"`
	AttemptNumber  int             `json:"attempt_number" db:"attempt_number"`
	Success        bool            `json:"success" db:"success"`
	ErrorMessage   *string         `json:"error_message,omitempty" db:"error_message"`
	ErrorCode      *ErrorCode      `json:"error_code,omitempty" db:"error_code"`
	ResponseData   json.RawMessage `json:"response_data,omitempty" db:"response_data"`
	StartedAt      time.Time       `json:"started_at" db:"started_at"`
	CompletedAt    *time.Time      `json:"completed_at,omitempty" db:"completed_at"`
	DurationMs     *int            `json:"duration_ms,omitempty" db:"duration_ms"`
	WorkerID       *string         `json:"worker_id,omitempty" db:"worker_id"`
}

// CreateRequest is used to enqueue new notifications.
type CreateRequest struct {
	UserID         string     `json:"user_id"`
	Type           Type       `json:"type"`
	Channel        Channel    `json:"channel"`
	Payload        Payload    `json:"payload"`
	Priority       int        `json:"priority"`     // 0-10, default 0
	MaxAttempts    int        `json:"max_attempts"` // Default from config
	RelatedMatchID *string    `json:"related_match_id,omitempty"`
	RelatedUserID  *string    `json:"related_user_id,omitempty"`
	IdempotencyKey *string    `json:"idempotency_key,omitempty"`
	ExpiresAt      *time.Time `json:"expires_at,omitempty"`
}

// SendResult is returned by Sender implementations after attempting delivery.
type SendResult struct {
	Success      bool
	ErrorCode    ErrorCode
	Error        error
	ResponseData json.RawMessage
}

// DLQFilter is used to filter notifications when querying or replaying DLQ.
type DLQFilter struct {
	Type      *Type      `json:"type,omitempty"`
	ErrorCode *ErrorCode `json:"error_code,omitempty"`
	Limit     int        `json:"limit,omitempty"`
	Since     *time.Time `json:"since,omitempty"`
}

// DLQStats holds dead letter queue statistics.
type DLQStats struct {
	TotalCount   int64            `json:"total_count"`
	CountByType  map[string]int64 `json:"count_by_type"`
	CountByError map[string]int64 `json:"count_by_error"`
	OldestItem   *time.Time       `json:"oldest_item,omitempty"`
}

// Ptr is a helper to create a pointer to a value.
func Ptr[T any](v T) *T {
	return &v
}
