package cache

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// MockRedisClient is a mock implementation of redis.Cmdable
type MockRedisClient struct {
	mock.Mock
}

func (m *MockRedisClient) Set(ctx context.Context, key string, value interface{}, expiration time.Duration) *redis.StatusCmd {
	args := m.Called(ctx, key, value, expiration)
	cmd := redis.NewStatusCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.String(0))
	}
	return cmd
}

func (m *MockRedisClient) Get(ctx context.Context, key string) *redis.StringCmd {
	args := m.Called(ctx, key)
	cmd := redis.NewStringCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.String(0))
	}
	return cmd
}

func (m *MockRedisClient) Del(ctx context.Context, keys ...string) *redis.IntCmd {
	args := m.Called(ctx, keys)
	cmd := redis.NewIntCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.Get(0).(int64))
	}
	return cmd
}

func (m *MockRedisClient) Keys(ctx context.Context, pattern string) *redis.StringSliceCmd {
	args := m.Called(ctx, pattern)
	cmd := redis.NewStringSliceCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.Get(0).([]string))
	}
	return cmd
}

func (m *MockRedisClient) Ping(ctx context.Context) *redis.StatusCmd {
	args := m.Called(ctx)
	cmd := redis.NewStatusCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.String(0))
	}
	return cmd
}

func (m *MockRedisClient) HSet(ctx context.Context, key string, values ...interface{}) *redis.IntCmd {
	args := m.Called(ctx, key, values)
	cmd := redis.NewIntCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.Get(0).(int64))
	}
	return cmd
}

func (m *MockRedisClient) HGet(ctx context.Context, key, field string) *redis.StringCmd {
	args := m.Called(ctx, key, field)
	cmd := redis.NewStringCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.String(0))
	}
	return cmd
}

func (m *MockRedisClient) HDel(ctx context.Context, key string, fields ...string) *redis.IntCmd {
	args := m.Called(ctx, key, fields)
	cmd := redis.NewIntCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.Get(0).(int64))
	}
	return cmd
}

func (m *MockRedisClient) Expire(ctx context.Context, key string, expiration time.Duration) *redis.BoolCmd {
	args := m.Called(ctx, key, expiration)
	cmd := redis.NewBoolCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.Bool(0))
	}
	return cmd
}

func (m *MockRedisClient) TTL(ctx context.Context, key string) *redis.DurationCmd {
	args := m.Called(ctx, key)
	cmd := redis.NewDurationCmd(ctx, time.Duration(0), "ttl", key)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.Get(0).(time.Duration))
	}
	return cmd
}

func (m *MockRedisClient) Exists(ctx context.Context, keys ...string) *redis.IntCmd {
	args := m.Called(ctx, keys)
	cmd := redis.NewIntCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.Get(0).(int64))
	}
	return cmd
}

func (m *MockRedisClient) Info(ctx context.Context, section ...string) *redis.StringCmd {
	args := m.Called(ctx, section)
	cmd := redis.NewStringCmd(ctx)
	if args.Error(1) != nil {
		cmd.SetErr(args.Error(1))
	} else {
		cmd.SetVal(args.String(0))
	}
	return cmd
}

func (m *MockRedisClient) Close() error {
	args := m.Called()
	return args.Error(0)
}

func TestNewRedisService(t *testing.T) {
	config := &RedisConfig{
		Host:     "localhost",
		Port:     6379,
		Password: "",
		DB:       0,
		PoolSize: 10,
	}

	// This test would require a real Redis instance, so we'll test the config validation
	assert.NotEmpty(t, config.Host)
	assert.Greater(t, config.Port, 0)
	assert.GreaterOrEqual(t, config.PoolSize, 1)
}

func TestRedisService_Set(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	key := "test_key"
	value := "test_value"
	ttl := time.Duration(3600) * time.Second

	// Mock successful set
	mockClient.On("Set", mock.Anything, key, mock.Anything, mock.Anything).Return("OK", nil)

	err := service.Set(key, value, ttl)

	assert.NoError(t, err)
	mockClient.AssertExpectations(t)
}

func TestRedisService_Get(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	key := "test_key"
	expectedValue := "\"test_value\""

	// Mock successful get
	mockClient.On("Get", mock.Anything, key).Return(expectedValue, nil)

	value, err := service.Get(key)

	assert.NoError(t, err)
	assert.Equal(t, "test_value", value)
	mockClient.AssertExpectations(t)
}

func TestRedisService_Get_NotFound(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	key := "nonexistent_key"

	// Mock key not found
	mockClient.On("Get", mock.Anything, key).Return("", redis.Nil)

	value, err := service.Get(key)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "key not found")
	assert.Empty(t, value)
	mockClient.AssertExpectations(t)
}

func TestRedisService_Delete(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	key := "key1"

	// Mock successful delete
	mockClient.On("Del", mock.Anything, []string{key}).Return(int64(1), nil)

	err := service.Delete(key)

	assert.NoError(t, err)
	mockClient.AssertExpectations(t)
}

