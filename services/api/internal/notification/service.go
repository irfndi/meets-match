package notification

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/google/uuid"
)

// Service handles notification business logic.
// It orchestrates between the repository (PostgreSQL) and queue (Redis).
type Service struct {
	repo    Repository
	queue   Queue
	senders map[Channel]Sender
	config  Config
}

// NewService creates a notification service with all dependencies.
func NewService(repo Repository, queue Queue, config Config) *Service {
	return &Service{
		repo:    repo,
		queue:   queue,
		senders: make(map[Channel]Sender),
		config:  config,
	}
}

// RegisterSender adds a channel sender (e.g., Telegram, Email).
func (s *Service) RegisterSender(snd Sender) {
	s.senders[snd.Channel()] = snd
}

// Enqueue creates a notification and adds it to the processing queue.
// This is the primary entry point for sending notifications.
//
// Example usage:
//
//	n, err := svc.Enqueue(ctx, notification.CreateRequest{
//	    UserID:         "123",
//	    Type:           notification.TypeMutualMatch,
//	    Channel:        notification.ChannelTelegram,
//	    Payload:        notification.Payload{Telegram: &notification.TelegramPayload{...}},
//	    IdempotencyKey: notification.Ptr("mutual:match123:user123"),
//	})
func (s *Service) Enqueue(ctx context.Context, req CreateRequest) (*Notification, error) {
	// Set defaults
	if req.MaxAttempts == 0 {
		req.MaxAttempts = s.config.DefaultMaxAttempts
	}
	if req.Channel == "" {
		req.Channel = ChannelTelegram
	}

	// Create notification record in PostgreSQL
	notification, err := s.repo.Create(ctx, req)
	if err != nil {
		// Check for idempotency conflict - return existing notification
		if IsConflictError(err) && req.IdempotencyKey != nil {
			existing, getErr := s.repo.GetByIdempotencyKey(ctx, *req.IdempotencyKey)
			if getErr == nil {
				return existing, nil
			}
		}
		return nil, fmt.Errorf("failed to create notification: %w", err)
	}

	// Add to Redis pending queue
	if err := s.queue.Enqueue(ctx, notification.ID, req.Priority); err != nil {
		// Log but don't fail - notification exists in DB
		// Worker will pick it up on next database poll
		s.logError(ctx, "failed to enqueue to Redis", err, notification.ID)
	}

	return notification, nil
}

// Process handles a single notification delivery attempt.
// Called by the worker for each notification.
func (s *Service) Process(ctx context.Context, notificationID uuid.UUID, workerID string) error {
	// Acquire lock
	acquired, err := s.queue.AcquireLock(ctx, notificationID, workerID, s.config.LockTTL)
	if err != nil {
		return fmt.Errorf("failed to acquire lock: %w", err)
	}
	if !acquired {
		// Another worker is processing this notification
		return nil
	}
	defer func() {
		if err := s.queue.ReleaseLock(ctx, notificationID, workerID); err != nil {
			s.logError(ctx, "failed to release lock", err, notificationID)
		}
	}()

	// Get notification from database
	n, err := s.repo.GetByID(ctx, notificationID)
	if err != nil {
		return fmt.Errorf("notification not found: %w", err)
	}

	// Check if already processed
	if n.Status == StatusDelivered || n.Status == StatusDLQ || n.Status == StatusCancelled {
		// Already processed, remove from queue
		_ = s.queue.Remove(ctx, notificationID)
		return nil
	}

	// Check if expired
	if n.ExpiresAt != nil && time.Now().After(*n.ExpiresAt) {
		// Expired, remove from queue
		_ = s.queue.Remove(ctx, notificationID)
		return nil
	}

	// Get sender for channel
	snd, ok := s.senders[n.Channel]
	if !ok {
		return s.moveToDLQ(ctx, n, ErrorCodeInvalidPayload,
			fmt.Sprintf("no sender registered for channel: %s", n.Channel))
	}

	// Attempt delivery
	startTime := time.Now()
	result := snd.Send(ctx, n)
	duration := int(time.Since(startTime).Milliseconds())

	// Record attempt
	attempt := Attempt{
		NotificationID: n.ID,
		AttemptNumber:  n.AttemptCount + 1,
		Success:        result.Success,
		StartedAt:      startTime,
		DurationMs:     &duration,
		WorkerID:       &workerID,
	}

	if result.Error != nil {
		errMsg := result.Error.Error()
		attempt.ErrorMessage = &errMsg
		attempt.ErrorCode = &result.ErrorCode
	}
	if result.ResponseData != nil {
		attempt.ResponseData = result.ResponseData
	}

	completedAt := time.Now()
	attempt.CompletedAt = &completedAt

	if err := s.repo.CreateAttempt(ctx, attempt); err != nil {
		s.logError(ctx, "failed to record attempt", err, n.ID)
	}

	// Handle result
	if result.Success {
		return s.markDelivered(ctx, n)
	}

	return s.handleFailure(ctx, n, result.ErrorCode, result.Error)
}

