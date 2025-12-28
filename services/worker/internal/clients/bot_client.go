package clients

import (
	"context"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	notificationpb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
)

// BotClient communicates with the Bot service via gRPC to send Telegram messages.
type BotClient struct {
	conn               *grpc.ClientConn
	notificationClient notificationpb.NotificationServiceClient
}

// NewBotClient creates a new Bot service client.
func NewBotClient(address string) (*BotClient, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, address,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Bot service at %s: %w", address, err)
	}

	return &BotClient{
		conn:               conn,
		notificationClient: notificationpb.NewNotificationServiceClient(conn),
	}, nil
}

// Close closes the gRPC connection.
func (c *BotClient) Close() error {
	return c.conn.Close()
}

// SendNotification sends a notification via the Bot's Telegram integration.
func (c *BotClient) SendNotification(ctx context.Context, userID, message string, notificationType notificationpb.NotificationType, buttons []*notificationpb.InlineButton) (*notificationpb.SendNotificationResponse, error) {
	resp, err := c.notificationClient.SendNotification(ctx, &notificationpb.SendNotificationRequest{
		UserId:  userID,
		Message: message,
		Type:    notificationType,
		Buttons: buttons,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to send notification: %w", err)
	}
	return resp, nil
}
