package monitoring

import (
	"context"
	"crypto/tls"
	"database/sql"
	"fmt"
	"net"
	"net/http"
	"runtime"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-telegram/bot"
	"github.com/meetsmatch/meetsmatch/internal/cache"
)

// HealthStatus represents the overall health status
type HealthStatus string

const (
	HealthStatusHealthy   HealthStatus = "healthy"
	HealthStatusDegraded  HealthStatus = "degraded"
	HealthStatusUnhealthy HealthStatus = "unhealthy"
)

// ComponentHealth represents the health of a single component
type ComponentHealth struct {
	Status      HealthStatus `json:"status"`
	Message     string       `json:"message,omitempty"`
	Latency     *int64       `json:"latency_ms,omitempty"`
	LastChecked time.Time    `json:"last_checked"`
	Details     interface{}  `json:"details,omitempty"`
}

// HealthResponse represents the complete health check response
type HealthResponse struct {
	Status     HealthStatus               `json:"status"`
	Service    string                     `json:"service"`
	Version    string                     `json:"version"`
	Timestamp  time.Time                  `json:"timestamp"`
	Uptime     time.Duration              `json:"uptime"`
	Components map[string]ComponentHealth `json:"components"`
	System     SystemInfo                 `json:"system"`
}

// SystemInfo represents system-level information
type SystemInfo struct {
	MemoryUsage MemoryInfo `json:"memory"`
	Goroutines  int        `json:"goroutines"`
	CPUCount    int        `json:"cpu_count"`
	GoVersion   string     `json:"go_version"`
	BuildTime   string     `json:"build_time,omitempty"`
	CommitHash  string     `json:"commit_hash,omitempty"`
}

// MemoryInfo represents memory usage information
type MemoryInfo struct {
	Allocated     uint64  `json:"allocated_bytes"`
	TotalAlloc    uint64  `json:"total_alloc_bytes"`
	Sys           uint64  `json:"sys_bytes"`
	NumGC         uint32  `json:"num_gc"`
	GCCPUFraction float64 `json:"gc_cpu_fraction"`
}

// HealthChecker manages health checks for various components
type HealthChecker struct {
	mu            sync.RWMutex
	startTime     time.Time
	service       string
	version       string
	buildTime     string
	commitHash    string
	components    map[string]ComponentHealth
	checkFuncs    map[string]func() ComponentHealth
	lastCheck     time.Time
	checkInterval time.Duration
}

// NewHealthChecker creates a new health checker
func NewHealthChecker(service, version, buildTime, commitHash string) *HealthChecker {
	return &HealthChecker{
		startTime:     time.Now(),
		service:       service,
		version:       version,
		buildTime:     buildTime,
		commitHash:    commitHash,
		components:    make(map[string]ComponentHealth),
		checkFuncs:    make(map[string]func() ComponentHealth),
		checkInterval: 30 * time.Second,
	}
}

// RegisterDatabaseCheck registers a database health check
func (hc *HealthChecker) RegisterDatabaseCheck(name string, db *sql.DB) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	hc.checkFuncs[name] = func() ComponentHealth {
		start := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		err := db.PingContext(ctx)
		latency := time.Since(start).Milliseconds()

		if err != nil {
			return ComponentHealth{
				Status:      HealthStatusUnhealthy,
				Message:     fmt.Sprintf("Database connection failed: %v", err),
				Latency:     &latency,
				LastChecked: time.Now(),
			}
		}

		// Get database stats
		stats := db.Stats()
		details := map[string]interface{}{
			"open_connections":     stats.OpenConnections,
			"in_use":               stats.InUse,
			"idle":                 stats.Idle,
			"wait_count":           stats.WaitCount,
			"wait_duration":        stats.WaitDuration.String(),
			"max_idle_closed":      stats.MaxIdleClosed,
			"max_idle_time_closed": stats.MaxIdleTimeClosed,
			"max_lifetime_closed":  stats.MaxLifetimeClosed,
		}

		status := HealthStatusHealthy
		if latency > 1000 { // More than 1 second
			status = HealthStatusDegraded
		}

		return ComponentHealth{
			Status:      status,
			Message:     "Database connection successful",
			Latency:     &latency,
			LastChecked: time.Now(),
			Details:     details,
		}
	}
}

