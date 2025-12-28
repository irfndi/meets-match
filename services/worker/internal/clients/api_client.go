// Package clients provides gRPC clients for communicating with other services.
package clients

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	notificationpb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
)

// APIClient communicates with the API service via gRPC.
type APIClient struct {
	conn               *grpc.ClientConn
	notificationClient notificationpb.NotificationServiceClient
}

// NewAPIClient creates a new API service client.
func NewAPIClient(address string) (*APIClient, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to API service at %s: %w", address, err)
	}

	return &APIClient{
		conn:               conn,
		notificationClient: notificationpb.NewNotificationServiceClient(conn),
	}, nil
}

// Close closes the gRPC connection.
func (c *APIClient) Close() error {
	return c.conn.Close()
}

// GetReengagementCandidates fetches users eligible for re-engagement notifications.
func (c *APIClient) GetReengagementCandidates(ctx context.Context, minInactiveDays, maxInactiveDays, reminderCooldownDays, limit int32) ([]*notificationpb.ReengagementCandidate, error) {
	resp, err := c.notificationClient.GetReengagementCandidates(ctx, &notificationpb.GetReengagementCandidatesRequest{
		MinInactiveDays:      minInactiveDays,
		MaxInactiveDays:      maxInactiveDays,
		ReminderCooldownDays: reminderCooldownDays,
		Limit:                limit,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get reengagement candidates: %w", err)
	}
	return resp.Candidates, nil
}

// LogNotificationResult logs the result of a notification attempt.
func (c *APIClient) LogNotificationResult(ctx context.Context, req *notificationpb.LogNotificationResultRequest) error {
	_, err := c.notificationClient.LogNotificationResult(ctx, req)
	if err != nil {
		return fmt.Errorf("failed to log notification result: %w", err)
	}
	return nil
}

// EnqueueToDLQ adds a failed notification to the dead letter queue.
func (c *APIClient) EnqueueToDLQ(ctx context.Context, userID string, notificationType notificationpb.NotificationType, message, errorMsg, errorCode string, maxRetries int32) error {
	// Build TelegramPayload with the message
	payload := &notificationpb.NotificationPayload{
		Payload: &notificationpb.NotificationPayload_Telegram{
			Telegram: &notificationpb.TelegramPayload{
				ChatId: userID,
				Text:   message,
			},
		},
	}

	_, err := c.notificationClient.EnqueueNotification(ctx, &notificationpb.EnqueueNotificationRequest{
		UserId:  userID,
		Type:    notificationType,
		Channel: notificationpb.NotificationChannel_NOTIFICATION_CHANNEL_TELEGRAM,
		Payload: payload,
	})
	if err != nil {
		return fmt.Errorf("failed to enqueue to DLQ: %w", err)
	}
	return nil
}

// GetDLQStats returns statistics about the dead letter queue.
func (c *APIClient) GetDLQStats(ctx context.Context) (*notificationpb.GetDLQStatsResponse, error) {
	resp, err := c.notificationClient.GetDLQStats(ctx, &notificationpb.GetDLQStatsRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to get DLQ stats: %w", err)
	}
	return resp, nil
}

// ReplayDLQ retries pending items in the dead letter queue.
func (c *APIClient) ReplayDLQ(ctx context.Context, limit int32) (*notificationpb.ReplayDLQResponse, error) {
	resp, err := c.notificationClient.ReplayDLQ(ctx, &notificationpb.ReplayDLQRequest{
		Limit: limit,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to replay DLQ: %w", err)
	}
	return resp, nil
}
