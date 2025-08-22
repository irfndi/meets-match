package middleware

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// MockRedisService is a mock implementation of RedisService
type MockRedisService struct {
	mock.Mock
}

func (m *MockRedisService) Set(key string, value interface{}, ttl time.Duration) error {
	args := m.Called(key, value, ttl)
	return args.Error(0)
}

func (m *MockRedisService) Get(key string) (string, error) {
	args := m.Called(key)
	return args.String(0), args.Error(1)
}

func (m *MockRedisService) Delete(key string) error {
	args := m.Called(key)
	return args.Error(0)
}

func (m *MockRedisService) SetCache(key string, data interface{}, ttl int) error {
	args := m.Called(key, data, ttl)
	return args.Error(0)
}

func (m *MockRedisService) GetCache(key string, dest interface{}) error {
	args := m.Called(key, dest)
	return args.Error(0)
}

func (m *MockRedisService) DeleteCache(key string) error {
	args := m.Called(key)
	return args.Error(0)
}

func (m *MockRedisService) Exists(key string) (bool, error) {
	args := m.Called(key)
	return args.Bool(0), args.Error(1)
}

func (m *MockRedisService) Expire(key string, duration time.Duration) error {
	args := m.Called(key, duration)
	return args.Error(0)
}

func (m *MockRedisService) TTL(key string) (time.Duration, error) {
	args := m.Called(key)
	return args.Get(0).(time.Duration), args.Error(1)
}

func (m *MockRedisService) Close() error {
	args := m.Called()
	return args.Error(0)
}

func (m *MockRedisService) DeletePattern(pattern string) (int64, error) {
	args := m.Called(pattern)
	return args.Get(0).(int64), args.Error(1)
}

func (m *MockRedisService) SetFeatureFlag(key string, value bool, ttl time.Duration) error {
	args := m.Called(key, value, ttl)
	return args.Error(0)
}

func (m *MockRedisService) GetStats() map[string]interface{} {
	args := m.Called()
	return args.Get(0).(map[string]interface{})
}

func (m *MockRedisService) InvalidateAll() error {
	args := m.Called()
	return args.Error(0)
}

func (m *MockRedisService) HealthCheck() bool {
	args := m.Called()
	return args.Bool(0)
}

func TestNewCacheMiddleware(t *testing.T) {
	mockRedis := &MockRedisService{}
	config := CacheConfig{
		UserTTL:      time.Hour,
		MatchTTL:     30 * time.Minute,
		ProfileTTL:   2 * time.Hour,
		ResponseTTL:  15 * time.Minute,
		SkipPatterns: []string{"/health", "/metrics"},
	}

	middleware := NewCacheMiddleware(mockRedis, config)

	assert.NotNil(t, middleware)
	assert.Equal(t, mockRedis, middleware.redis)
	assert.Equal(t, config, middleware.config)
}

func TestCacheMiddleware_CacheResponse(t *testing.T) {
	mockRedis := &MockRedisService{}
	config := CacheConfig{
		ResponseTTL: 15 * time.Minute,
	}
	middleware := NewCacheMiddleware(mockRedis, config)

	ctx := context.Background()
	cacheKey := "response:test_key"
	response := CachedResponse{
		Text:      "Test response",
		ChatID:    123,
		MessageID: 456,
		Timestamp: time.Now(),
	}

	// Mock successful cache set
	mockRedis.On("SetCache", cacheKey, response, int(config.ResponseTTL.Seconds())).Return(nil)

	err := middleware.CacheResponse(ctx, cacheKey, response)

	assert.NoError(t, err)
	mockRedis.AssertExpectations(t)
}

func TestCacheMiddleware_GetCachedResponse(t *testing.T) {
	mockRedis := &MockRedisService{}
	middleware := NewCacheMiddleware(mockRedis, CacheConfig{})

	ctx := context.Background()
	cacheKey := "response:test_key"
	expectedResponse := CachedResponse{
		Text:      "Test response",
		ChatID:    123,
		MessageID: 456,
		Timestamp: time.Now(),
	}

	// Mock successful cache get
	mockRedis.On("GetCache", cacheKey, mock.AnythingOfType("*middleware.CachedResponse")).Return(nil).Run(func(args mock.Arguments) {
		dest := args.Get(1).(*CachedResponse)
		*dest = expectedResponse
	})

	response, err := middleware.GetCachedResponse(ctx, cacheKey)

	assert.NoError(t, err)
	assert.Equal(t, expectedResponse, response)
	mockRedis.AssertExpectations(t)
}