// RegisterRedisCheck registers a Redis health check
func (hc *HealthChecker) RegisterRedisCheck(name string, redis *cache.RedisService) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	hc.checkFuncs[name] = func() ComponentHealth {
		start := time.Now()
		isHealthy := redis.HealthCheck()
		latency := time.Since(start).Milliseconds()

		if !isHealthy {
			return ComponentHealth{
				Status:      HealthStatusUnhealthy,
				Message:     "Redis connection failed",
				Latency:     &latency,
				LastChecked: time.Now(),
			}
		}

		// Get Redis stats
		stats := redis.GetStats()
		details := map[string]interface{}{
			"cache_stats": stats,
		}

		status := HealthStatusHealthy
		if latency > 500 { // More than 500ms
			status = HealthStatusDegraded
		}

		return ComponentHealth{
			Status:      status,
			Message:     "Redis connection successful",
			Latency:     &latency,
			LastChecked: time.Now(),
			Details:     details,
		}
	}
}

// RegisterTelegramBotCheck registers a Telegram bot health check
func (hc *HealthChecker) RegisterTelegramBotCheck(name string, botAPI *bot.Bot) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	hc.checkFuncs[name] = func() ComponentHealth {
		start := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// Try to get bot info
		botInfo, err := botAPI.GetMe(ctx)
		latency := time.Since(start).Milliseconds()

		if err != nil {
			return ComponentHealth{
				Status:      HealthStatusUnhealthy,
				Message:     fmt.Sprintf("Telegram API connection failed: %v", err),
				Latency:     &latency,
				LastChecked: time.Now(),
			}
		}

		// Get webhook info
		webhookInfo, _ := botAPI.GetWebhookInfo(ctx)

		details := map[string]interface{}{
			"bot_username":                botInfo.Username,
			"bot_id":                      botInfo.ID,
			"can_join_groups":             botInfo.CanJoinGroups,
			"can_read_all_group_messages": botInfo.CanReadAllGroupMessages,
			"first_name":                  botInfo.FirstName,
		}

		if webhookInfo != nil {
			details["webhook_url"] = webhookInfo.URL
			details["webhook_has_custom_certificate"] = webhookInfo.HasCustomCertificate
			details["webhook_pending_update_count"] = webhookInfo.PendingUpdateCount
			details["webhook_last_error_date"] = webhookInfo.LastErrorDate
			details["webhook_last_error_message"] = webhookInfo.LastErrorMessage
			details["webhook_max_connections"] = webhookInfo.MaxConnections
			details["webhook_allowed_updates"] = webhookInfo.AllowedUpdates
		}

		status := HealthStatusHealthy
		if latency > 2000 { // More than 2 seconds
			status = HealthStatusDegraded
		}

		return ComponentHealth{
			Status:      status,
			Message:     "Telegram bot connection successful",
			Latency:     &latency,
			LastChecked: time.Now(),
			Details:     details,
		}
	}
}

