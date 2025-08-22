package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-redis/redis/extra/redisotel/v8"
	"github.com/go-redis/redis/v8"
	"github.com/meetsmatch/meetsmatch/internal/telemetry"
)

// RedisConfig holds Redis connection configuration
type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
	PoolSize int
}

// RedisClientInterface defines the Redis client interface for testing
type RedisClientInterface interface {
	Set(ctx context.Context, key string, value interface{}, expiration time.Duration) *redis.StatusCmd
	Get(ctx context.Context, key string) *redis.StringCmd
	Del(ctx context.Context, keys ...string) *redis.IntCmd
	Keys(ctx context.Context, pattern string) *redis.StringSliceCmd
	Ping(ctx context.Context) *redis.StatusCmd
	HSet(ctx context.Context, key string, values ...interface{}) *redis.IntCmd
	HGet(ctx context.Context, key, field string) *redis.StringCmd
	HDel(ctx context.Context, key string, fields ...string) *redis.IntCmd
	Expire(ctx context.Context, key string, expiration time.Duration) *redis.BoolCmd
	TTL(ctx context.Context, key string) *redis.DurationCmd
	Exists(ctx context.Context, keys ...string) *redis.IntCmd
	Info(ctx context.Context, section ...string) *redis.StringCmd
	Close() error
}

// RedisServiceInterface defines the interface for Redis service operations
type RedisServiceInterface interface {
	SetCache(key string, data interface{}, ttlSeconds int) error
	GetCache(key string, dest interface{}) error
	DeleteCache(key string) error
	Set(key string, value interface{}, ttl time.Duration) error
	Get(key string) (string, error)
	Delete(key string) error
	Exists(key string) (bool, error)
	Expire(key string, ttl time.Duration) error
	TTL(key string) (time.Duration, error)
	DeletePattern(pattern string) (int64, error)
	SetFeatureFlag(key string, value bool, ttl time.Duration) error
	GetStats() map[string]interface{}
	InvalidateAll() error
	HealthCheck() bool
	Close() error
}

// RedisService provides Redis operations with caching strategies
type RedisService struct {
	client RedisClientInterface
	config *RedisConfig
	ctx    context.Context
}

// CacheEntry represents a cached item with metadata
type CacheEntry struct {
	Data      interface{} `json:"data"`
	Timestamp time.Time   `json:"timestamp"`
	TTL       int         `json:"ttl"`
	Version   string      `json:"version"`
}

// CacheStats holds cache performance metrics
type CacheStats struct {
	Hits        int64 `json:"hits"`
	Misses      int64 `json:"misses"`
	Sets        int64 `json:"sets"`
	Deletes     int64 `json:"deletes"`
	Connections int   `json:"connections"`
}

// HitRate calculates the cache hit rate
func (cs *CacheStats) HitRate() float64 {
	total := cs.Hits + cs.Misses
	if total == 0 {
		return 0.0
	}
	return float64(cs.Hits) / float64(total)
}

var (
	// Global Redis service instance
	redisService *RedisService

	// Default TTL values
	DefaultTTL     = 3600  // 1 hour
	SessionTTL     = 86400 // 24 hours
	UserCacheTTL   = 1800  // 30 minutes
	MatchCacheTTL  = 7200  // 2 hours
	FeatureFlagTTL = 300   // 5 minutes
)

// NewRedisService creates a new Redis service instance
func NewRedisService(config *RedisConfig) (*RedisService, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation": "redis_connection",
		"service":   "cache",
	})

	if config == nil {
		config = getConfigFromEnv()
	}

	logger = logger.WithFields(map[string]interface{}{
		"host":      config.Host,
		"port":      config.Port,
		"db":        config.DB,
		"pool_size": config.PoolSize,
	})

	logger.Info("Establishing Redis connection")

	rdb := redis.NewClient(&redis.Options{
		Addr:       fmt.Sprintf("%s:%d", config.Host, config.Port),
		Password:   config.Password,
		DB:         config.DB,
		PoolSize:   config.PoolSize,
		MaxRetries: 3,
	})

	// Test connection
	if err := rdb.Ping(ctx).Err(); err != nil {
		logger.WithError(err).Error("Failed to connect to Redis")
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	service := &RedisService{
		client: rdb,
		config: config,
		ctx:    ctx,
	}

	logger.Info("Redis connected successfully")
	return service, nil
}