// handleFailure decides whether to retry or move to DLQ.
func (s *Service) handleFailure(ctx context.Context, n *Notification, errorCode ErrorCode, err error) error {
	// Update attempt count
	newAttemptCount := n.AttemptCount + 1
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}

	// Check if should retry
	if !errorCode.ShouldRetry() || newAttemptCount >= n.MaxAttempts {
		return s.moveToDLQ(ctx, n, errorCode, errMsg)
	}

	// Calculate next retry time with exponential backoff
	delay := s.calculateBackoff(newAttemptCount)
	nextRetry := time.Now().Add(delay)

	// Update notification status in database
	if err := s.repo.UpdateForRetry(ctx, n.ID, newAttemptCount, nextRetry, errMsg, errorCode); err != nil {
		return fmt.Errorf("failed to update for retry: %w", err)
	}

	// Move to delayed queue in Redis
	if err := s.queue.MoveToDelayed(ctx, n.ID, nextRetry); err != nil {
		s.logError(ctx, "failed to move to delayed queue", err, n.ID)
	}

	log.Printf("[notification] Scheduled retry #%d for %s at %s (error: %s)",
		newAttemptCount+1, n.ID, nextRetry.Format(time.RFC3339), errorCode)

	return nil
}

// calculateBackoff returns the delay for the next retry.
// Uses exponential backoff: base * multiplier^(attempt-1), capped at max.
//
// With defaults (base=1m, multiplier=5):
//   - Attempt 2: 1 minute
//   - Attempt 3: 5 minutes
//   - Attempt 4: 25 minutes
//   - Attempt 5: 2 hours (capped at 12h max)
func (s *Service) calculateBackoff(attemptNumber int) time.Duration {
	baseDelay := s.config.BaseRetryDelay
	multiplier := s.config.BackoffMultiplier
	maxDelay := s.config.MaxRetryDelay

	delay := baseDelay
	for i := 1; i < attemptNumber; i++ {
		delay = time.Duration(float64(delay) * multiplier)
		if delay > maxDelay {
			delay = maxDelay
			break
		}
	}

	return delay
}

// moveToDLQ moves a notification to the dead letter queue.
func (s *Service) moveToDLQ(ctx context.Context, n *Notification, errorCode ErrorCode, errMsg string) error {
	now := time.Now()

	// Update database
	if err := s.repo.MoveToDLQ(ctx, n.ID, now, errMsg, errorCode); err != nil {
		return fmt.Errorf("failed to update DLQ status: %w", err)
	}

	// Update Redis
	if err := s.queue.MoveToDLQ(ctx, n.ID); err != nil {
		s.logError(ctx, "failed to move to DLQ in Redis", err, n.ID)
	}

	log.Printf("[notification] Moved to DLQ: %s (error: %s - %s)", n.ID, errorCode, errMsg)

	// Alert to Sentry when notification moves to DLQ
	s.captureNotificationDLQ(ctx, n, errorCode, errMsg)

	return nil
}

// markDelivered marks a notification as successfully delivered.
func (s *Service) markDelivered(ctx context.Context, n *Notification) error {
	now := time.Now()

	// Update database
	if err := s.repo.MarkDelivered(ctx, n.ID, now); err != nil {
		return fmt.Errorf("failed to mark delivered: %w", err)
	}

	// Remove from Redis queues
	if err := s.queue.Remove(ctx, n.ID); err != nil {
		s.logError(ctx, "failed to remove from queue", err, n.ID)
	}

	log.Printf("[notification] Delivered: %s (type: %s, channel: %s)", n.ID, n.Type, n.Channel)

	return nil
}

// ReplayDLQ moves notifications from DLQ back to pending for retry.
// Used for manual intervention after fixing issues.
func (s *Service) ReplayDLQ(ctx context.Context, filter DLQFilter) (int, error) {
	notifications, err := s.repo.GetDLQNotifications(ctx, filter)
	if err != nil {
		return 0, fmt.Errorf("failed to get DLQ notifications: %w", err)
	}

	replayed := 0
	for _, n := range notifications {
		// Reset notification state in database
		if err := s.repo.ResetForReplay(ctx, n.ID); err != nil {
			s.logError(ctx, "failed to reset notification", err, n.ID)
			continue
		}

		// Re-enqueue in Redis
		if err := s.queue.ReplayFromDLQ(ctx, n.ID); err != nil {
			s.logError(ctx, "failed to replay from DLQ", err, n.ID)
			continue
		}

		replayed++
	}

	log.Printf("[notification] Replayed %d notifications from DLQ", replayed)

	return replayed, nil
}