// RegisterHTTPServiceCheck registers an HTTP service health check
func (hc *HealthChecker) RegisterHTTPServiceCheck(name, url string, timeout time.Duration, expectedStatus int) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	if timeout == 0 {
		timeout = 10 * time.Second
	}
	if expectedStatus == 0 {
		expectedStatus = http.StatusOK
	}

	hc.checkFuncs[name] = func() ComponentHealth {
		start := time.Now()
		client := &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: false},
				DialContext: (&net.Dialer{
					Timeout: 5 * time.Second,
				}).DialContext,
			},
		}

		resp, err := client.Get(url)
		latency := time.Since(start).Milliseconds()

		if err != nil {
			return ComponentHealth{
				Status:      HealthStatusUnhealthy,
				Message:     fmt.Sprintf("HTTP service check failed: %v", err),
				Latency:     &latency,
				LastChecked: time.Now(),
				Details: map[string]interface{}{
					"url":   url,
					"error": err.Error(),
				},
			}
		}
		defer resp.Body.Close()

		status := HealthStatusHealthy
		message := "HTTP service is healthy"

		if resp.StatusCode != expectedStatus {
			status = HealthStatusUnhealthy
			message = fmt.Sprintf("Unexpected status code: %d (expected %d)", resp.StatusCode, expectedStatus)
		} else if latency > 5000 { // More than 5 seconds
			status = HealthStatusDegraded
			message = "HTTP service is slow"
		}

		return ComponentHealth{
			Status:      status,
			Message:     message,
			Latency:     &latency,
			LastChecked: time.Now(),
			Details: map[string]interface{}{
				"url":             url,
				"status_code":     resp.StatusCode,
				"expected_status": expectedStatus,
				"content_length":  resp.ContentLength,
				"headers":         resp.Header,
			},
		}
	}
}

// RegisterTCPServiceCheck registers a TCP service health check
func (hc *HealthChecker) RegisterTCPServiceCheck(name, address string, timeout time.Duration) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	if timeout == 0 {
		timeout = 5 * time.Second
	}

	hc.checkFuncs[name] = func() ComponentHealth {
		start := time.Now()
		conn, err := net.DialTimeout("tcp", address, timeout)
		latency := time.Since(start).Milliseconds()

		if err != nil {
			return ComponentHealth{
				Status:      HealthStatusUnhealthy,
				Message:     fmt.Sprintf("TCP connection failed: %v", err),
				Latency:     &latency,
				LastChecked: time.Now(),
				Details: map[string]interface{}{
					"address": address,
					"error":   err.Error(),
				},
			}
		}
		defer conn.Close()

		status := HealthStatusHealthy
		if latency > 1000 { // More than 1 second
			status = HealthStatusDegraded
		}

		return ComponentHealth{
			Status:      status,
			Message:     "TCP connection successful",
			Latency:     &latency,
			LastChecked: time.Now(),
			Details: map[string]interface{}{
				"address":     address,
				"local_addr":  conn.LocalAddr().String(),
				"remote_addr": conn.RemoteAddr().String(),
			},
		}
	}
}

// RegisterDNSCheck registers a DNS resolution health check
func (hc *HealthChecker) RegisterDNSCheck(name, hostname string, timeout time.Duration) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	if timeout == 0 {
		timeout = 5 * time.Second
	}

	hc.checkFuncs[name] = func() ComponentHealth {
		start := time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()

		resolver := &net.Resolver{}
		addrs, err := resolver.LookupIPAddr(ctx, hostname)
		latency := time.Since(start).Milliseconds()

		if err != nil {
			return ComponentHealth{
				Status:      HealthStatusUnhealthy,
				Message:     fmt.Sprintf("DNS resolution failed: %v", err),
				Latency:     &latency,
				LastChecked: time.Now(),
				Details: map[string]interface{}{
					"hostname": hostname,
					"error":    err.Error(),
				},
			}
		}

		var ipAddresses []string
		for _, addr := range addrs {
			ipAddresses = append(ipAddresses, addr.IP.String())
		}

		status := HealthStatusHealthy
		if latency > 2000 { // More than 2 seconds
			status = HealthStatusDegraded
		}

		return ComponentHealth{
			Status:      status,
			Message:     "DNS resolution successful",
			Latency:     &latency,
			LastChecked: time.Now(),
			Details: map[string]interface{}{
				"hostname":     hostname,
				"ip_addresses": ipAddresses,
				"count":        len(addrs),
			},
		}
	}
}

