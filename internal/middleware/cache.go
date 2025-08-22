package middleware

import (
	"context"
	"crypto/md5"
	"fmt"
	"strings"
	"time"

	"github.com/meetsmatch/meetsmatch/internal/cache"
	"github.com/meetsmatch/meetsmatch/internal/telemetry"
	tgbotapi "gopkg.in/telegram-bot-api.v4"
)

// CacheMiddleware provides caching functionality for bot operations
type CacheMiddleware struct {
	redis  cache.RedisServiceInterface
	config CacheConfig
}

// CacheConfig holds caching configuration
type CacheConfig struct {
	Enabled      bool
	DefaultTTL   int
	UserTTL      time.Duration
	MatchTTL     time.Duration
	ProfileTTL   time.Duration
	ResponseTTL  time.Duration
	SkipPatterns []string // Patterns to skip caching
}

// CachedResponse represents a cached bot response
type CachedResponse struct {
	Text           string                         `json:"text"`
	MessageText    string                         `json:"message_text"`
	ChatID         int64                          `json:"chat_id"`
	MessageID      int                            `json:"message_id"`
	Keyboard       *tgbotapi.ReplyKeyboardMarkup  `json:"keyboard,omitempty"`
	InlineKeyboard *tgbotapi.InlineKeyboardMarkup `json:"inline_keyboard,omitempty"`
	Timestamp      time.Time                      `json:"timestamp"`
	UserID         int64                          `json:"user_id"`
}

// UserCacheData represents cached user data
type UserCacheData struct {
	ID           int64                  `json:"id"`
	Username     string                 `json:"username"`
	FirstName    string                 `json:"first_name"`
	LastName     string                 `json:"last_name"`
	State        string                 `json:"state"`
	Preferences  map[string]interface{} `json:"preferences"`
	LastActivity time.Time              `json:"last_activity"`
}

var defaultCacheConfig = &CacheConfig{
	Enabled:     true,
	DefaultTTL:  3600, // 1 hour
	UserTTL:     30 * time.Minute,
	MatchTTL:    2 * time.Hour,
	ProfileTTL:  time.Hour,
	ResponseTTL: 15 * time.Minute,
	SkipPatterns: []string{
		"/start",
		"/help",
		"admin_",
		"debug_",
	},
}

// NewCacheMiddleware creates a new cache middleware
func NewCacheMiddleware(redisService cache.RedisServiceInterface, config CacheConfig) *CacheMiddleware {
	return &CacheMiddleware{
		redis:  redisService,
		config: config,
	}
}

// CacheHandler wraps a bot handler with caching functionality
func (c *CacheMiddleware) CacheHandler(handler func(*tgbotapi.Update) error, config *CacheConfig) func(*tgbotapi.Update) error {
	if config == nil {
		config = defaultCacheConfig
	}

	return func(update *tgbotapi.Update) error {
		if !config.Enabled {
			return handler(update)
		}

		// Extract relevant data from update
		userID, chatID, messageText := extractUpdateData(update)
		if userID == 0 {
			return handler(update) // Skip caching if no user ID
		}

		// Check if we should skip caching for this message
		if c.shouldSkipCaching(messageText, config.SkipPatterns) {
			return handler(update)
		}

		// Generate cache key
		cacheKey := c.generateCacheKey(userID, chatID, messageText)

		// Try to get cached response
		var cachedResponse CachedResponse
		if err := c.redis.GetCache(cacheKey, &cachedResponse); err == nil {
			// Cache hit - return cached response
			logger := telemetry.GetContextualLogger(context.Background())
			logger.WithFields(map[string]interface{}{
				"operation":    "cache_lookup",
				"user_id":      userID,
				"cache_key":    cacheKey,
				"result":       "hit",
				"service":      "cache_middleware",
				"message_text": messageText,
			}).Debug("Cache hit for user message")
			return c.sendCachedResponse(update, &cachedResponse)
		}

		// Cache miss - execute handler and cache result
		logger := telemetry.GetContextualLogger(context.Background())
		logger.WithFields(map[string]interface{}{
			"operation":    "cache_lookup",
			"user_id":      userID,
			"cache_key":    cacheKey,
			"result":       "miss",
			"service":      "cache_middleware",
			"message_text": messageText,
		}).Debug("Cache miss for user message")
		return c.executeAndCache(handler, update, cacheKey, config.DefaultTTL)
	}
}

// CacheResponse caches a bot response
func (c *CacheMiddleware) CacheResponse(ctx context.Context, cacheKey string, response CachedResponse) error {
	return c.redis.SetCache(cacheKey, response, int(c.config.ResponseTTL.Seconds()))
}

// GetCachedResponse retrieves a cached bot response
func (c *CacheMiddleware) GetCachedResponse(ctx context.Context, cacheKey string) (CachedResponse, error) {
	var response CachedResponse
	err := c.redis.GetCache(cacheKey, &response)
	return response, err
}