// GetNotification retrieves a notification by ID.
func (s *Service) GetNotification(ctx context.Context, id uuid.UUID) (*Notification, error) {
	return s.repo.GetByID(ctx, id)
}

// GetDLQStats returns statistics about the dead letter queue.
func (s *Service) GetDLQStats(ctx context.Context) (*DLQStats, error) {
	return s.repo.GetDLQStats(ctx)
}

// GetQueueStats returns Redis queue statistics.
func (s *Service) GetQueueStats(ctx context.Context) (*QueueStats, error) {
	return s.queue.GetQueueStats(ctx)
}

// logError logs an error with notification context and reports to Sentry.
func (s *Service) logError(ctx context.Context, msg string, err error, notificationID uuid.UUID) {
	log.Printf("[notification] %s: %v (notification: %s)", msg, err, notificationID)

	// Report to Sentry
	s.captureError(ctx, err, map[string]string{
		"notification_id": notificationID.String(),
		"component":       "notification_service",
	}, map[string]interface{}{
		"message": msg,
	})
}

// captureError reports an error to Sentry with context.
func (s *Service) captureError(_ context.Context, err error, tags map[string]string, extras map[string]interface{}) {
	if err == nil {
		return
	}

	hub := sentry.CurrentHub().Clone()
	scope := hub.Scope()

	scope.SetTag("service", "notification")
	for k, v := range tags {
		scope.SetTag(k, v)
	}
	for k, v := range extras {
		scope.SetExtra(k, v)
	}

	hub.CaptureException(err)
}

// captureNotificationDLQ reports a DLQ event to Sentry.
func (s *Service) captureNotificationDLQ(_ context.Context, n *Notification, errorCode ErrorCode, errMsg string) {
	hub := sentry.CurrentHub().Clone()
	scope := hub.Scope()

	scope.SetTag("service", "notification")
	scope.SetTag("notification_type", string(n.Type))
	scope.SetTag("notification_channel", string(n.Channel))
	scope.SetTag("error_code", string(errorCode))
	scope.SetLevel(sentry.LevelWarning)

	scope.SetUser(sentry.User{ID: n.UserID})

	scope.SetExtra("notification_id", n.ID.String())
	scope.SetExtra("attempt_count", n.AttemptCount)
	scope.SetExtra("max_attempts", n.MaxAttempts)
	scope.SetExtra("error_message", errMsg)

	// Add breadcrumb for the DLQ event
	hub.AddBreadcrumb(&sentry.Breadcrumb{
		Category: "notification",
		Message:  fmt.Sprintf("Notification moved to DLQ: %s", n.ID),
		Level:    sentry.LevelWarning,
		Data: map[string]interface{}{
			"type":          n.Type,
			"channel":       n.Channel,
			"error_code":    errorCode,
			"attempt_count": n.AttemptCount,
		},
	}, nil)

	hub.CaptureMessage(fmt.Sprintf("Notification moved to DLQ: %s (%s)", errorCode, errMsg))
}