// NewInstrumentedRedisService creates a new Redis service instance with OpenTelemetry instrumentation
func NewInstrumentedRedisService(config *RedisConfig) (*RedisService, error) {
	ctx := telemetry.WithCorrelationID(context.Background(), telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation":       "instrumented_redis_connection",
		"service":         "cache",
		"instrumentation": "opentelemetry",
	})

	if config == nil {
		config = getConfigFromEnv()
	}

	logger = logger.WithFields(map[string]interface{}{
		"host":      config.Host,
		"port":      config.Port,
		"db":        config.DB,
		"pool_size": config.PoolSize,
	})

	logger.Info("Establishing instrumented Redis connection")

	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", config.Host, config.Port),
		Password: config.Password,
		DB:       config.DB,
		PoolSize: config.PoolSize,
	})

	// Add OpenTelemetry instrumentation
	client.AddHook(redisotel.NewTracingHook())
	logger.Debug("OpenTelemetry tracing hook added to Redis client")

	// Test connection
	if err := client.Ping(ctx).Err(); err != nil {
		logger.WithError(err).Error("Failed to connect to instrumented Redis")
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	logger.Info("Instrumented Redis connected successfully")
	return &RedisService{
		client: client,
		config: config,
		ctx:    ctx,
	}, nil
}

// InitializeGlobalRedis initializes the global Redis service
func InitializeGlobalRedis() error {
	service, err := NewRedisService(nil)
	if err != nil {
		return err
	}
	redisService = service
	return nil
}

// GetRedisService returns the global Redis service instance
func GetRedisService() *RedisService {
	if redisService == nil {
		logger := telemetry.GetContextualLogger(context.Background())
		logger.WithFields(map[string]interface{}{
			"operation": "get_redis_service",
			"service":   "cache",
			"error":     "service_not_initialized",
		}).Fatal("Redis service not initialized. Call InitializeGlobalRedis() first.")
	}
	return redisService
}

// getConfigFromEnv loads Redis configuration from environment variables
func getConfigFromEnv() *RedisConfig {
	port, _ := strconv.Atoi(getEnvOrDefault("REDIS_PORT", "6379"))
	db, _ := strconv.Atoi(getEnvOrDefault("REDIS_DB", "0"))
	poolSize, _ := strconv.Atoi(getEnvOrDefault("REDIS_POOL_SIZE", "10"))

	return &RedisConfig{
		Host:     getEnvOrDefault("REDIS_HOST", "localhost"),
		Port:     port,
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       db,
		PoolSize: poolSize,
	}
}

// getEnvOrDefault returns environment variable value or default
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// Basic Redis Operations

// Set stores a value with TTL
func (r *RedisService) Set(key string, value interface{}, ttl time.Duration) error {
	ctx := telemetry.WithCorrelationID(r.ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation":   "redis_set",
		"key":         key,
		"ttl_seconds": ttl.Seconds(),
		"service":     "cache",
	})

	logger.Debug("Setting cache value")

	data, err := json.Marshal(value)
	if err != nil {
		logger.WithError(err).Error("Failed to marshal value for cache")
		return fmt.Errorf("failed to marshal value: %w", err)
	}

	expiration := ttl
	if ttl == 0 {
		expiration = time.Duration(DefaultTTL) * time.Second
		logger = logger.WithField("ttl_seconds", DefaultTTL)
	}

	err = r.client.Set(r.ctx, key, data, expiration).Err()
	if err != nil {
		logger.WithError(err).Error("Failed to set cache value")
	} else {
		logger.Debug("Cache value set successfully")
	}

	return err
}

// SetWithTTLSeconds stores a value with TTL in seconds (legacy method)
func (r *RedisService) SetWithTTLSeconds(key string, value interface{}, ttlSeconds int) error {
	ttl := time.Duration(DefaultTTL) * time.Second
	if ttlSeconds > 0 {
		ttl = time.Duration(ttlSeconds) * time.Second
	}
	return r.Set(key, value, ttl)
}

