package cache

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// RedisContainer manages a Redis test container
type RedisContainer struct {
	container testcontainers.Container
	host      string
	port      string
}

// StartRedisContainer starts a Redis container for testing
func StartRedisContainer(ctx context.Context) (*RedisContainer, error) {
	req := testcontainers.ContainerRequest{
		Image:        "redis:7-alpine",
		ExposedPorts: []string{"6379/tcp"},
		WaitingFor:   wait.ForLog("Ready to accept connections"),
	}

	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		return nil, err
	}

	host, err := container.Host(ctx)
	if err != nil {
		return nil, err
	}

	mappedPort, err := container.MappedPort(ctx, "6379")
	if err != nil {
		return nil, err
	}

	return &RedisContainer{
		container: container,
		host:      host,
		port:      mappedPort.Port(),
	}, nil
}

// Stop terminates the Redis container
func (rc *RedisContainer) Stop(ctx context.Context) error {
	return rc.container.Terminate(ctx)
}

// GetConnectionString returns the Redis connection string
func (rc *RedisContainer) GetConnectionString() string {
	return fmt.Sprintf("%s:%s", rc.host, rc.port)
}

// TestRedisIntegration tests Redis operations with a real Redis instance
func TestRedisIntegration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()

	// Start Redis container
	redisContainer, err := StartRedisContainer(ctx)
	require.NoError(t, err)
	defer redisContainer.Stop(ctx)

	// Create Redis service
	connStr := redisContainer.GetConnectionString()
	parts := strings.Split(strings.TrimPrefix(connStr, "redis://"), ":")
	host := parts[0]
	port, _ := strconv.Atoi(parts[1])

	config := &RedisConfig{
		Host:     host,
		Port:     port,
		Password: "",
		DB:       0,
		PoolSize: 10,
	}

	redisService, err := NewRedisService(config)
	require.NoError(t, err)
	defer redisService.Close()

	// Test basic operations
	t.Run("Basic Set and Get", func(t *testing.T) {
		key := "test:basic"
		value := "test_value"

		err := redisService.Set(key, value, 60*time.Second)
		assert.NoError(t, err)

		retrieved, err := redisService.Get(key)
		assert.NoError(t, err)
		assert.Equal(t, value, retrieved)
	})

	t.Run("Cache Operations", func(t *testing.T) {
		key := "test:cache"
		data := map[string]interface{}{
			"id":   123,
			"name": "Test User",
			"age":  25,
		}

		err := redisService.SetCache(key, data, 60)
		assert.NoError(t, err)

		var retrieved map[string]interface{}
		err = redisService.GetCache(key, &retrieved)
		assert.NoError(t, err)
		assert.Equal(t, float64(123), retrieved["id"]) // JSON unmarshaling converts numbers to float64
		assert.Equal(t, "Test User", retrieved["name"])
		assert.Equal(t, float64(25), retrieved["age"])
	})

	t.Run("Session Operations", func(t *testing.T) {
		sessionID := "session:12345"
		sessionData := map[string]interface{}{
			"user_id": 123,
			"state":   "waiting_for_input",
			"data":    map[string]string{"step": "profile_setup"},
		}

		err := redisService.SetSession(sessionID, sessionData)
		assert.NoError(t, err)

		var retrieved map[string]interface{}
		err = redisService.GetSession(sessionID, &retrieved)
		assert.NoError(t, err)
		assert.Equal(t, float64(123), retrieved["user_id"])
		assert.Equal(t, "waiting_for_input", retrieved["state"])
	})

	t.Run("User Caching", func(t *testing.T) {
		userID := int64(456)
		userData := map[string]interface{}{
			"id":       userID,
			"username": "testuser",
			"email":    "test@example.com",
			"profile": map[string]interface{}{
				"age":      28,
				"location": "New York",
			},
		}

		err := redisService.SetUserCache(fmt.Sprintf("%d", userID), "profile", userData)
		assert.NoError(t, err)

		var retrieved map[string]interface{}
		err = redisService.GetUserCache(fmt.Sprintf("%d", userID), "profile", &retrieved)
		assert.NoError(t, err)
		assert.Equal(t, float64(userID), retrieved["id"])
		assert.Equal(t, "testuser", retrieved["username"])
		assert.Equal(t, "test@example.com", retrieved["email"])
	})

	t.Run("Pattern Invalidation", func(t *testing.T) {
		// Set multiple keys with a pattern
		keys := []string{"user:123", "user:456", "user:789", "session:abc"}
		for _, key := range keys {
			err := redisService.Set(key, "test_data", 3600*time.Second)
			assert.NoError(t, err)
		}

		// Invalidate user pattern
		count, err := redisService.DeletePattern("user:*")
		assert.NoError(t, err)
		assert.Greater(t, count, int64(0))

		// Check that user keys are deleted
		for _, key := range []string{"user:123", "user:456", "user:789"} {
			result, err := redisService.Get(key)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), "not found")
			assert.Empty(t, result)
		}

		// Check that session key still exists
		result, err := redisService.Get("session:abc")
		assert.NoError(t, err)
		assert.NotEmpty(t, result)
	})

	t.Run("Health Check", func(t *testing.T) {
		isHealthy := redisService.HealthCheck()
		assert.True(t, isHealthy)
	})

	t.Run("Statistics", func(t *testing.T) {
		// Perform some operations to generate stats
		redisService.Set("stats:test1", "value1", time.Minute)
		redisService.Set("stats:test2", "value2", time.Minute)
		redisService.Get("stats:test1")       // Hit
		redisService.Get("stats:test1")       // Hit
		redisService.Get("stats:nonexistent") // Miss

		stats := redisService.GetStats()
		assert.NotNil(t, stats)
		assert.Contains(t, stats, "hits")
		assert.Contains(t, stats, "misses")
	})
}