// Reconcile syncs the database with Redis queue.
// It finds orphaned notifications (in processing state in DB but not in Redis)
// and either requeues them or moves them to DLQ based on age.
// This should be run periodically (e.g., every 5 minutes) to handle
// cases where Redis lost data or workers crashed.
func (s *Service) Reconcile(ctx context.Context) (int, error) {
	// Find notifications that are stuck in processing for too long
	// These are likely orphaned (Redis lost the entry or worker crashed)
	staleThreshold := 10 * time.Minute // Notifications processing for >10 min are likely stuck

	query := `
		SELECT id, attempt_count, max_attempts, created_at
		FROM notifications
		WHERE status IN ('pending', 'processing', 'failed')
		  AND updated_at < NOW() - INTERVAL '10 minutes'
		  AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY updated_at ASC
		LIMIT 100
	`

	pgRepo, ok := s.repo.(*PostgresRepository)
	if !ok {
		log.Printf("[reconciler] Reconcile requires PostgresRepository, skipping")
		return 0, nil
	}
	rows, err := pgRepo.db.QueryContext(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("failed to find orphaned notifications: %w", err)
	}
	defer func() { _ = rows.Close() }()

	reconciled := 0
	for rows.Next() {
		var id uuid.UUID
		var attemptCount, maxAttempts int
		var createdAt time.Time

		if err := rows.Scan(&id, &attemptCount, &maxAttempts, &createdAt); err != nil {
			continue
		}

		// Check if notification is really orphaned (not in Redis)
		// Try to acquire lock - if we can, it means no worker is processing it
		acquired, err := s.queue.AcquireLock(ctx, id, "reconciler", staleThreshold)
		if err != nil || !acquired {
			continue // Either error or another worker has it
		}

		// We got the lock, notification is orphaned
		// Decide: if notification is too old (>1 hour) or has max attempts, move to DLQ
		// Note: We use createdAt (absolute age) rather than updatedAt (staleness) intentionally.
		// The query already filters for notifications stuck 10+ minutes (via updated_at).
		// Here we check if the notification was created 1+ hour ago to determine if it should
		// be moved to DLQ permanently vs re-enqueued for another attempt.
		if time.Since(createdAt) > time.Hour || attemptCount >= maxAttempts {
			if err := s.repo.MoveToDLQ(ctx, id, time.Now(), "orphaned notification", ErrorCodeServiceDown); err != nil {
				log.Printf("[reconciler] Failed to move orphaned notification %s to DLQ: %v", id, err)
			} else {
				log.Printf("[reconciler] Moved orphaned notification %s to DLQ", id)
				reconciled++
			}
		} else {
			// Re-enqueue for processing
			if err := s.queue.Enqueue(ctx, id, 0); err != nil {
				log.Printf("[reconciler] Failed to requeue orphaned notification %s: %v", id, err)
			} else {
				log.Printf("[reconciler] Requeued orphaned notification %s", id)
				reconciled++
			}
		}

		// Release the lock
		_ = s.queue.ReleaseLock(ctx, id, "reconciler")
	}

	if err := rows.Err(); err != nil {
		return reconciled, fmt.Errorf("error iterating orphaned notifications: %w", err)
	}

	if reconciled > 0 {
		log.Printf("[reconciler] Reconciled %d orphaned notifications", reconciled)
	}

	return reconciled, nil
}

// CheckDLQHealth checks DLQ size and reports alerts to Sentry.
// Called periodically by the worker or monitoring.
func (s *Service) CheckDLQHealth(ctx context.Context) error {
	stats, err := s.GetDLQStats(ctx)
	if err != nil {
		return err
	}

	// Alert thresholds
	const (
		warningThreshold  = 10
		criticalThreshold = 50
		staleHours        = 24
	)

	// Check total DLQ count
	if stats.TotalCount >= criticalThreshold {
		s.captureDLQAlert(sentry.LevelError, "DLQ critical threshold exceeded",
			stats.TotalCount, criticalThreshold, stats)
	} else if stats.TotalCount >= warningThreshold {
		s.captureDLQAlert(sentry.LevelWarning, "DLQ warning threshold exceeded",
			stats.TotalCount, warningThreshold, stats)
	}

	// Check for stale items
	if stats.OldestItem != nil {
		age := time.Since(*stats.OldestItem)
		if age > time.Duration(staleHours)*time.Hour {
			hub := sentry.CurrentHub().Clone()
			scope := hub.Scope()

			scope.SetTag("service", "notification")
			scope.SetTag("alert_type", "dlq_stale")
			scope.SetLevel(sentry.LevelWarning)

			scope.SetExtra("oldest_item_age_hours", age.Hours())
			scope.SetExtra("oldest_item", stats.OldestItem.Format(time.RFC3339))
			scope.SetExtra("threshold_hours", staleHours)

			hub.CaptureMessage(fmt.Sprintf("DLQ contains stale items (oldest: %.1f hours)", age.Hours()))
		}
	}

	return nil
}

// captureDLQAlert reports a DLQ threshold alert to Sentry.
func (s *Service) captureDLQAlert(level sentry.Level, message string, count int64, threshold int, stats *DLQStats) {
	hub := sentry.CurrentHub().Clone()
	scope := hub.Scope()

	scope.SetTag("service", "notification")
	scope.SetTag("alert_type", "dlq_threshold")
	scope.SetLevel(level)

	scope.SetExtra("dlq_count", count)
	scope.SetExtra("threshold", threshold)
	scope.SetExtra("count_by_type", stats.CountByType)
	scope.SetExtra("count_by_error", stats.CountByError)

	if stats.OldestItem != nil {
		scope.SetExtra("oldest_item", stats.OldestItem.Format(time.RFC3339))
	}

	hub.CaptureMessage(fmt.Sprintf("%s: %d items (threshold: %d)", message, count, threshold))
}