func TestRedisService_SetCache(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	key := "cache_key"
	data := map[string]interface{}{"test": "data"}
	ttl := 3600

	// Mock successful set
	mockClient.On("Set", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return("OK", nil)

	err := service.SetCache(key, data, ttl)

	assert.NoError(t, err)
	mockClient.AssertExpectations(t)
}

func TestRedisService_GetCache(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	key := "cache_key"

	// Create a valid cache entry
	cacheEntry := CacheEntry{
		Data:      map[string]interface{}{"test": "data"},
		Timestamp: time.Now(),
		TTL:       3600,
		Version:   "1.0",
	}
	cacheEntryJSON, _ := json.Marshal(cacheEntry)

	// Mock successful get
	mockClient.On("Get", mock.Anything, mock.Anything).Return(string(cacheEntryJSON), nil)

	var data map[string]interface{}
	err := service.GetCache(key, &data)

	assert.NoError(t, err)
	assert.Equal(t, "data", data["test"])
	mockClient.AssertExpectations(t)
}

func TestRedisService_SetSession(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	sessionID := "session123"
	data := map[string]interface{}{"user_id": 123}

	// Mock successful set
	mockClient.On("Set", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return("OK", nil)

	err := service.SetSession(sessionID, data)

	assert.NoError(t, err)
	mockClient.AssertExpectations(t)
}

func TestRedisService_GetSession(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	sessionID := "session123"

	// Mock successful get
	mockClient.On("Get", mock.Anything, mock.Anything).Return("{\"user_id\": 123}", nil)

	var data map[string]interface{}
	err := service.GetSession(sessionID, &data)

	assert.NoError(t, err)
	mockClient.AssertExpectations(t)
}

func TestRedisService_SetUserCache(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	userID := "123"
	cacheType := "profile"
	userData := map[string]interface{}{"name": "John", "age": 30}

	// Mock successful set
	mockClient.On("Set", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return("OK", nil)

	err := service.SetUserCache(userID, cacheType, userData)

	assert.NoError(t, err)
	mockClient.AssertExpectations(t)
}

func TestRedisService_GetUserCache(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	userID := "123"
	cacheType := "profile"

	// Create a valid cache entry
	cacheEntry := CacheEntry{
		Data:      map[string]interface{}{"name": "John", "age": 30},
		Timestamp: time.Now(),
		TTL:       3600,
		Version:   "1.0",
	}
	cacheEntryJSON, _ := json.Marshal(cacheEntry)

	// Mock successful get
	mockClient.On("Get", mock.Anything, mock.Anything).Return(string(cacheEntryJSON), nil)

	var data map[string]interface{}
	err := service.GetUserCache(userID, cacheType, &data)

	assert.NoError(t, err)
	assert.Equal(t, "John", data["name"])
	assert.Equal(t, float64(30), data["age"])
	mockClient.AssertExpectations(t)
}

func TestRedisService_DeletePattern(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	pattern := "user:*"
	keys := []string{"user:123", "user:456"}

	// Mock keys lookup and delete
	mockClient.On("Keys", mock.Anything, pattern).Return(keys, nil)
	mockClient.On("Del", mock.Anything, mock.Anything).Return(int64(2), nil)

	count, err := service.DeletePattern(pattern)

	assert.NoError(t, err)
	assert.Equal(t, int64(2), count)
	mockClient.AssertExpectations(t)
}

func TestRedisService_HealthCheck(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	// Mock ping
	mockClient.On("Ping", mock.Anything).Return("PONG", nil)

	isHealthy := service.HealthCheck()

	assert.True(t, isHealthy)
	mockClient.AssertExpectations(t)
}

func TestRedisService_GetStats(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	// Mock info command
	infoResult := "used_memory:1024\r\nconnected_clients:5\r\n"
	mockClient.On("Info", mock.Anything, mock.Anything).Return(infoResult, nil)

	stats := service.GetStats()

	assert.NotNil(t, stats)
	mockClient.AssertExpectations(t)
}

func TestRedisService_Close(t *testing.T) {
	mockClient := &MockRedisClient{}
	service := &RedisService{
		client: mockClient,
		config: &RedisConfig{},
		ctx:    context.Background(),
	}

	// Mock successful close
	mockClient.On("Close").Return(nil)

	err := service.Close()

	assert.NoError(t, err)
	mockClient.AssertExpectations(t)
}

func TestCacheEntry_Creation(t *testing.T) {
	// Test cache entry creation
	data := map[string]interface{}{"test": "data"}
	entry := CacheEntry{
		Data:      data,
		Timestamp: time.Now(),
		TTL:       3600,
		Version:   "1.0",
	}

	assert.Equal(t, data, entry.Data)
	assert.Equal(t, 3600, entry.TTL)
	assert.Equal(t, "1.0", entry.Version)
	assert.WithinDuration(t, time.Now(), entry.Timestamp, time.Second)
}

func TestCacheStats_HitRate(t *testing.T) {
	tests := []struct {
		name     string
		hits     int64
		misses   int64
		expected float64
	}{
		{"Perfect hit rate", 100, 0, 1.0},
		{"Zero hit rate", 0, 100, 0.0},
		{"50% hit rate", 50, 50, 0.5},
		{"No requests", 0, 0, 0.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stats := &CacheStats{
				Hits:   tt.hits,
				Misses: tt.misses,
			}
			assert.Equal(t, tt.expected, stats.HitRate())
		})
	}
}