// CacheUserData caches user-specific data
func (c *CacheMiddleware) CacheUserData(ctx context.Context, userID int64, data UserCacheData) error {
	cacheKey := fmt.Sprintf("user_data:%d", userID)
	return c.redis.SetCache(cacheKey, data, int(c.config.UserTTL.Seconds()))
}

// GetCachedUserData retrieves cached user data
func (c *CacheMiddleware) GetCachedUserData(ctx context.Context, userID int64) (UserCacheData, error) {
	cacheKey := fmt.Sprintf("user_data:%d", userID)
	var userData UserCacheData
	err := c.redis.GetCache(cacheKey, &userData)
	return userData, err
}

// InvalidateUserCache removes all cached data for a user
func (c *CacheMiddleware) InvalidateUserCache(userID int64) error {
	pattern := fmt.Sprintf("*user*%d*", userID)
	_, err := c.redis.DeletePattern(pattern)
	return err
}

// CacheMatchData caches match-related data
func (c *CacheMiddleware) CacheMatchData(ctx context.Context, matchID string, matchData interface{}) error {
	cacheKey := fmt.Sprintf("match:%s", matchID)
	return c.redis.SetCache(cacheKey, matchData, int(c.config.MatchTTL.Seconds()))
}

// GetCachedMatchData retrieves cached match data
func (c *CacheMiddleware) GetCachedMatchData(ctx context.Context, matchID string) (interface{}, error) {
	cacheKey := fmt.Sprintf("match:%s", matchID)
	var matchData interface{}
	err := c.redis.GetCache(cacheKey, &matchData)
	return matchData, err
}

// CacheProfileData caches user profile data
func (c *CacheMiddleware) CacheProfileData(ctx context.Context, userID int64, profileData interface{}) error {
	cacheKey := fmt.Sprintf("profile:%d", userID)
	return c.redis.SetCache(cacheKey, profileData, int(c.config.ProfileTTL.Seconds()))
}

// GetCachedProfileData retrieves cached profile data
func (c *CacheMiddleware) GetCachedProfileData(ctx context.Context, userID int64) (interface{}, error) {
	cacheKey := fmt.Sprintf("profile:%d", userID)
	var profileData interface{}
	err := c.redis.GetCache(cacheKey, &profileData)
	return profileData, err
}

// WarmCache preloads frequently accessed data
func (c *CacheMiddleware) WarmCache(ctx context.Context) error {
	logger := telemetry.GetContextualLogger(ctx)
	logger.WithFields(map[string]interface{}{
		"operation": "cache_warming",
		"service":   "cache_middleware",
	}).Info("Starting cache warming process")

	// This would typically load frequently accessed data
	// For now, we'll implement basic warming strategies

	// Warm feature flags
	if err := c.warmFeatureFlags(); err != nil {
		logger.WithFields(map[string]interface{}{
			"operation": "warm_feature_flags",
			"service":   "cache_middleware",
		}).WithError(err).Error("Failed to warm feature flags")
	}

	// Warm common responses
	if err := c.warmCommonResponses(); err != nil {
		logger.WithFields(map[string]interface{}{
			"operation": "warm_common_responses",
			"service":   "cache_middleware",
		}).WithError(err).Error("Failed to warm common responses")
	}

	logger.WithFields(map[string]interface{}{
		"operation": "cache_warming",
		"service":   "cache_middleware",
	}).Info("Cache warming completed")
	return nil
}

// warmFeatureFlags preloads feature flags
func (c *CacheMiddleware) warmFeatureFlags() error {
	// Common feature flags that should be cached
	featureFlags := map[string]interface{}{
		"enable_new_matching_algorithm":  true,
		"enable_profile_verification":    false,
		"enable_voice_messages":          true,
		"matching_batch_size":            50,
		"rate_limit_requests_per_minute": 100,
	}

	for flagName, value := range featureFlags {
		if boolValue, ok := value.(bool); ok {
			if err := c.redis.SetFeatureFlag(flagName, boolValue, time.Hour*24); err != nil {
				logger := telemetry.GetContextualLogger(context.Background())
				logger.WithFields(map[string]interface{}{
					"operation":  "cache_feature_flag",
					"flag_name":  flagName,
					"flag_value": boolValue,
					"service":    "cache_middleware",
				}).WithError(err).Error("Failed to cache feature flag")
			}
		}
	}

	return nil
}

// warmCommonResponses preloads common bot responses
func (c *CacheMiddleware) warmCommonResponses() error {
	// Common responses that can be cached
	commonResponses := map[string]string{
		"welcome_message":    "Welcome to MeetsMatch! Let's find your perfect match. 💕",
		"help_message":       "Here are the available commands:\n/profile - View your profile\n/matches - See your matches\n/settings - Adjust your preferences",
		"profile_incomplete": "Please complete your profile first to start matching!",
		"no_matches":         "No new matches found. Keep swiping! 😊",
		"error_message":      "Sorry, something went wrong. Please try again later.",
	}

	for key, response := range commonResponses {
		cacheKey := fmt.Sprintf("common_response:%s", key)
		if err := c.redis.SetCache(cacheKey, response, 86400); err != nil { // Cache for 24 hours
			logger := telemetry.GetContextualLogger(context.Background())
			logger.WithFields(map[string]interface{}{
				"operation":    "cache_common_response",
				"response_key": key,
				"cache_key":    cacheKey,
				"service":      "cache_middleware",
			}).WithError(err).Error("Failed to cache common response")
		}
	}

	return nil
}