// TestRedisConcurrency tests Redis operations under concurrent load
func TestRedisConcurrency(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()

	// Start Redis container
	redisContainer, err := StartRedisContainer(ctx)
	require.NoError(t, err)
	defer redisContainer.Stop(ctx)

	// Create Redis service
	connStr := redisContainer.GetConnectionString()
	parts := strings.Split(strings.TrimPrefix(connStr, "redis://"), ":")
	host := parts[0]
	port, _ := strconv.Atoi(parts[1])

	config := &RedisConfig{
		Host:     host,
		Port:     port,
		Password: "",
		DB:       0,
		PoolSize: 20, // Increased pool size for concurrency
	}

	redisService, err := NewRedisService(config)
	require.NoError(t, err)
	defer redisService.Close()

	t.Run("Concurrent Set and Get", func(t *testing.T) {
		const numGoroutines = 50
		const numOperations = 100

		var wg sync.WaitGroup
		errorChan := make(chan error, numGoroutines*numOperations)

		// Start concurrent goroutines
		for i := 0; i < numGoroutines; i++ {
			wg.Add(1)
			go func(goroutineID int) {
				defer wg.Done()

				for j := 0; j < numOperations; j++ {
					key := fmt.Sprintf("concurrent:g%d:op%d", goroutineID, j)
					value := fmt.Sprintf("value_%d_%d", goroutineID, j)

					// Set operation
					if err := redisService.Set(key, value, time.Minute); err != nil {
						errorChan <- fmt.Errorf("set error for %s: %w", key, err)
						continue
					}

					// Get operation
					retrieved, err := redisService.Get(key)
					if err != nil {
						errorChan <- fmt.Errorf("get error for %s: %w", key, err)
						continue
					}

					if retrieved != value {
						errorChan <- fmt.Errorf("value mismatch for %s: expected %s, got %s", key, value, retrieved)
					}
				}
			}(i)
		}

		// Wait for all goroutines to complete
		wg.Wait()
		close(errorChan)

		// Check for errors
		var errors []error
		for err := range errorChan {
			errors = append(errors, err)
		}

		if len(errors) > 0 {
			t.Fatalf("Concurrent operations failed with %d errors. First error: %v", len(errors), errors[0])
		}
	})

	t.Run("Concurrent Cache Operations", func(t *testing.T) {
		const numGoroutines = 20
		const numOperations = 50

		var wg sync.WaitGroup
		errorChan := make(chan error, numGoroutines*numOperations)

		for i := 0; i < numGoroutines; i++ {
			wg.Add(1)
			go func(goroutineID int) {
				defer wg.Done()

				for j := 0; j < numOperations; j++ {
					key := fmt.Sprintf("cache:g%d:op%d", goroutineID, j)
					data := map[string]interface{}{
						"goroutine": goroutineID,
						"operation": j,
						"timestamp": time.Now().Unix(),
					}

					// Cache operation
					if err := redisService.SetCache(key, data, 60); err != nil {
						errorChan <- fmt.Errorf("cache set error for %s: %w", key, err)
						continue
					}

					// Retrieve operation
					var retrieved map[string]interface{}
					if err := redisService.GetCache(key, &retrieved); err != nil {
						errorChan <- fmt.Errorf("cache get error for %s: %w", key, err)
						continue
					}

					if retrieved["goroutine"] != float64(goroutineID) {
						errorChan <- fmt.Errorf("goroutine mismatch for %s", key)
					}
				}
			}(i)
		}

		wg.Wait()
		close(errorChan)

		var errors []error
		for err := range errorChan {
			errors = append(errors, err)
		}

		if len(errors) > 0 {
			t.Fatalf("Concurrent cache operations failed with %d errors. First error: %v", len(errors), errors[0])
		}
	})
}