// Get retrieves a string value directly
func (r *RedisService) Get(key string) (string, error) {
	ctx := telemetry.WithCorrelationID(r.ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation": "redis_get",
		"key":       key,
		"service":   "cache",
	})

	logger.Debug("Getting cache value")

	val, err := r.client.Get(r.ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			logger.Debug("Cache miss - key not found")
			return "", fmt.Errorf("key not found: %s", key)
		}
		logger.WithError(err).Error("Failed to get cache value")
		return "", fmt.Errorf("failed to get key %s: %w", key, err)
	}

	logger.Debug("Cache hit - value retrieved successfully")
	return val, nil
}

// GetWithUnmarshal retrieves a value and unmarshals it
func (r *RedisService) GetWithUnmarshal(key string, dest interface{}) error {
	ctx := telemetry.WithCorrelationID(r.ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation": "redis_get_unmarshal",
		"key":       key,
		"service":   "cache",
	})

	logger.Debug("Getting and unmarshaling cache value")

	val, err := r.client.Get(r.ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			logger.Debug("Cache miss - key not found")
			return fmt.Errorf("key not found: %s", key)
		}
		logger.WithError(err).Error("Failed to get cache value")
		return fmt.Errorf("failed to get key %s: %w", key, err)
	}

	err = json.Unmarshal([]byte(val), dest)
	if err != nil {
		logger.WithError(err).Error("Failed to unmarshal cache value")
	} else {
		logger.Debug("Cache value retrieved and unmarshaled successfully")
	}

	return err
}

// GetString retrieves a string value
func (r *RedisService) GetString(key string) (string, error) {
	return r.client.Get(r.ctx, key).Result()
}

// Delete removes a key
func (r *RedisService) Delete(key string) error {
	ctx := telemetry.WithCorrelationID(r.ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation": "redis_delete",
		"key":       key,
		"service":   "cache",
	})

	logger.Debug("Deleting cache key")

	err := r.client.Del(r.ctx, key).Err()
	if err != nil {
		logger.WithError(err).Error("Failed to delete cache key")
	} else {
		logger.Debug("Cache key deleted successfully")
	}

	return err
}

// Exists checks if a key exists
func (r *RedisService) Exists(key string) (bool, error) {
	result, err := r.client.Exists(r.ctx, key).Result()
	return result > 0, err
}

// Expire sets TTL for a key
func (r *RedisService) Expire(key string, ttl time.Duration) error {
	return r.client.Expire(r.ctx, key, ttl).Err()
}

// TTL gets remaining time to live
func (r *RedisService) TTL(key string) (time.Duration, error) {
	return r.client.TTL(r.ctx, key).Result()
}

// Cache-specific Operations

// SetCache stores data with cache metadata
func (r *RedisService) SetCache(key string, data interface{}, ttl int) error {
	entry := CacheEntry{
		Data:      data,
		Timestamp: time.Now(),
		TTL:       ttl,
		Version:   "1.0",
	}
	return r.Set(fmt.Sprintf("cache:%s", key), entry, time.Duration(ttl)*time.Second)
}

// GetCache retrieves cached data
func (r *RedisService) GetCache(key string, dest interface{}) error {
	var entry CacheEntry
	if err := r.GetWithUnmarshal(fmt.Sprintf("cache:%s", key), &entry); err != nil {
		return err
	}

	// Check if cache entry is still valid
	if time.Since(entry.Timestamp) > time.Duration(entry.TTL)*time.Second {
		return fmt.Errorf("cache entry expired")
	}

	// Unmarshal the actual data
	dataBytes, err := json.Marshal(entry.Data)
	if err != nil {
		return err
	}
	return json.Unmarshal(dataBytes, dest)
}

// DeleteCache removes cached data
func (r *RedisService) DeleteCache(key string) error {
	return r.Delete(fmt.Sprintf("cache:%s", key))
}

// Session Management

// SetSession stores session data
func (r *RedisService) SetSession(sessionID string, data interface{}) error {
	ctx := telemetry.WithCorrelationID(r.ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation":   "redis_set_session",
		"session_id":  sessionID,
		"ttl_seconds": SessionTTL,
		"service":     "cache",
	})

	logger.Debug("Setting session data")

	err := r.Set(fmt.Sprintf("session:%s", sessionID), data, time.Duration(SessionTTL)*time.Second)
	if err != nil {
		logger.WithError(err).Error("Failed to set session data")
	} else {
		logger.Debug("Session data set successfully")
	}

	return err
}

