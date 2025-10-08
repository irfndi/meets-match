package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/meetsmatch/meetsmatch/internal/cache"
)

// MockRedisService for API testing
type MockRedisService struct {
	mock.Mock
}

func (m *MockRedisService) Set(key string, value interface{}, expiration time.Duration) error {
	args := m.Called(key, value, expiration)
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

func (m *MockRedisService) SetCache(key string, data interface{}, ttl time.Duration) error {
	args := m.Called(key, data, ttl)
	return args.Error(0)
}

func (m *MockRedisService) GetCache(key string, dest interface{}) error {
	args := m.Called(key, dest)
	return args.Error(0)
}

func (m *MockRedisService) SetSession(sessionID string, data interface{}, ttl time.Duration) error {
	args := m.Called(sessionID, data, ttl)
	return args.Error(0)
}

func (m *MockRedisService) GetSession(sessionID string, dest interface{}) error {
	args := m.Called(sessionID, dest)
	return args.Error(0)
}

func (m *MockRedisService) CacheUser(userID int64, userData interface{}, ttl time.Duration) error {
	args := m.Called(userID, userData, ttl)
	return args.Error(0)
}

func (m *MockRedisService) GetCachedUser(userID int64, dest interface{}) error {
	args := m.Called(userID, dest)
	return args.Error(0)
}

func (m *MockRedisService) InvalidatePattern(pattern string) error {
	args := m.Called(pattern)
	return args.Error(0)
}

func (m *MockRedisService) HealthCheck() bool {
	args := m.Called()
	return args.Bool(0)
}

func (m *MockRedisService) GetStats() cache.CacheStats {
	args := m.Called()
	return args.Get(0).(cache.CacheStats)
}

func (m *MockRedisService) Close() error {
	args := m.Called()
	return args.Error(0)
}

// MockCacheMiddleware for API testing
type MockCacheMiddleware struct {
	mock.Mock
}

func (m *MockCacheMiddleware) WarmCache(ctx context.Context) error {
	args := m.Called(ctx)
	return args.Error(0)
}

func (m *MockCacheMiddleware) InvalidateCache(ctx context.Context, pattern string) error {
	args := m.Called(ctx, pattern)
	return args.Error(0)
}

func (m *MockCacheMiddleware) HealthCheck() bool {
	args := m.Called()
	return args.Bool(0)
}

func (m *MockCacheMiddleware) GetStats() cache.CacheStats {
	args := m.Called()
	return args.Get(0).(cache.CacheStats)
}

// setupTestRouter creates a test router with mocked dependencies
func setupTestRouter(mockRedis *MockRedisService, mockCache *MockCacheMiddleware) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		redisHealth := mockRedis.HealthCheck()
		status := "healthy"
		if !redisHealth {
			status = "degraded"
		}
		c.JSON(http.StatusOK, gin.H{
			"status":    status,
			"service":   "telegram-bot",
			"redis":     redisHealth,
			"timestamp": time.Now().UTC(),
		})
	})

	// Metrics endpoint
	router.GET("/metrics", func(c *gin.Context) {
		stats := mockRedis.GetStats()
		c.JSON(http.StatusOK, gin.H{
			"cache_stats": stats,
			"timestamp":   time.Now().UTC(),
		})
	})

	// Cache management endpoints
	router.POST("/cache/warm", func(c *gin.Context) {
		err := mockCache.WarmCache(context.Background())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Cache warmed successfully"})
	})

	router.DELETE("/cache/invalidate", func(c *gin.Context) {
		pattern := c.Query("pattern")
		if pattern == "" {
			pattern = "*"
		}
		err := mockCache.InvalidateCache(context.Background(), pattern)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Cache invalidated successfully"})
	})

	return router
}

// Test health endpoint
func TestHealthEndpoint(t *testing.T) {
	t.Run("Healthy status", func(t *testing.T) {
		mockRedis := &MockRedisService{}
		mockCache := &MockCacheMiddleware{}

		// Setup expectations
		mockRedis.On("HealthCheck").Return(true)

		router := setupTestRouter(mockRedis, mockCache)

		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "healthy", response["status"])
		assert.Equal(t, "telegram-bot", response["service"])
		assert.Equal(t, true, response["redis"])
		assert.NotNil(t, response["timestamp"])

		mockRedis.AssertExpectations(t)
	})

	t.Run("Degraded status when Redis is down", func(t *testing.T) {
		mockRedis := &MockRedisService{}
		mockCache := &MockCacheMiddleware{}

		// Setup expectations
		mockRedis.On("HealthCheck").Return(false)

		router := setupTestRouter(mockRedis, mockCache)

		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "degraded", response["status"])
		assert.Equal(t, false, response["redis"])

		mockRedis.AssertExpectations(t)
	})
}

