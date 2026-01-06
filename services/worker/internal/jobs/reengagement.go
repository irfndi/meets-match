package jobs

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/hibiken/asynq"

	notificationpb "github.com/irfndi/match-bot/packages/contracts/gen/go/proto/meetsmatch/v1"
	"github.com/irfndi/match-bot/services/worker/internal/clients"
)

// Rate limiting configuration for Telegram API
// Telegram allows ~30 messages/second globally, we stay conservative
const (
	defaultBatchSize      = 25  // Messages per batch before delay
	defaultMessageDelayMs = 35  // ~28 messages/sec to stay under Telegram limit
	defaultBatchDelayMs   = 500 // Additional delay between batches
)

// ReengagementHandler processes re-engagement notification tasks.
type ReengagementHandler struct {
	apiClient    *clients.APIClient
	botClient    *clients.BotClient
	batchSize    int
	messageDelay time.Duration
	batchDelay   time.Duration
}

// NewReengagementHandler creates a new re-engagement job handler.
func NewReengagementHandler(apiClient *clients.APIClient, botClient *clients.BotClient) *ReengagementHandler {
	h := &ReengagementHandler{
		apiClient:    apiClient,
		botClient:    botClient,
		batchSize:    defaultBatchSize,
		messageDelay: defaultMessageDelayMs * time.Millisecond,
		batchDelay:   defaultBatchDelayMs * time.Millisecond,
	}

	// Allow configuration via environment variables
	if v := os.Getenv("REENGAGEMENT_BATCH_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			h.batchSize = n
		}
	}
	if v := os.Getenv("REENGAGEMENT_MESSAGE_DELAY_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			h.messageDelay = time.Duration(n) * time.Millisecond
		}
	}
	if v := os.Getenv("REENGAGEMENT_BATCH_DELAY_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			h.batchDelay = time.Duration(n) * time.Millisecond
		}
	}

	return h
}

// ProcessTask handles the re-engagement task.
func (h *ReengagementHandler) ProcessTask(ctx context.Context, t *asynq.Task) error {
	log.Println("Starting re-engagement job...")
	startTime := time.Now()

	// Fetch candidates in batches
	// Gentle reminders: 3-7 days inactive
	if err := h.processInactivityRange(ctx, 3, 7, notificationpb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_GENTLE); err != nil {
		log.Printf("Error processing gentle reminders: %v", err)
	}

	// Urgent reminders: 7-14 days inactive
	if err := h.processInactivityRange(ctx, 7, 14, notificationpb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_URGENT); err != nil {
		log.Printf("Error processing urgent reminders: %v", err)
	}

	// Last chance reminders: 14-21 days inactive
	if err := h.processInactivityRange(ctx, 14, 21, notificationpb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_LAST_CHANCE); err != nil {
		log.Printf("Error processing last chance reminders: %v", err)
	}

	log.Printf("Re-engagement job completed in %s", time.Since(startTime))
	return nil
}

func (h *ReengagementHandler) processInactivityRange(ctx context.Context, minDays, maxDays int32, notificationType notificationpb.NotificationType) error {
	candidates, err := h.apiClient.GetReengagementCandidates(ctx, minDays, maxDays, 3, 100)
	if err != nil {
		return fmt.Errorf("failed to get candidates for %d-%d days: %w", minDays, maxDays, err)
	}

	log.Printf("Found %d candidates for %s (%d-%d days inactive)",
		len(candidates), notificationType.String(), minDays, maxDays)

	// Process with rate limiting to avoid hitting Telegram API limits
	sentInBatch := 0
	for i, candidate := range candidates {
		// Check for context cancellation
		select {
		case <-ctx.Done():
			log.Printf("Context cancelled, stopping re-engagement processing")
			return ctx.Err()
		default:
		}

		if err := h.sendReengagementNotification(ctx, candidate, notificationType); err != nil {
			log.Printf("Failed to send notification to user %s: %v", candidate.UserId, err)
			// Continue with next user - don't fail the entire batch
		}

		sentInBatch++

		// Apply message delay between each message
		if h.messageDelay > 0 && i < len(candidates)-1 {
			time.Sleep(h.messageDelay)
		}

		// Apply batch delay after each batch
		if sentInBatch >= h.batchSize && i < len(candidates)-1 {
			log.Printf("Processed batch of %d messages, pausing for rate limiting", h.batchSize)
			time.Sleep(h.batchDelay)
			sentInBatch = 0
		}
	}

	return nil
}