// TestRedisFailover tests Redis behavior during connection issues
func TestRedisFailover(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()

	// Start Redis container
	redisContainer, err := StartRedisContainer(ctx)
	require.NoError(t, err)

	// Create Redis service
	connStr := redisContainer.GetConnectionString()
	parts := strings.Split(strings.TrimPrefix(connStr, "redis://"), ":")
	host := parts[0]
	port, _ := strconv.Atoi(parts[1])

	config := &RedisConfig{
		Host:     host,
		Port:     port,
		Password: "",
		DB:       0,
		PoolSize: 10,
	}

	redisService, err := NewRedisService(config)
	require.NoError(t, err)
	defer redisService.Close()

	// Test normal operation
	err = redisService.Set("test:failover", "initial_value", time.Minute)
	assert.NoError(t, err)

	value, err := redisService.Get("test:failover")
	assert.NoError(t, err)
	assert.Equal(t, "initial_value", value)

	// Stop Redis container to simulate failure
	err = redisContainer.Stop(ctx)
	require.NoError(t, err)

	// Test operations during failure
	t.Run("Operations during Redis failure", func(t *testing.T) {
		// Set operation should fail
		err = redisService.Set("test:failure", "value", time.Minute)
		assert.Error(t, err)

		// Get operation should fail
		result, err := redisService.Get("test:failure")
		assert.Error(t, err)
		assert.Empty(t, result)

		// Health check should fail
		isHealthy := redisService.HealthCheck()
		assert.False(t, isHealthy)
	})
}

// TestRedisMemoryUsage tests Redis memory usage patterns
func TestRedisMemoryUsage(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	ctx := context.Background()

	// Start Redis container
	redisContainer, err := StartRedisContainer(ctx)
	require.NoError(t, err)
	defer redisContainer.Stop(ctx)

	// Create Redis service
	connStr := redisContainer.GetConnectionString()
	parts := strings.Split(strings.TrimPrefix(connStr, "redis://"), ":")
	host := parts[0]
	port, _ := strconv.Atoi(parts[1])

	config := &RedisConfig{
		Host:     host,
		Port:     port,
		Password: "",
		DB:       0,
		PoolSize: 10,
	}

	redisService, err := NewRedisService(config)
	require.NoError(t, err)
	defer redisService.Close()

	t.Run("Large data storage and retrieval", func(t *testing.T) {
		// Create large data structure
		largeData := make(map[string]interface{})
		for i := 0; i < 1000; i++ {
			largeData[fmt.Sprintf("field_%d", i)] = fmt.Sprintf("value_%d_with_some_additional_content_to_make_it_larger", i)
		}

		// Store large data
		err := redisService.SetCache("test:large_data", largeData, 3600)
		assert.NoError(t, err)

		// Retrieve large data
		var retrieved map[string]interface{}
		err = redisService.GetCache("test:large_data", &retrieved)
		assert.NoError(t, err)
		assert.Len(t, retrieved, 1000)
		assert.Equal(t, "value_0_with_some_additional_content_to_make_it_larger", retrieved["field_0"])
		assert.Equal(t, "value_999_with_some_additional_content_to_make_it_larger", retrieved["field_999"])
	})

	t.Run("TTL behavior", func(t *testing.T) {
		// Set key with short TTL (1 second)
		err := redisService.Set("test:ttl", "temporary_value", time.Second)
		assert.NoError(t, err)

		// Immediately retrieve (should exist)
		value, err := redisService.Get("test:ttl")
		assert.NoError(t, err)
		assert.Equal(t, "temporary_value", value)

		// Wait for expiration
		time.Sleep(time.Second * 2)

		// Try to retrieve (should be expired)
		value, err = redisService.Get("test:ttl")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
		assert.Empty(t, value)
	})
}
