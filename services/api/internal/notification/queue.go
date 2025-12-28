package notification

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Queue defines the interface for notification queue operations.
// The queue is implemented using Redis sorted sets for ordering and delayed processing.
type Queue interface {
	// Enqueue adds a notification to the pending queue.
	Enqueue(ctx context.Context, id uuid.UUID, priority int) error

	// Dequeue retrieves notifications ready for processing.
	Dequeue(ctx context.Context, limit int) ([]uuid.UUID, error)

	// MoveToDelayed moves a notification to the delayed queue for retry.
	MoveToDelayed(ctx context.Context, id uuid.UUID, retryAt time.Time) error

	// MoveToDLQ moves a notification to the dead letter queue.
	MoveToDLQ(ctx context.Context, id uuid.UUID) error

	// PromoteDelayed moves due notifications from delayed to pending queue.
	PromoteDelayed(ctx context.Context, now time.Time) (int, error)

	// Remove removes a notification from all queues.
	Remove(ctx context.Context, id uuid.UUID) error

	// ReplayFromDLQ moves a notification from DLQ back to pending.
	ReplayFromDLQ(ctx context.Context, id uuid.UUID) error

	// AcquireLock acquires a processing lock for a notification.
	AcquireLock(ctx context.Context, id uuid.UUID, workerID string, ttl time.Duration) (bool, error)

	// ReleaseLock releases a processing lock.
	ReleaseLock(ctx context.Context, id uuid.UUID, workerID string) error

	// GetQueueStats returns queue statistics.
	GetQueueStats(ctx context.Context) (*QueueStats, error)

	// Close closes the queue connection.
	Close() error
}

// QueueStats holds queue statistics.
type QueueStats struct {
	PendingCount int64 `json:"pending_count"`
	DelayedCount int64 `json:"delayed_count"`
	DLQCount     int64 `json:"dlq_count"`
}

// Redis key patterns for queues.
const (
	keyPendingQueue = "notifications:queue:pending"
	keyDelayedQueue = "notifications:queue:delayed"
	keyDLQQueue     = "notifications:queue:dlq"
	keyLockPrefix   = "notifications:lock:"
)

// RedisQueue implements Queue using Redis.
type RedisQueue struct {
	client *redis.Client
	config Config
}

// NewRedisQueue creates a new Redis queue from a connection URL.
// URL format: redis://[:password@]host:port[/db]
func NewRedisQueue(redisURL string, config Config) (*RedisQueue, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &RedisQueue{
		client: client,
		config: config,
	}, nil
}

// NewRedisQueueFromClient creates a RedisQueue from an existing client.
func NewRedisQueueFromClient(client *redis.Client, config Config) *RedisQueue {
	return &RedisQueue{
		client: client,
		config: config,
	}
}

// Enqueue adds a notification to the pending queue.
// Score is calculated as: priority * 1e19 - timestamp
// This ensures higher priority items are processed first (larger priority = higher score),
// and older items within same priority are processed first (subtracting timestamp means
// older timestamps yield higher scores).
func (q *RedisQueue) Enqueue(ctx context.Context, id uuid.UUID, priority int) error {
	// Score: higher priority first, then FIFO (older first)
	// Multiply priority by 1e19 to ensure it dominates over timestamp (~1.7e18 nanoseconds)
	// Subtract timestamp so older items have higher scores within same priority
	score := float64(priority)*1e19 - float64(time.Now().UnixNano())

	err := q.client.ZAdd(ctx, keyPendingQueue, redis.Z{
		Score:  score,
		Member: id.String(),
	}).Err()

	if err != nil {
		return fmt.Errorf("failed to enqueue notification: %w", err)
	}

	return nil
}

// Dequeue retrieves notifications ready for processing.
// Returns notification IDs in priority order (highest priority, oldest first).
func (q *RedisQueue) Dequeue(ctx context.Context, limit int) ([]uuid.UUID, error) {
	// Get items with highest scores (highest priority)
	// ZREVRANGE returns items from highest to lowest score
	results, err := q.client.ZRevRange(ctx, keyPendingQueue, 0, int64(limit-1)).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to dequeue notifications: %w", err)
	}

	ids := make([]uuid.UUID, 0, len(results))
	for _, r := range results {
		id, err := uuid.Parse(r)
		if err != nil {
			continue
		}
		ids = append(ids, id)
	}

	return ids, nil
}

// MoveToDelayed moves a notification to the delayed queue for retry.
func (q *RedisQueue) MoveToDelayed(ctx context.Context, id uuid.UUID, retryAt time.Time) error {
	pipe := q.client.Pipeline()

	// Remove from pending
	pipe.ZRem(ctx, keyPendingQueue, id.String())

	// Add to delayed with retry time as score
	pipe.ZAdd(ctx, keyDelayedQueue, redis.Z{
		Score:  float64(retryAt.Unix()),
		Member: id.String(),
	})

	_, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to move notification to delayed: %w", err)
	}

	return nil
}