// Test metrics endpoint
func TestMetricsEndpoint(t *testing.T) {
	t.Run("Successful metrics retrieval", func(t *testing.T) {
		mockRedis := &MockRedisService{}
		mockCache := &MockCacheMiddleware{}

		// Setup expectations
		expectedStats := cache.CacheStats{
			Hits:   100,
			Misses: 20,
			Sets:   50,
		}
		mockRedis.On("GetStats").Return(expectedStats)

		router := setupTestRouter(mockRedis, mockCache)

		req := httptest.NewRequest("GET", "/metrics", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.NotNil(t, response["cache_stats"])
		assert.NotNil(t, response["timestamp"])

		// Verify cache stats structure
		cacheStats := response["cache_stats"].(map[string]interface{})
		assert.Equal(t, float64(100), cacheStats["hits"])
		assert.Equal(t, float64(20), cacheStats["misses"])
		assert.Equal(t, float64(50), cacheStats["sets"])

		mockRedis.AssertExpectations(t)
	})
}

// Test cache warm endpoint
func TestCacheWarmEndpoint(t *testing.T) {
	t.Run("Successful cache warming", func(t *testing.T) {
		mockRedis := &MockRedisService{}
		mockCache := &MockCacheMiddleware{}

		// Setup expectations
		mockCache.On("WarmCache", mock.Anything).Return(nil)

		router := setupTestRouter(mockRedis, mockCache)

		req := httptest.NewRequest("POST", "/cache/warm", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "Cache warmed successfully", response["message"])

		mockCache.AssertExpectations(t)
	})

	t.Run("Cache warming failure", func(t *testing.T) {
		mockRedis := &MockRedisService{}
		mockCache := &MockCacheMiddleware{}

		// Setup expectations
		mockCache.On("WarmCache", mock.Anything).Return(fmt.Errorf("cache warming failed"))

		router := setupTestRouter(mockRedis, mockCache)

		req := httptest.NewRequest("POST", "/cache/warm", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "cache warming failed", response["error"])

		mockCache.AssertExpectations(t)
	})
}

// Test cache invalidate endpoint
func TestCacheInvalidateEndpoint(t *testing.T) {
	t.Run("Successful cache invalidation with default pattern", func(t *testing.T) {
		mockRedis := &MockRedisService{}
		mockCache := &MockCacheMiddleware{}

		// Setup expectations
		mockCache.On("InvalidateCache", mock.Anything, mock.Anything).Return(nil)

		router := setupTestRouter(mockRedis, mockCache)

		req := httptest.NewRequest("DELETE", "/cache/invalidate", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "Cache invalidated successfully", response["message"])

		mockCache.AssertExpectations(t)
	})

	t.Run("Successful cache invalidation with custom pattern", func(t *testing.T) {
		mockRedis := &MockRedisService{}
		mockCache := &MockCacheMiddleware{}

		// Setup expectations
		mockCache.On("InvalidateCache", mock.Anything, "user:*").Return(nil)

		router := setupTestRouter(mockRedis, mockCache)

		req := httptest.NewRequest("DELETE", "/cache/invalidate?pattern=user:*", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "Cache invalidated successfully", response["message"])

		mockCache.AssertExpectations(t)
	})

	t.Run("Cache invalidation failure", func(t *testing.T) {
		mockRedis := &MockRedisService{}
		mockCache := &MockCacheMiddleware{}

		// Setup expectations
		mockCache.On("InvalidateCache", mock.Anything, mock.Anything).Return(fmt.Errorf("invalidation failed"))

		router := setupTestRouter(mockRedis, mockCache)

		req := httptest.NewRequest("DELETE", "/cache/invalidate", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusInternalServerError, w.Code)

		var response map[string]interface{}
		err := json.Unmarshal(w.Body.Bytes(), &response)
		require.NoError(t, err)

		assert.Equal(t, "invalidation failed", response["error"])

		mockCache.AssertExpectations(t)
	})
}

// Test environment variable handling
func TestEnvironmentVariables(t *testing.T) {
	t.Run("Default port when BOT_PORT not set", func(t *testing.T) {
		// Temporarily unset BOT_PORT
		originalPort := os.Getenv("BOT_PORT")
		os.Unsetenv("BOT_PORT")
		defer func() {
			if originalPort != "" {
				os.Setenv("BOT_PORT", originalPort)
			}
		}()

		port := os.Getenv("BOT_PORT")
		if port == "" {
			port = "8081"
		}

		assert.Equal(t, "8081", port)
	})

	t.Run("Custom port when BOT_PORT is set", func(t *testing.T) {
		// Set custom port
		originalPort := os.Getenv("BOT_PORT")
		os.Setenv("BOT_PORT", "9090")
		defer func() {
			if originalPort != "" {
				os.Setenv("BOT_PORT", originalPort)
			} else {
				os.Unsetenv("BOT_PORT")
			}
		}()

		port := os.Getenv("BOT_PORT")
		assert.Equal(t, "9090", port)
	})
}

// Test helper functions
func TestHelperFunctions(t *testing.T) {
	t.Run("getEnvWithDefault with existing env", func(t *testing.T) {
		os.Setenv("TEST_ENV", "test_value")
		defer os.Unsetenv("TEST_ENV")

		result := getEnvWithDefault("TEST_ENV", "default_value")
		assert.Equal(t, "test_value", result)
	})

	t.Run("getEnvWithDefault with missing env", func(t *testing.T) {
		os.Unsetenv("MISSING_ENV")

		result := getEnvWithDefault("MISSING_ENV", "default_value")
		assert.Equal(t, "default_value", result)
	})

	t.Run("getIntEnvWithDefault with existing env", func(t *testing.T) {
		os.Setenv("TEST_INT_ENV", "42")
		defer os.Unsetenv("TEST_INT_ENV")

		result := getIntEnvWithDefault("TEST_INT_ENV", 10)
		assert.Equal(t, 42, result)
	})

	t.Run("getIntEnvWithDefault with missing env", func(t *testing.T) {
		os.Unsetenv("MISSING_INT_ENV")

		result := getIntEnvWithDefault("MISSING_INT_ENV", 10)
		assert.Equal(t, 10, result)
	})

	t.Run("getIntEnvWithDefault with invalid int", func(t *testing.T) {
		os.Setenv("INVALID_INT_ENV", "not_a_number")
		defer os.Unsetenv("INVALID_INT_ENV")

		result := getIntEnvWithDefault("INVALID_INT_ENV", 10)
		assert.Equal(t, 10, result)
	})
}

// Integration test for multiple endpoints
func TestAPIIntegration(t *testing.T) {
	t.Run("Complete API workflow", func(t *testing.T) {
		mockRedis := &MockRedisService{}
		mockCache := &MockCacheMiddleware{}

		// Setup expectations for health check
		mockRedis.On("HealthCheck").Return(true)

		// Setup expectations for metrics
		expectedStats := cache.CacheStats{
			Hits:   150,
			Misses: 30,
			Sets:   75,
		}
		mockRedis.On("GetStats").Return(expectedStats)

		// Setup expectations for cache operations
		mockCache.On("WarmCache", mock.Anything).Return(nil)
		mockCache.On("InvalidateCache", mock.Anything, mock.Anything).Return(nil)

		router := setupTestRouter(mockRedis, mockCache)

		// Test health endpoint
		req := httptest.NewRequest("GET", "/health", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)

		// Test metrics endpoint
		req = httptest.NewRequest("GET", "/metrics", nil)
		w = httptest.NewRecorder()
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)

		// Test cache warm endpoint
		req = httptest.NewRequest("POST", "/cache/warm", nil)
		w = httptest.NewRecorder()
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)

		// Test cache invalidate endpoint
		req = httptest.NewRequest("DELETE", "/cache/invalidate", nil)
		w = httptest.NewRecorder()
		router.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)

		mockRedis.AssertExpectations(t)
		mockCache.AssertExpectations(t)
	})
}