// GetCommonResponse retrieves a cached common response
func (c *CacheMiddleware) GetCommonResponse(key string) (string, error) {
	cacheKey := fmt.Sprintf("common_response:%s", key)
	var response string
	err := c.redis.GetCache(cacheKey, &response)
	return response, err
}

// Helper functions

// extractUpdateData extracts user ID, chat ID, and message text from update
func extractUpdateData(update *tgbotapi.Update) (int64, int64, string) {
	if update.Message != nil {
		return int64(update.Message.From.ID), update.Message.Chat.ID, update.Message.Text
	}
	if update.CallbackQuery != nil {
		if update.CallbackQuery.Message != nil {
			return int64(update.CallbackQuery.From.ID), update.CallbackQuery.Message.Chat.ID, update.CallbackQuery.Data
		}
		return int64(update.CallbackQuery.From.ID), 0, update.CallbackQuery.Data
	}
	return 0, 0, ""
}

// shouldSkipCaching determines if caching should be skipped for a message
func (c *CacheMiddleware) shouldSkipCaching(messageText string, skipPatterns []string) bool {
	for _, pattern := range skipPatterns {
		if strings.Contains(messageText, pattern) {
			return true
		}
	}
	return false
}

// generateCacheKey creates a unique cache key for the request
func (c *CacheMiddleware) generateCacheKey(userID, chatID int64, messageText string) string {
	// Create a hash of the message content for consistent caching
	hash := md5.Sum([]byte(fmt.Sprintf("%d:%d:%s", userID, chatID, messageText)))
	return fmt.Sprintf("bot_response:%x", hash)
}

// sendCachedResponse sends a cached response to the user
func (c *CacheMiddleware) sendCachedResponse(update *tgbotapi.Update, cachedResponse *CachedResponse) error {
	// This is a simplified implementation
	// In a real implementation, you would use the bot API to send the cached response
	logger := telemetry.GetContextualLogger(context.Background())
	logger.WithFields(map[string]interface{}{
		"operation":    "send_cached_response",
		"user_id":      cachedResponse.UserID,
		"message_text": cachedResponse.MessageText,
		"service":      "cache_middleware",
	}).Debug("Sending cached response to user")
	return nil
}

// executeAndCache executes the handler and caches the result
func (c *CacheMiddleware) executeAndCache(handler func(*tgbotapi.Update) error, update *tgbotapi.Update, cacheKey string, ttl int) error {
	// Execute the original handler
	err := handler(update)
	if err != nil {
		return err
	}

	// Extract response data for caching
	userID, chatID, _ := extractUpdateData(update)

	// Create cached response (simplified)
	cachedResponse := &CachedResponse{
		MessageText: "Response cached", // This would be the actual response
		Timestamp:   time.Now(),
		UserID:      userID,
		ChatID:      chatID,
	}

	// Cache the response
	if cacheErr := c.redis.SetCache(cacheKey, cachedResponse, ttl); cacheErr != nil {
		logger := telemetry.GetContextualLogger(context.Background())
		logger.WithFields(map[string]interface{}{
			"operation": "cache_response",
			"cache_key": cacheKey,
			"user_id":   userID,
			"ttl":       ttl,
			"service":   "cache_middleware",
		}).WithError(cacheErr).Error("Failed to cache response")
	}

	return nil
}

// Cache Statistics and Monitoring

// GetCacheStats returns cache performance statistics
func (c *CacheMiddleware) GetCacheStats() (map[string]interface{}, error) {
	stats := c.redis.GetStats()
	return stats, nil
}

// ClearCache removes all cached data
func (c *CacheMiddleware) ClearCache() error {
	return c.redis.InvalidateAll()
}

// ClearUserCache removes all cached data for a specific user
func (c *CacheMiddleware) ClearUserCache(userID int64) error {
	return c.InvalidateUserCache(userID)
}

// RefreshCache refreshes specific cache entries
func (c *CacheMiddleware) RefreshCache(keys []string) error {
	for _, key := range keys {
		if err := c.redis.DeleteCache(key); err != nil {
			logger := telemetry.GetContextualLogger(context.Background())
			logger.WithFields(map[string]interface{}{
				"operation": "refresh_cache_key",
				"cache_key": key,
				"service":   "cache_middleware",
			}).WithError(err).Error("Failed to refresh cache key")
		}
	}
	return nil
}

// Cache Health Check

// HealthCheck verifies cache connectivity and performance
func (c *CacheMiddleware) HealthCheck() error {
	if !c.redis.HealthCheck() {
		return fmt.Errorf("cache health check failed")
	}
	return nil
}