// MoveToDLQ moves a notification to the dead letter queue.
func (q *RedisQueue) MoveToDLQ(ctx context.Context, id uuid.UUID) error {
	pipe := q.client.Pipeline()

	// Remove from all active queues
	pipe.ZRem(ctx, keyPendingQueue, id.String())
	pipe.ZRem(ctx, keyDelayedQueue, id.String())

	// Add to DLQ with current timestamp as score
	pipe.ZAdd(ctx, keyDLQQueue, redis.Z{
		Score:  float64(time.Now().Unix()),
		Member: id.String(),
	})

	// Set TTL on DLQ items (via separate key or let items expire naturally)
	// For now, we rely on periodic cleanup

	_, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to move notification to DLQ: %w", err)
	}

	return nil
}

// PromoteDelayed moves due notifications from delayed to pending queue.
// Returns the number of notifications promoted.
func (q *RedisQueue) PromoteDelayed(ctx context.Context, now time.Time) (int, error) {
	// Get all delayed notifications that are due
	results, err := q.client.ZRangeByScore(ctx, keyDelayedQueue, &redis.ZRangeBy{
		Min:   "-inf",
		Max:   strconv.FormatInt(now.Unix(), 10),
		Count: 100, // Process in batches
	}).Result()

	if err != nil {
		return 0, fmt.Errorf("failed to get delayed notifications: %w", err)
	}

	if len(results) == 0 {
		return 0, nil
	}

	pipe := q.client.Pipeline()

	for _, idStr := range results {
		// Remove from delayed
		pipe.ZRem(ctx, keyDelayedQueue, idStr)

		// Add to pending with current time (will be processed soon)
		pipe.ZAdd(ctx, keyPendingQueue, redis.Z{
			Score:  float64(time.Now().UnixNano()),
			Member: idStr,
		})
	}

	_, err = pipe.Exec(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to promote delayed notifications: %w", err)
	}

	return len(results), nil
}

// Remove removes a notification from all queues.
func (q *RedisQueue) Remove(ctx context.Context, id uuid.UUID) error {
	pipe := q.client.Pipeline()

	pipe.ZRem(ctx, keyPendingQueue, id.String())
	pipe.ZRem(ctx, keyDelayedQueue, id.String())
	pipe.ZRem(ctx, keyDLQQueue, id.String())
	pipe.Del(ctx, keyLockPrefix+id.String())

	_, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to remove notification from queues: %w", err)
	}

	return nil
}

// ReplayFromDLQ moves a notification from DLQ back to pending.
func (q *RedisQueue) ReplayFromDLQ(ctx context.Context, id uuid.UUID) error {
	pipe := q.client.Pipeline()

	// Remove from DLQ
	pipe.ZRem(ctx, keyDLQQueue, id.String())

	// Add to pending
	pipe.ZAdd(ctx, keyPendingQueue, redis.Z{
		Score:  float64(time.Now().UnixNano()),
		Member: id.String(),
	})

	_, err := pipe.Exec(ctx)
	if err != nil {
		return fmt.Errorf("failed to replay notification from DLQ: %w", err)
	}

	return nil
}

// AcquireLock acquires a processing lock for a notification.
// Uses SET NX EX pattern for atomic lock acquisition.
func (q *RedisQueue) AcquireLock(ctx context.Context, id uuid.UUID, workerID string, ttl time.Duration) (bool, error) {
	key := keyLockPrefix + id.String()

	success, err := q.client.SetNX(ctx, key, workerID, ttl).Result()
	if err != nil {
		return false, fmt.Errorf("failed to acquire lock: %w", err)
	}

	return success, nil
}

// ReleaseLock releases a processing lock.
// Only releases if the lock is held by the specified worker.
func (q *RedisQueue) ReleaseLock(ctx context.Context, id uuid.UUID, workerID string) error {
	key := keyLockPrefix + id.String()

	// Use Lua script for atomic check-and-delete
	script := redis.NewScript(`
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("del", KEYS[1])
		else
			return 0
		end
	`)

	_, err := script.Run(ctx, q.client, []string{key}, workerID).Result()
	if err != nil && err != redis.Nil {
		return fmt.Errorf("failed to release lock: %w", err)
	}

	return nil
}

// GetQueueStats returns queue statistics.
func (q *RedisQueue) GetQueueStats(ctx context.Context) (*QueueStats, error) {
	pipe := q.client.Pipeline()

	pendingCmd := pipe.ZCard(ctx, keyPendingQueue)
	delayedCmd := pipe.ZCard(ctx, keyDelayedQueue)
	dlqCmd := pipe.ZCard(ctx, keyDLQQueue)

	_, err := pipe.Exec(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get queue stats: %w", err)
	}

	return &QueueStats{
		PendingCount: pendingCmd.Val(),
		DelayedCount: delayedCmd.Val(),
		DLQCount:     dlqCmd.Val(),
	}, nil
}

// Close closes the Redis connection.
func (q *RedisQueue) Close() error {
	return q.client.Close()
}