func TestCacheMiddleware_GetCachedResponse_NotFound(t *testing.T) {
	mockRedis := &MockRedisService{}
	middleware := NewCacheMiddleware(mockRedis, CacheConfig{})

	ctx := context.Background()
	cacheKey := "response:nonexistent"

	// Mock cache miss
	mockRedis.On("GetCache", cacheKey, mock.AnythingOfType("*middleware.CachedResponse")).Return(redis.Nil)

	response, err := middleware.GetCachedResponse(ctx, cacheKey)

	assert.Error(t, err)
	assert.Equal(t, redis.Nil, err)
	assert.Equal(t, CachedResponse{}, response)
	mockRedis.AssertExpectations(t)
}

func TestCacheMiddleware_CacheUserData(t *testing.T) {
	mockRedis := &MockRedisService{}
	config := CacheConfig{
		UserTTL: time.Hour,
	}
	middleware := NewCacheMiddleware(mockRedis, config)

	ctx := context.Background()
	userID := int64(123)
	userData := UserCacheData{
		ID:        userID,
		Username:  "testuser",
		FirstName: "Test",
		LastName:  "User",
		State:     "active",
		Preferences: map[string]interface{}{
			"language": "en",
			"theme":    "dark",
		},
		LastActivity: time.Now(),
	}

	// Mock successful user cache
	cacheKey := fmt.Sprintf("user_data:%d", userID)
	mockRedis.On("SetCache", cacheKey, userData, int(config.UserTTL.Seconds())).Return(nil)

	err := middleware.CacheUserData(ctx, userID, userData)

	assert.NoError(t, err)
	mockRedis.AssertExpectations(t)
}

func TestCacheMiddleware_GetCachedUserData(t *testing.T) {
	mockRedis := &MockRedisService{}
	middleware := NewCacheMiddleware(mockRedis, CacheConfig{})

	ctx := context.Background()
	userID := int64(123)
	expectedUserData := UserCacheData{
		ID:        userID,
		Username:  "testuser",
		FirstName: "Test",
		LastName:  "User",
		State:     "active",
		Preferences: map[string]interface{}{
			"language": "en",
			"theme":    "dark",
		},
		LastActivity: time.Now(),
	}

	// Mock successful user data get
	cacheKey := fmt.Sprintf("user_data:%d", userID)
	mockRedis.On("GetCache", cacheKey, mock.AnythingOfType("*middleware.UserCacheData")).Return(nil).Run(func(args mock.Arguments) {
		dest := args.Get(1).(*UserCacheData)
		*dest = expectedUserData
	})

	userData, err := middleware.GetCachedUserData(ctx, userID)

	assert.NoError(t, err)
	assert.Equal(t, expectedUserData, userData)
	mockRedis.AssertExpectations(t)
}

func TestCacheMiddleware_CacheMatchData(t *testing.T) {
	mockRedis := &MockRedisService{}
	config := CacheConfig{
		MatchTTL: 30 * time.Minute,
	}
	middleware := NewCacheMiddleware(mockRedis, config)

	ctx := context.Background()
	matchID := "match123"
	matchData := map[string]interface{}{
		"id":     matchID,
		"user1":  123,
		"user2":  456,
		"status": "active",
		"score":  "2-1",
	}

	// Mock successful match cache
	cacheKey := fmt.Sprintf("match:%s", matchID)
	mockRedis.On("SetCache", cacheKey, matchData, int(config.MatchTTL.Seconds())).Return(nil)

	err := middleware.CacheMatchData(ctx, matchID, matchData)

	assert.NoError(t, err)
	mockRedis.AssertExpectations(t)
}

func TestCacheMiddleware_GetCachedMatchData(t *testing.T) {
	mockRedis := &MockRedisService{}
	middleware := NewCacheMiddleware(mockRedis, CacheConfig{})

	ctx := context.Background()
	matchID := "match123"
	expectedMatchData := map[string]interface{}{
		"id":     matchID,
		"user1":  float64(123), // JSON unmarshaling converts numbers to float64
		"user2":  float64(456),
		"status": "active",
		"score":  "2-1",
	}

	// Mock successful match data get
	cacheKey := fmt.Sprintf("match:%s", matchID)
	mockRedis.On("GetCache", cacheKey, mock.AnythingOfType("*interface {}")).Return(nil).Run(func(args mock.Arguments) {
		dest := args.Get(1).(*interface{})
		*dest = expectedMatchData
	})

	matchData, err := middleware.GetCachedMatchData(ctx, matchID)

	assert.NoError(t, err)
	assert.Equal(t, expectedMatchData, matchData)
	mockRedis.AssertExpectations(t)
}

func TestCacheMiddleware_CacheProfileData(t *testing.T) {
	mockRedis := &MockRedisService{}
	config := CacheConfig{
		ProfileTTL: 2 * time.Hour,
	}
	middleware := NewCacheMiddleware(mockRedis, config)

	ctx := context.Background()
	userID := int64(123)
	profileData := map[string]interface{}{
		"user_id":   userID,
		"bio":       "Test bio",
		"age":       25,
		"location":  "Test City",
		"interests": []string{"gaming", "music"},
	}

	// Mock successful profile cache
	cacheKey := fmt.Sprintf("profile:%d", userID)
	mockRedis.On("SetCache", cacheKey, profileData, int(config.ProfileTTL.Seconds())).Return(nil)

	err := middleware.CacheProfileData(ctx, userID, profileData)

	assert.NoError(t, err)
	mockRedis.AssertExpectations(t)
}

