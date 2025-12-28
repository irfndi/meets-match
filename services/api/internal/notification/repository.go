package notification

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Repository handles PostgreSQL operations for notifications.
// It provides the audit trail and persistent storage for notifications.
type Repository interface {
	// Create inserts a new notification record.
	Create(ctx context.Context, req CreateRequest) (*Notification, error)

	// GetByID retrieves a notification by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*Notification, error)

	// GetByIdempotencyKey retrieves a notification by its idempotency key.
	GetByIdempotencyKey(ctx context.Context, key string) (*Notification, error)

	// UpdateForRetry updates a notification for retry with new attempt count and next retry time.
	UpdateForRetry(ctx context.Context, id uuid.UUID, attemptCount int, nextRetryAt time.Time, lastError string, errorCode ErrorCode) error

	// MarkDelivered marks a notification as successfully delivered.
	MarkDelivered(ctx context.Context, id uuid.UUID, deliveredAt time.Time) error

	// MoveToDLQ marks a notification as moved to dead letter queue.
	MoveToDLQ(ctx context.Context, id uuid.UUID, dlqAt time.Time, lastError string, errorCode ErrorCode) error

	// CreateAttempt records a delivery attempt.
	CreateAttempt(ctx context.Context, attempt Attempt) error

	// GetPendingNotifications retrieves notifications ready for processing.
	GetPendingNotifications(ctx context.Context, limit int) ([]*Notification, error)

	// GetDLQNotifications retrieves notifications in the dead letter queue.
	GetDLQNotifications(ctx context.Context, filter DLQFilter) ([]*Notification, error)

	// GetDLQStats returns statistics about the dead letter queue.
	GetDLQStats(ctx context.Context) (*DLQStats, error)

	// ResetForReplay resets a DLQ notification for replay.
	ResetForReplay(ctx context.Context, id uuid.UUID) error

	// CleanupExpired removes expired notifications.
	CleanupExpired(ctx context.Context) (int64, error)
}

// PostgresRepository implements Repository using PostgreSQL.
type PostgresRepository struct {
	db     *sql.DB
	config Config
}

// NewPostgresRepository creates a new PostgreSQL repository.
func NewPostgresRepository(db *sql.DB, config Config) *PostgresRepository {
	return &PostgresRepository{
		db:     db,
		config: config,
	}
}

// ErrConflict is returned when an idempotency key conflict occurs.
var ErrConflict = errors.New("idempotency key conflict")

// ErrNotFound is returned when a notification is not found.
var ErrNotFound = errors.New("notification not found")

// IsConflictError checks if an error is a conflict error.
func IsConflictError(err error) bool {
	return errors.Is(err, ErrConflict)
}