// GetSession retrieves session data
func (r *RedisService) GetSession(sessionID string, dest interface{}) error {
	ctx := telemetry.WithCorrelationID(r.ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation":  "redis_get_session",
		"session_id": sessionID,
		"service":    "cache",
	})

	logger.Debug("Getting session data")

	err := r.GetWithUnmarshal(fmt.Sprintf("session:%s", sessionID), dest)
	if err != nil {
		logger.WithError(err).Warn("Failed to get session data")
	} else {
		logger.Debug("Session data retrieved successfully")
	}

	return err
}

// DeleteSession removes session data
func (r *RedisService) DeleteSession(sessionID string) error {
	ctx := telemetry.WithCorrelationID(r.ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation":  "redis_delete_session",
		"session_id": sessionID,
		"service":    "cache",
	})

	logger.Debug("Deleting session data")

	err := r.Delete(fmt.Sprintf("session:%s", sessionID))
	if err != nil {
		logger.WithError(err).Error("Failed to delete session data")
	} else {
		logger.Debug("Session data deleted successfully")
	}

	return err
}

// RefreshSession extends session TTL
func (r *RedisService) RefreshSession(sessionID string) error {
	return r.Expire(fmt.Sprintf("session:%s", sessionID), time.Duration(SessionTTL)*time.Second)
}

// User-specific Caching

// SetUserCache stores user-specific data
func (r *RedisService) SetUserCache(userID string, key string, data interface{}) error {
	ctx := telemetry.WithCorrelationID(r.ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation":   "redis_set_user_cache",
		"user_id":     userID,
		"cache_key":   key,
		"ttl_seconds": UserCacheTTL,
		"service":     "cache",
	})

	logger.Debug("Setting user cache data")

	cacheKey := fmt.Sprintf("user:%s:%s", userID, key)
	err := r.SetCache(cacheKey, data, UserCacheTTL)
	if err != nil {
		logger.WithError(err).Error("Failed to set user cache data")
	} else {
		logger.Debug("User cache data set successfully")
	}

	return err
}

// GetUserCache retrieves user-specific data
func (r *RedisService) GetUserCache(userID string, key string, dest interface{}) error {
	ctx := telemetry.WithCorrelationID(r.ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation": "redis_get_user_cache",
		"user_id":   userID,
		"cache_key": key,
		"service":   "cache",
	})

	logger.Debug("Getting user cache data")

	cacheKey := fmt.Sprintf("user:%s:%s", userID, key)
	err := r.GetCache(cacheKey, dest)
	if err != nil {
		logger.WithError(err).Warn("Failed to get user cache data")
	} else {
		logger.Debug("User cache data retrieved successfully")
	}

	return err
}

// DeleteUserCache removes user-specific data
func (r *RedisService) DeleteUserCache(userID string, key string) error {
	cacheKey := fmt.Sprintf("user:%s:%s", userID, key)
	return r.DeleteCache(cacheKey)
}

// InvalidateUserCache removes all user-specific cache
func (r *RedisService) InvalidateUserCache(userID string) error {
	ctx := telemetry.WithCorrelationID(r.ctx, telemetry.NewCorrelationID())
	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation": "redis_invalidate_user_cache",
		"user_id":   userID,
		"service":   "cache",
	})

	logger.Debug("Invalidating all user cache data")

	pattern := fmt.Sprintf("cache:user:%s:*", userID)
	deleted, err := r.DeletePattern(pattern)
	if err != nil {
		logger.WithError(err).Error("Failed to invalidate user cache")
	} else {
		logger.WithField("deleted_keys", deleted).Info("User cache invalidated successfully")
	}

	return err
}

// Match-specific Caching

// SetMatchCache stores match-related data
func (r *RedisService) SetMatchCache(userID string, data interface{}) error {
	cacheKey := fmt.Sprintf("matches:%s", userID)
	return r.SetCache(cacheKey, data, MatchCacheTTL)
}

// GetMatchCache retrieves match-related data
func (r *RedisService) GetMatchCache(userID string, dest interface{}) error {
	cacheKey := fmt.Sprintf("matches:%s", userID)
	return r.GetCache(cacheKey, dest)
}

