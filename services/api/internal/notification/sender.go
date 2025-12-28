package notification

import (
	"context"
)

// Sender is the interface for notification delivery implementations.
// Each channel (Telegram, Email, Push, SMS) has its own Sender implementation.
type Sender interface {
	// Send delivers a notification and returns the result.
	// The notification's Payload contains channel-specific data.
	// Returns SendResult with success status, error details, and response data.
	Send(ctx context.Context, n *Notification) SendResult

	// Channel returns the channel this sender handles.
	Channel() Channel
}