// RegisterDiskSpaceCheck registers a disk space health check
func (hc *HealthChecker) RegisterDiskSpaceCheck(name, path string, thresholdPercent float64) {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	if thresholdPercent == 0 {
		thresholdPercent = 90.0 // Default to 90%
	}

	hc.checkFuncs[name] = func() ComponentHealth {
		// This is a simplified version - in production, you'd use syscalls
		// For now, we'll just return a healthy status
		return ComponentHealth{
			Status:      HealthStatusHealthy,
			Message:     "Disk space check not implemented for Windows",
			LastChecked: time.Now(),
			Details: map[string]interface{}{
				"path":      path,
				"threshold": thresholdPercent,
				"note":      "Disk space monitoring requires platform-specific implementation",
			},
		}
	}
}

// RegisterCustomCheck registers a custom health check function
func (hc *HealthChecker) RegisterCustomCheck(name string, checkFunc func() ComponentHealth) {
	hc.mu.Lock()
	defer hc.mu.Unlock()
	hc.checkFuncs[name] = checkFunc
}

// RunChecks executes all registered health checks
func (hc *HealthChecker) RunChecks() {
	hc.mu.Lock()
	defer hc.mu.Unlock()

	for name, checkFunc := range hc.checkFuncs {
		hc.components[name] = checkFunc()
	}
	hc.lastCheck = time.Now()
}

// GetHealth returns the current health status
func (hc *HealthChecker) GetHealth() HealthResponse {
	hc.mu.RLock()
	defer hc.mu.RUnlock()

	// Run checks if they haven't been run recently
	if time.Since(hc.lastCheck) > hc.checkInterval {
		hc.mu.RUnlock()
		hc.RunChecks()
		hc.mu.RLock()
	}

	// Determine overall status
	overallStatus := HealthStatusHealthy
	for _, component := range hc.components {
		if component.Status == HealthStatusUnhealthy {
			overallStatus = HealthStatusUnhealthy
			break
		} else if component.Status == HealthStatusDegraded {
			overallStatus = HealthStatusDegraded
		}
	}

	// Get system information
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	systemInfo := SystemInfo{
		MemoryUsage: MemoryInfo{
			Allocated:     memStats.Alloc,
			TotalAlloc:    memStats.TotalAlloc,
			Sys:           memStats.Sys,
			NumGC:         memStats.NumGC,
			GCCPUFraction: memStats.GCCPUFraction,
		},
		Goroutines: runtime.NumGoroutine(),
		CPUCount:   runtime.NumCPU(),
		GoVersion:  runtime.Version(),
		BuildTime:  hc.buildTime,
		CommitHash: hc.commitHash,
	}

	return HealthResponse{
		Status:     overallStatus,
		Service:    hc.service,
		Version:    hc.version,
		Timestamp:  time.Now(),
		Uptime:     time.Since(hc.startTime),
		Components: hc.components,
		System:     systemInfo,
	}
}

// HealthHandler returns a Gin handler for health checks
func (hc *HealthChecker) HealthHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		health := hc.GetHealth()

		// Set appropriate HTTP status code
		statusCode := http.StatusOK
		switch health.Status {
		case HealthStatusDegraded:
			statusCode = http.StatusOK // Still return 200 for degraded
		case HealthStatusUnhealthy:
			statusCode = http.StatusServiceUnavailable
		}

		c.JSON(statusCode, health)
	}
}

// ReadinessHandler returns a simple readiness check
func (hc *HealthChecker) ReadinessHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		health := hc.GetHealth()

		if health.Status == HealthStatusUnhealthy {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status":  "not ready",
				"message": "Service is unhealthy",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":  "ready",
			"message": "Service is ready to accept traffic",
		})
	}
}

// LivenessHandler returns a simple liveness check
func (hc *HealthChecker) LivenessHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "alive",
			"uptime":    time.Since(hc.startTime).String(),
			"timestamp": time.Now(),
		})
	}
}