// InvalidateMatchCache removes match cache for user
func (r *RedisService) InvalidateMatchCache(userID string) error {
	cacheKey := fmt.Sprintf("matches:%s", userID)
	return r.DeleteCache(cacheKey)
}

// Feature Flag Caching

// SetFeatureFlag stores feature flag value
func (r *RedisService) SetFeatureFlag(key string, value bool, ttl time.Duration) error {
	cacheKey := fmt.Sprintf("feature:%s", key)
	return r.Set(cacheKey, value, ttl)
}

// GetFeatureFlag retrieves feature flag value
func (r *RedisService) GetFeatureFlag(flagName string, dest interface{}) error {
	cacheKey := fmt.Sprintf("feature:%s", flagName)
	return r.GetWithUnmarshal(cacheKey, dest)
}

// Cache Warming Strategies

// WarmUserCache preloads user data
func (r *RedisService) WarmUserCache(userID string, userData interface{}) error {
	return r.SetUserCache(userID, "profile", userData)
}

// WarmMatchCache preloads match data
func (r *RedisService) WarmMatchCache(userID string, matches interface{}) error {
	return r.SetMatchCache(userID, matches)
}

// Cache Invalidation Patterns

// DeletePattern removes keys matching a pattern
func (r *RedisService) DeletePattern(pattern string) (int64, error) {
	keys, err := r.client.Keys(r.ctx, pattern).Result()
	if err != nil {
		return 0, err
	}

	if len(keys) == 0 {
		return 0, nil
	}

	deleted, err := r.client.Del(r.ctx, keys...).Result()
	return deleted, err
}

// InvalidateAll removes all cache entries
func (r *RedisService) InvalidateAll() error {
	_, err := r.DeletePattern("cache:*")
	return err
}

// Health and Monitoring

// HealthCheck verifies Redis connectivity
func (r *RedisService) HealthCheck() bool {
	err := r.client.Ping(r.ctx).Err()
	return err == nil
}

// GetStats returns cache performance statistics
func (r *RedisService) GetStats() map[string]interface{} {
	info, err := r.client.Info(r.ctx, "stats").Result()
	if err != nil {
		return map[string]interface{}{
			"error": err.Error(),
		}
	}

	stats := map[string]interface{}{
		"hits":        int64(0),
		"misses":      int64(0),
		"sets":        int64(0),
		"deletes":     int64(0),
		"connections": 0,
		"hit_rate":    0.0,
	}

	lines := strings.Split(info, "\r\n")
	for _, line := range lines {
		if strings.Contains(line, "keyspace_hits:") {
			parts := strings.Split(line, ":")
			if len(parts) == 2 {
				hits, _ := strconv.ParseInt(parts[1], 10, 64)
				stats["hits"] = hits
			}
		}
		if strings.Contains(line, "keyspace_misses:") {
			parts := strings.Split(line, ":")
			if len(parts) == 2 {
				misses, _ := strconv.ParseInt(parts[1], 10, 64)
				stats["misses"] = misses
			}
		}
	}

	// Get connection info
	clientInfo, err := r.client.Info(r.ctx, "clients").Result()
	if err == nil {
		lines = strings.Split(clientInfo, "\r\n")
		for _, line := range lines {
			if strings.Contains(line, "connected_clients:") {
				parts := strings.Split(line, ":")
				if len(parts) == 2 {
					connections, _ := strconv.Atoi(parts[1])
					stats["connections"] = connections
				}
			}
		}
	}

	// Calculate hit rate
	if hits, ok := stats["hits"].(int64); ok {
		if misses, ok := stats["misses"].(int64); ok {
			total := hits + misses
			if total > 0 {
				stats["hit_rate"] = float64(hits) / float64(total)
			}
		}
	}

	return stats
}

// Close closes the Redis connection
func (r *RedisService) Close() error {
	return r.client.Close()
}

// Utility Functions

// GetClient returns the underlying Redis client
func (r *RedisService) GetClient() *redis.Client {
	if client, ok := r.client.(*redis.Client); ok {
		return client
	}
	return nil
}

// GetContext returns the service context
func (r *RedisService) GetContext() context.Context {
	return r.ctx
}