func TestCacheMiddleware_GetCachedProfileData(t *testing.T) {
	mockRedis := &MockRedisService{}
	middleware := NewCacheMiddleware(mockRedis, CacheConfig{})

	ctx := context.Background()
	userID := int64(123)
	expectedProfileData := map[string]interface{}{
		"user_id":   float64(123),
		"bio":       "Test bio",
		"age":       float64(25),
		"location":  "Test City",
		"interests": []interface{}{"gaming", "music"},
	}

	// Mock successful profile data get
	cacheKey := fmt.Sprintf("profile:%d", userID)
	mockRedis.On("GetCache", cacheKey, mock.AnythingOfType("*interface {}")).Return(nil).Run(func(args mock.Arguments) {
		dest := args.Get(1).(*interface{})
		*dest = expectedProfileData
	})

	profileData, err := middleware.GetCachedProfileData(ctx, userID)

	assert.NoError(t, err)
	assert.Equal(t, expectedProfileData, profileData)
	mockRedis.AssertExpectations(t)
}

func TestCacheMiddleware_ShouldSkipCaching(t *testing.T) {
	config := CacheConfig{
		SkipPatterns: []string{"/health", "/metrics", "admin/"},
	}
	middleware := NewCacheMiddleware(&MockRedisService{}, config)

	tests := []struct {
		name     string
		path     string
		expected bool
	}{
		{"Should skip health endpoint", "/health", true},
		{"Should skip metrics endpoint", "/metrics", true},
		{"Should skip admin paths", "admin/users", true},
		{"Should not skip regular path", "/api/users", false},
		{"Should not skip empty path", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := middleware.shouldSkipCaching(tt.path, config.SkipPatterns)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestCacheMiddleware_GenerateCacheKey(t *testing.T) {
	middleware := NewCacheMiddleware(&MockRedisService{}, CacheConfig{})

	tests := []struct {
		name    string
		userID  int64
		chatID  int64
		message string
	}{
		{"Simple key", 123, 456, "hello"},
		{"Different user", 789, 101, "test message"},
		{"Empty message", 111, 222, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := middleware.generateCacheKey(tt.userID, tt.chatID, tt.message)
			assert.NotEmpty(t, result)
			assert.Contains(t, result, "bot_response:")
		})
	}
}

func TestCacheMiddleware_Integration(t *testing.T) {
	// This test simulates a complete cache workflow
	mockRedis := &MockRedisService{}
	config := CacheConfig{
		UserTTL:     time.Hour,
		MatchTTL:    30 * time.Minute,
		ProfileTTL:  2 * time.Hour,
		ResponseTTL: 15 * time.Minute,
	}
	middleware := NewCacheMiddleware(mockRedis, config)

	ctx := context.Background()
	userID := int64(123)
	matchID := "match456"

	// Setup user data
	userData := UserCacheData{
		ID:       userID,
		Username: "testuser",
		State:    "active",
	}

	// Setup match data
	matchData := map[string]interface{}{
		"id":     matchID,
		"status": "active",
	}

	// Mock cache operations using new interface methods
	userCacheKey := fmt.Sprintf("user_data:%d", userID)
	matchCacheKey := fmt.Sprintf("match:%s", matchID)

	mockRedis.On("SetCache", userCacheKey, userData, int(config.UserTTL.Seconds())).Return(nil)
	mockRedis.On("SetCache", matchCacheKey, matchData, int(config.MatchTTL.Seconds())).Return(nil)
	mockRedis.On("GetCache", userCacheKey, mock.AnythingOfType("*middleware.UserCacheData")).Return(nil).Run(func(args mock.Arguments) {
		dest := args.Get(1).(*UserCacheData)
		*dest = userData
	})
	mockRedis.On("GetCache", matchCacheKey, mock.AnythingOfType("*interface {}")).Return(nil).Run(func(args mock.Arguments) {
		dest := args.Get(1).(*interface{})
		*dest = matchData
	})

	// Test caching
	err := middleware.CacheUserData(ctx, userID, userData)
	require.NoError(t, err)

	err = middleware.CacheMatchData(ctx, matchID, matchData)
	require.NoError(t, err)

	// Test retrieval
	cachedUser, err := middleware.GetCachedUserData(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, userData, cachedUser)

	cachedMatch, err := middleware.GetCachedMatchData(ctx, matchID)
	require.NoError(t, err)
	assert.Equal(t, matchData, cachedMatch)

	mockRedis.AssertExpectations(t)
}