func (h *ReengagementHandler) sendReengagementNotification(ctx context.Context, candidate *notificationpb.ReengagementCandidate, notificationType notificationpb.NotificationType) error {
	message := h.buildMessage(candidate, notificationType)
	buttons := h.buildButtons(notificationType)

	resp, err := h.botClient.SendNotification(ctx, candidate.UserId, message, notificationType, buttons)
	if err != nil {
		// Log the attempt as failed
		_ = h.apiClient.LogNotificationResult(ctx, &notificationpb.LogNotificationResultRequest{
			UserId:       candidate.UserId,
			Type:         notificationType,
			Status:       notificationpb.NotificationStatus_NOTIFICATION_STATUS_FAILED,
			ErrorMessage: err.Error(),
			ErrorCode:    "network_error",
		})

		// Add to DLQ for retry
		_ = h.apiClient.EnqueueToDLQ(ctx, candidate.UserId, notificationType, message, err.Error(), "network_error", 3)
		return err
	}

	if !resp.Success {
		// Log the failure
		_ = h.apiClient.LogNotificationResult(ctx, &notificationpb.LogNotificationResultRequest{
			UserId:            candidate.UserId,
			Type:              notificationType,
			Status:            notificationpb.NotificationStatus_NOTIFICATION_STATUS_FAILED,
			ErrorMessage:      resp.Error,
			ErrorCode:         resp.ErrorCode,
			TelegramMessageId: resp.TelegramMessageId,
		})

		// Check if it's a permanent failure
		if isPermanentFailure(resp.ErrorCode) {
			log.Printf("Permanent failure for user %s: %s", candidate.UserId, resp.ErrorCode)
			return nil // Don't retry permanent failures
		}

		// Add to DLQ for retry
		_ = h.apiClient.EnqueueToDLQ(ctx, candidate.UserId, notificationType, message, resp.Error, resp.ErrorCode, 3)
		return fmt.Errorf("notification failed: %s", resp.Error)
	}

	// Log success
	_ = h.apiClient.LogNotificationResult(ctx, &notificationpb.LogNotificationResultRequest{
		UserId:            candidate.UserId,
		Type:              notificationType,
		Status:            notificationpb.NotificationStatus_NOTIFICATION_STATUS_DELIVERED,
		TelegramMessageId: resp.TelegramMessageId,
	})

	log.Printf("Successfully sent %s notification to user %s", notificationType.String(), candidate.UserId)
	return nil
}

func (h *ReengagementHandler) buildMessage(candidate *notificationpb.ReengagementCandidate, notificationType notificationpb.NotificationType) string {
	name := candidate.FirstName
	if name == "" {
		name = "there"
	}

	pendingLikesMsg := ""
	if candidate.PendingLikesCount > 0 {
		pendingLikesMsg = fmt.Sprintf("\n\n🔔 You have *%d pending likes* waiting for you!", candidate.PendingLikesCount)
	}

	switch notificationType {
	case notificationpb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_GENTLE:
		return fmt.Sprintf("Hey %s! 👋 We miss you on MeetMatch!%s\n\nReady to find your next connection?", name, pendingLikesMsg)

	case notificationpb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_URGENT:
		return fmt.Sprintf("Hey %s! We haven't seen you in a while! 🤔%s\n\nDon't miss out on potential connections!", name, pendingLikesMsg)

	case notificationpb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_LAST_CHANCE:
		return fmt.Sprintf("Hey %s! 📉 Your profile visibility will decrease if you stay inactive.%s\n\nOne tap to get back:", name, pendingLikesMsg)

	default:
		return fmt.Sprintf("Hey %s! Come back to MeetMatch!%s", name, pendingLikesMsg)
	}
}

func (h *ReengagementHandler) buildButtons(notificationType notificationpb.NotificationType) []*notificationpb.InlineButton {
	switch notificationType {
	case notificationpb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_GENTLE:
		return []*notificationpb.InlineButton{
			{Text: "🎯 Start Matching", CallbackData: "start_matching"},
			{Text: "😴 Pause Profile", CallbackData: "pause_profile"},
			{Text: "🔕 Stop Reminders", CallbackData: "stop_reminders"},
		}

	case notificationpb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_URGENT:
		return []*notificationpb.InlineButton{
			{Text: "🎯 Start Matching", CallbackData: "start_matching"},
			{Text: "⚙️ Update Settings", CallbackData: "settings"},
		}

	case notificationpb.NotificationType_NOTIFICATION_TYPE_REENGAGEMENT_LAST_CHANCE:
		return []*notificationpb.InlineButton{
			{Text: "🎯 Start Matching", CallbackData: "start_matching"},
		}

	default:
		return []*notificationpb.InlineButton{
			{Text: "🎯 Start Matching", CallbackData: "start_matching"},
		}
	}
}

// isPermanentFailure checks if an error code indicates a permanent failure that shouldn't be retried.
func isPermanentFailure(errorCode string) bool {
	switch errorCode {
	case "blocked_by_user", "bot_blocked", "invalid_chat":
		return true
	default:
		return false
	}
}