// Create inserts a new notification record.
func (r *PostgresRepository) Create(ctx context.Context, req CreateRequest) (*Notification, error) {
	id := uuid.New()
	now := time.Now()

	// Set defaults
	maxAttempts := req.MaxAttempts
	if maxAttempts == 0 {
		maxAttempts = r.config.DefaultMaxAttempts
	}

	channel := req.Channel
	if channel == "" {
		channel = ChannelTelegram
	}

	payloadJSON, err := json.Marshal(req.Payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	query := `
		INSERT INTO notifications (
			id, user_id, type, channel, payload, status, priority,
			attempt_count, max_attempts, related_match_id, related_user_id,
			created_at, updated_at, idempotency_key, expires_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7,
			$8, $9, $10, $11,
			$12, $13, $14, $15
		)
		RETURNING id, user_id, type, channel, payload, status, priority,
			attempt_count, max_attempts, next_retry_at, last_error, last_error_code,
			related_match_id, related_user_id, created_at, updated_at,
			delivered_at, dlq_at, idempotency_key, expires_at
	`

	var n Notification
	var payloadBytes []byte
	var lastErrorCode sql.NullString

	err = r.db.QueryRowContext(ctx, query,
		id, req.UserID, req.Type, channel, payloadJSON, StatusPending, req.Priority,
		0, maxAttempts, req.RelatedMatchID, req.RelatedUserID,
		now, now, req.IdempotencyKey, req.ExpiresAt,
	).Scan(
		&n.ID, &n.UserID, &n.Type, &n.Channel, &payloadBytes, &n.Status, &n.Priority,
		&n.AttemptCount, &n.MaxAttempts, &n.NextRetryAt, &n.LastError, &lastErrorCode,
		&n.RelatedMatchID, &n.RelatedUserID, &n.CreatedAt, &n.UpdatedAt,
		&n.DeliveredAt, &n.DLQAt, &n.IdempotencyKey, &n.ExpiresAt,
	)

	if err != nil {
		// Check for unique constraint violation (idempotency key)
		if isUniqueViolation(err) {
			return nil, ErrConflict
		}
		return nil, fmt.Errorf("failed to insert notification: %w", err)
	}

	if err := json.Unmarshal(payloadBytes, &n.Payload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	if lastErrorCode.Valid {
		ec := ErrorCode(lastErrorCode.String)
		n.LastErrorCode = &ec
	}

	return &n, nil
}

// GetByID retrieves a notification by its ID.
func (r *PostgresRepository) GetByID(ctx context.Context, id uuid.UUID) (*Notification, error) {
	query := `
		SELECT id, user_id, type, channel, payload, status, priority,
			attempt_count, max_attempts, next_retry_at, last_error, last_error_code,
			related_match_id, related_user_id, created_at, updated_at,
			delivered_at, dlq_at, idempotency_key, expires_at
		FROM notifications
		WHERE id = $1
	`

	var n Notification
	var payloadBytes []byte
	var lastErrorCode sql.NullString

	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&n.ID, &n.UserID, &n.Type, &n.Channel, &payloadBytes, &n.Status, &n.Priority,
		&n.AttemptCount, &n.MaxAttempts, &n.NextRetryAt, &n.LastError, &lastErrorCode,
		&n.RelatedMatchID, &n.RelatedUserID, &n.CreatedAt, &n.UpdatedAt,
		&n.DeliveredAt, &n.DLQAt, &n.IdempotencyKey, &n.ExpiresAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get notification: %w", err)
	}

	if err := json.Unmarshal(payloadBytes, &n.Payload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	if lastErrorCode.Valid {
		ec := ErrorCode(lastErrorCode.String)
		n.LastErrorCode = &ec
	}

	return &n, nil
}

// GetByIdempotencyKey retrieves a notification by its idempotency key.
func (r *PostgresRepository) GetByIdempotencyKey(ctx context.Context, key string) (*Notification, error) {
	query := `
		SELECT id, user_id, type, channel, payload, status, priority,
			attempt_count, max_attempts, next_retry_at, last_error, last_error_code,
			related_match_id, related_user_id, created_at, updated_at,
			delivered_at, dlq_at, idempotency_key, expires_at
		FROM notifications
		WHERE idempotency_key = $1
	`

	var n Notification
	var payloadBytes []byte
	var lastErrorCode sql.NullString

	err := r.db.QueryRowContext(ctx, query, key).Scan(
		&n.ID, &n.UserID, &n.Type, &n.Channel, &payloadBytes, &n.Status, &n.Priority,
		&n.AttemptCount, &n.MaxAttempts, &n.NextRetryAt, &n.LastError, &lastErrorCode,
		&n.RelatedMatchID, &n.RelatedUserID, &n.CreatedAt, &n.UpdatedAt,
		&n.DeliveredAt, &n.DLQAt, &n.IdempotencyKey, &n.ExpiresAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("failed to get notification by idempotency key: %w", err)
	}

	if err := json.Unmarshal(payloadBytes, &n.Payload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	if lastErrorCode.Valid {
		ec := ErrorCode(lastErrorCode.String)
		n.LastErrorCode = &ec
	}

	return &n, nil
}

// UpdateForRetry updates a notification for retry.
func (r *PostgresRepository) UpdateForRetry(ctx context.Context, id uuid.UUID, attemptCount int, nextRetryAt time.Time, lastError string, errorCode ErrorCode) error {
	query := `
		UPDATE notifications
		SET attempt_count = $2,
			next_retry_at = $3,
			last_error = $4,
			last_error_code = $5,
			status = $6,
			updated_at = $7
		WHERE id = $1
	`

	result, err := r.db.ExecContext(ctx, query, id, attemptCount, nextRetryAt, lastError, errorCode, StatusFailed, time.Now())
	if err != nil {
		return fmt.Errorf("failed to update notification for retry: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return ErrNotFound
	}

	return nil
}

// MarkDelivered marks a notification as successfully delivered.
func (r *PostgresRepository) MarkDelivered(ctx context.Context, id uuid.UUID, deliveredAt time.Time) error {
	query := `
		UPDATE notifications
		SET status = $2,
			delivered_at = $3,
			updated_at = $4
		WHERE id = $1
	`

	result, err := r.db.ExecContext(ctx, query, id, StatusDelivered, deliveredAt, time.Now())
	if err != nil {
		return fmt.Errorf("failed to mark notification as delivered: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return ErrNotFound
	}

	return nil
}

// MoveToDLQ marks a notification as moved to dead letter queue.
func (r *PostgresRepository) MoveToDLQ(ctx context.Context, id uuid.UUID, dlqAt time.Time, lastError string, errorCode ErrorCode) error {
	query := `
		UPDATE notifications
		SET status = $2,
			dlq_at = $3,
			last_error = $4,
			last_error_code = $5,
			updated_at = $6
		WHERE id = $1
	`

	result, err := r.db.ExecContext(ctx, query, id, StatusDLQ, dlqAt, lastError, errorCode, time.Now())
	if err != nil {
		return fmt.Errorf("failed to move notification to DLQ: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return ErrNotFound
	}

	return nil
}

// CreateAttempt records a delivery attempt.
func (r *PostgresRepository) CreateAttempt(ctx context.Context, attempt Attempt) error {
	query := `
		INSERT INTO notification_attempts (
			id, notification_id, attempt_number, success,
			error_message, error_code, response_data,
			started_at, completed_at, duration_ms, worker_id
		) VALUES (
			$1, $2, $3, $4,
			$5, $6, $7,
			$8, $9, $10, $11
		)
	`

	id := attempt.ID
	if id == uuid.Nil {
		id = uuid.New()
	}

	var errorCodeStr *string
	if attempt.ErrorCode != nil {
		s := string(*attempt.ErrorCode)
		errorCodeStr = &s
	}

	_, err := r.db.ExecContext(ctx, query,
		id, attempt.NotificationID, attempt.AttemptNumber, attempt.Success,
		attempt.ErrorMessage, errorCodeStr, attempt.ResponseData,
		attempt.StartedAt, attempt.CompletedAt, attempt.DurationMs, attempt.WorkerID,
	)

	if err != nil {
		return fmt.Errorf("failed to create attempt: %w", err)
	}

	return nil
}

// GetPendingNotifications retrieves notifications ready for processing.
// This is used as a fallback when Redis is unavailable.
func (r *PostgresRepository) GetPendingNotifications(ctx context.Context, limit int) ([]*Notification, error) {
	query := `
		SELECT id, user_id, type, channel, payload, status, priority,
			attempt_count, max_attempts, next_retry_at, last_error, last_error_code,
			related_match_id, related_user_id, created_at, updated_at,
			delivered_at, dlq_at, idempotency_key, expires_at
		FROM notifications
		WHERE status IN ('pending', 'failed')
			AND (next_retry_at IS NULL OR next_retry_at <= NOW())
			AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY priority DESC, created_at ASC
		LIMIT $1
	`

	rows, err := r.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get pending notifications: %w", err)
	}
	defer func() { _ = rows.Close() }()

	return r.scanNotifications(rows)
}

// GetDLQNotifications retrieves notifications in the dead letter queue.
func (r *PostgresRepository) GetDLQNotifications(ctx context.Context, filter DLQFilter) ([]*Notification, error) {
	query := `
		SELECT id, user_id, type, channel, payload, status, priority,
			attempt_count, max_attempts, next_retry_at, last_error, last_error_code,
			related_match_id, related_user_id, created_at, updated_at,
			delivered_at, dlq_at, idempotency_key, expires_at
		FROM notifications
		WHERE status = 'dlq'
	`

	args := []interface{}{}
	argIdx := 1

	if filter.Type != nil {
		query += fmt.Sprintf(" AND type = $%d", argIdx)
		args = append(args, *filter.Type)
		argIdx++
	}

	if filter.ErrorCode != nil {
		query += fmt.Sprintf(" AND last_error_code = $%d", argIdx)
		args = append(args, string(*filter.ErrorCode))
		argIdx++
	}

	if filter.Since != nil {
		query += fmt.Sprintf(" AND dlq_at >= $%d", argIdx)
		args = append(args, *filter.Since)
		argIdx++
	}

	query += " ORDER BY dlq_at DESC"

	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	query += fmt.Sprintf(" LIMIT $%d", argIdx)
	args = append(args, limit)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get DLQ notifications: %w", err)
	}
	defer func() { _ = rows.Close() }()

	return r.scanNotifications(rows)
}

// GetDLQStats returns statistics about the dead letter queue.
func (r *PostgresRepository) GetDLQStats(ctx context.Context) (*DLQStats, error) {
	stats := &DLQStats{
		CountByType:  make(map[string]int64),
		CountByError: make(map[string]int64),
	}

	// Get total count
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM notifications WHERE status = 'dlq'").Scan(&stats.TotalCount)
	if err != nil {
		return nil, fmt.Errorf("failed to get DLQ count: %w", err)
	}

	// Get count by type
	typeRows, err := r.db.QueryContext(ctx, `
		SELECT type, COUNT(*)
		FROM notifications
		WHERE status = 'dlq'
		GROUP BY type
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to get DLQ count by type: %w", err)
	}
	defer func() { _ = typeRows.Close() }()

	for typeRows.Next() {
		var t string
		var count int64
		if err := typeRows.Scan(&t, &count); err != nil {
			continue
		}
		stats.CountByType[t] = count
	}

	// Get count by error
	errorRows, err := r.db.QueryContext(ctx, `
		SELECT COALESCE(last_error_code, 'UNKNOWN'), COUNT(*)
		FROM notifications
		WHERE status = 'dlq'
		GROUP BY last_error_code
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to get DLQ count by error: %w", err)
	}
	defer func() { _ = errorRows.Close() }()

	for errorRows.Next() {
		var e string
		var count int64
		if err := errorRows.Scan(&e, &count); err != nil {
			continue
		}
		stats.CountByError[e] = count
	}

	// Get oldest item
	var oldestAt sql.NullTime
	err = r.db.QueryRowContext(ctx, `
		SELECT MIN(dlq_at) FROM notifications WHERE status = 'dlq'
	`).Scan(&oldestAt)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("failed to get oldest DLQ item: %w", err)
	}
	if oldestAt.Valid {
		stats.OldestItem = &oldestAt.Time
	}

	return stats, nil
}

// ResetForReplay resets a DLQ notification for replay.
func (r *PostgresRepository) ResetForReplay(ctx context.Context, id uuid.UUID) error {
	query := `
		UPDATE notifications
		SET status = $2,
			attempt_count = 0,
			next_retry_at = NULL,
			dlq_at = NULL,
			updated_at = $3
		WHERE id = $1 AND status = 'dlq'
	`

	result, err := r.db.ExecContext(ctx, query, id, StatusPending, time.Now())
	if err != nil {
		return fmt.Errorf("failed to reset notification for replay: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rows == 0 {
		return ErrNotFound
	}

	return nil
}

// CleanupExpired removes expired notifications.
func (r *PostgresRepository) CleanupExpired(ctx context.Context) (int64, error) {
	result, err := r.db.ExecContext(ctx, `
		DELETE FROM notifications
		WHERE expires_at IS NOT NULL AND expires_at < NOW()
	`)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup expired notifications: %w", err)
	}

	return result.RowsAffected()
}

// scanNotifications scans rows into Notification slice.
func (r *PostgresRepository) scanNotifications(rows *sql.Rows) ([]*Notification, error) {
	var notifications []*Notification

	for rows.Next() {
		var n Notification
		var payloadBytes []byte
		var lastErrorCode sql.NullString

		err := rows.Scan(
			&n.ID, &n.UserID, &n.Type, &n.Channel, &payloadBytes, &n.Status, &n.Priority,
			&n.AttemptCount, &n.MaxAttempts, &n.NextRetryAt, &n.LastError, &lastErrorCode,
			&n.RelatedMatchID, &n.RelatedUserID, &n.CreatedAt, &n.UpdatedAt,
			&n.DeliveredAt, &n.DLQAt, &n.IdempotencyKey, &n.ExpiresAt,
		)
		if err != nil {
			continue
		}

		if err := json.Unmarshal(payloadBytes, &n.Payload); err != nil {
			continue
		}

		if lastErrorCode.Valid {
			ec := ErrorCode(lastErrorCode.String)
			n.LastErrorCode = &ec
		}

		notifications = append(notifications, &n)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}

	return notifications, nil
}

// isUniqueViolation checks if error is a unique constraint violation.
// Uses proper pq.Error type assertion for PostgreSQL error code 23505.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		// PostgreSQL error code 23505 = unique_violation
		return pqErr.Code == "23505"
	}
	return false
}
