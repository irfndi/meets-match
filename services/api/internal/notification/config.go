package notification

import (
	"os"
	"strconv"
	"time"
)

// Config holds notification service configuration.
// All values have sensible defaults and can be overridden via environment variables.
type Config struct {
	// Retry configuration
	DefaultMaxAttempts int           // Default: 5
	BaseRetryDelay     time.Duration // Default: 1 minute
	BackoffMultiplier  float64       // Default: 5.0 (1m, 5m, 25m, 2h, 10h)
	MaxRetryDelay      time.Duration // Default: 12 hours

	// Lock configuration
	LockTTL time.Duration // Default: 30 seconds

	// Queue TTLs
	DLQRetentionDays int // Default: 30

	// Rate limiting
	RateLimitPerUser int           // Default: 10 notifications per window
	RateLimitWindow  time.Duration // Default: 60 seconds

	// Cleanup
	ExpiredCleanupInterval time.Duration // Default: 1 hour
}

// DefaultConfig returns configuration with sensible defaults.
//
// Retry schedule with defaults:
//   - Attempt 1: Immediate
//   - Attempt 2: 1 minute delay
//   - Attempt 3: 5 minutes delay (1m * 5)
//   - Attempt 4: 25 minutes delay (5m * 5)
//   - Attempt 5: 2 hours delay (25m * 5, capped at 12h)
//   - After 5 failures: Move to DLQ
func DefaultConfig() Config {
	return Config{
		DefaultMaxAttempts:     5,
		BaseRetryDelay:         1 * time.Minute,
		BackoffMultiplier:      5.0,
		MaxRetryDelay:          12 * time.Hour,
		LockTTL:                30 * time.Second,
		DLQRetentionDays:       30,
		RateLimitPerUser:       10,
		RateLimitWindow:        60 * time.Second,
		ExpiredCleanupInterval: 1 * time.Hour,
	}
}

// LoadConfig loads configuration from environment variables.
// Environment variables:
//   - NOTIFICATION_MAX_ATTEMPTS: Maximum retry attempts (default: 5)
//   - NOTIFICATION_BASE_RETRY_SECONDS: Base delay for first retry (default: 60)
//   - NOTIFICATION_BACKOFF_MULTIPLIER: Multiplier for exponential backoff (default: 5.0)
//   - NOTIFICATION_MAX_RETRY_HOURS: Maximum retry delay cap (default: 12)
//   - NOTIFICATION_DLQ_RETENTION_DAYS: Days to keep DLQ items (default: 30)
//   - NOTIFICATION_RATE_LIMIT_PER_USER: Max notifications per user per window (default: 10)
//   - NOTIFICATION_RATE_LIMIT_WINDOW_SECONDS: Rate limit window (default: 60)
func LoadConfig() Config {
	cfg := DefaultConfig()

	if v := os.Getenv("NOTIFICATION_MAX_ATTEMPTS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.DefaultMaxAttempts = n
		}
	}

	if v := os.Getenv("NOTIFICATION_BASE_RETRY_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.BaseRetryDelay = time.Duration(n) * time.Second
		}
	}

	if v := os.Getenv("NOTIFICATION_BACKOFF_MULTIPLIER"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f > 1.0 {
			cfg.BackoffMultiplier = f
		}
	}

	if v := os.Getenv("NOTIFICATION_MAX_RETRY_HOURS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.MaxRetryDelay = time.Duration(n) * time.Hour
		}
	}

	if v := os.Getenv("NOTIFICATION_DLQ_RETENTION_DAYS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.DLQRetentionDays = n
		}
	}

	if v := os.Getenv("NOTIFICATION_RATE_LIMIT_PER_USER"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.RateLimitPerUser = n
		}
	}

	if v := os.Getenv("NOTIFICATION_RATE_LIMIT_WINDOW_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.RateLimitWindow = time.Duration(n) * time.Second
		}
	}

	return cfg
}

// WorkerConfig holds worker configuration.
type WorkerConfig struct {
	// Number of concurrent workers processing notifications
	Concurrency int

	// How often to poll the delayed queue for due notifications
	DelayedPollInterval time.Duration

	// How many notifications to fetch per poll
	BatchSize int

	// Worker identification prefix for logging
	WorkerPrefix string
}

// DefaultWorkerConfig returns sensible worker defaults.
func DefaultWorkerConfig() WorkerConfig {
	return WorkerConfig{
		Concurrency:         5,
		DelayedPollInterval: 10 * time.Second,
		BatchSize:           10,
		WorkerPrefix:        "notification-worker",
	}
}

// LoadWorkerConfig loads worker configuration from environment variables.
// Environment variables:
//   - NOTIFICATION_WORKER_CONCURRENCY: Number of concurrent processors (default: 5)
//   - NOTIFICATION_WORKER_BATCH_SIZE: Notifications per poll (default: 10)
//   - NOTIFICATION_WORKER_DELAYED_POLL_SECONDS: Delayed queue poll interval (default: 10)
func LoadWorkerConfig() WorkerConfig {
	cfg := DefaultWorkerConfig()

	if v := os.Getenv("NOTIFICATION_WORKER_CONCURRENCY"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.Concurrency = n
		}
	}

	if v := os.Getenv("NOTIFICATION_WORKER_BATCH_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.BatchSize = n
		}
	}

	if v := os.Getenv("NOTIFICATION_WORKER_DELAYED_POLL_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.DelayedPollInterval = time.Duration(n) * time.Second
		}
	}

	return cfg
}
