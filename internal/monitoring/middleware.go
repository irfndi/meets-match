package monitoring

import (
	"context"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// MonitoringMiddleware provides comprehensive monitoring for HTTP requests
type MonitoringMiddleware struct {
	metrics *MetricsCollector
	tracer  *Tracer
	alerts  *AlertManager
	health  *HealthChecker
	config  *MiddlewareConfig
}

// MiddlewareConfig configures the monitoring middleware
type MiddlewareConfig struct {
	// EnableMetrics enables request metrics collection
	EnableMetrics bool
	// EnableTracing enables distributed tracing
	EnableTracing bool
	// EnableAlerting enables alerting for critical metrics
	EnableAlerting bool
	// EnableHealthChecks enables health check endpoints
	EnableHealthChecks bool
	// MetricsPath is the path for metrics endpoint
	MetricsPath string
	// HealthPath is the path for health check endpoint
	HealthPath string
	// TracingPath is the path for tracing endpoint
	TracingPath string
	// AlertsPath is the path for alerts endpoint
	AlertsPath string
	// SkipPaths are paths to skip monitoring
	SkipPaths []string
	// SlowRequestThreshold defines what constitutes a slow request
	SlowRequestThreshold time.Duration
	// ErrorRateThreshold for alerting (percentage)
	ErrorRateThreshold float64
}

// DefaultMiddlewareConfig returns default configuration
func DefaultMiddlewareConfig() *MiddlewareConfig {
	return &MiddlewareConfig{
		EnableMetrics:        true,
		EnableTracing:        true,
		EnableAlerting:       true,
		EnableHealthChecks:   true,
		MetricsPath:          "/metrics",
		HealthPath:           "/health",
		TracingPath:          "/traces",
		AlertsPath:           "/alerts",
		SkipPaths:            []string{"/favicon.ico", "/robots.txt"},
		SlowRequestThreshold: 1 * time.Second,
		ErrorRateThreshold:   5.0, // 5% error rate
	}
}

// NewMonitoringMiddleware creates a new monitoring middleware
func NewMonitoringMiddleware(config *MiddlewareConfig) *MonitoringMiddleware {
	if config == nil {
		config = DefaultMiddlewareConfig()
	}

	mm := &MonitoringMiddleware{
		config: config,
	}

	if config.EnableMetrics {
		mm.metrics = NewMetricsCollector()
	}

	if config.EnableTracing {
		mm.tracer = NewTracer(DefaultTracerConfig())
		SetGlobalTracer(mm.tracer)
	}

	if config.EnableAlerting {
		mm.alerts = NewAlertManager(DefaultAlertConfig())
	}

	if config.EnableHealthChecks {
		mm.health = NewHealthChecker("telegram-bot", "1.0.0", time.Now().Format(time.RFC3339), "unknown")
	}

	return mm
}

// GinMiddleware returns a Gin middleware function
func (mm *MonitoringMiddleware) GinMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip monitoring for certain paths
		if mm.shouldSkipPath(c.Request.URL.Path) {
			c.Next()
			return
		}

		start := time.Now()
		path := c.Request.URL.Path
		method := c.Request.Method

		// Start tracing if enabled
		var span *Span
		if mm.config.EnableTracing && mm.tracer != nil {
			ctx := c.Request.Context()

			// Extract trace context from headers
			traceCtx := ExtractHTTPHeaders(c.Request.Header)
			if traceCtx != nil {
				ctx = context.WithValue(ctx, "trace_context", traceCtx)
			}

			span = mm.tracer.StartSpan(method+" "+path, SpanKindServer)
			if span != nil {
				span.SetTag("http.method", method)
				span.SetTag("http.path", path)
				span.SetTag("http.user_agent", c.Request.UserAgent())
				span.SetTag("http.remote_addr", c.ClientIP())
			}

			// Add span to context
			ctx = context.WithValue(ctx, "span", span)
			c.Request = c.Request.WithContext(ctx)

			// Inject trace headers for downstream services
			if span != nil {
				headers := make(map[string]string)
				traceCtx := &TraceContextStruct{
					TraceID: span.TraceID,
					SpanID:  span.SpanID,
				}
				InjectHTTPHeaders(traceCtx, headers)
				for key, value := range headers {
					c.Header(key, value)
				}
			}
		}

		// Process request
		c.Next()

		// Calculate duration
		duration := time.Since(start)
		status := c.Writer.Status()
		size := c.Writer.Size()

		// Finish span if tracing is enabled
		if span != nil {
			span.SetTag("http.status_code", strconv.Itoa(status))
			span.SetTag("http.response_size", strconv.Itoa(size))
			span.SetTag("duration_ms", strconv.FormatInt(duration.Milliseconds(), 10))

			if status >= 400 {
				span.Status = SpanStatusError
				span.SetTag("error", "true")
				if len(c.Errors) > 0 {
					span.SetTag("error.message", c.Errors.String())
				}
			} else {
				span.Status = SpanStatusOK
			}

			span.Finish()
		}

		// Record metrics if enabled
		if mm.config.EnableMetrics && mm.metrics != nil {
			mm.recordRequestMetrics(method, path, status, duration, size)
		}

		// Check for alerting conditions if enabled
		if mm.config.EnableAlerting && mm.alerts != nil {
			mm.checkAlertConditions(method, path, status, duration)
		}
	}
}

// shouldSkipPath checks if a path should be skipped from monitoring
func (mm *MonitoringMiddleware) shouldSkipPath(path string) bool {
	for _, skipPath := range mm.config.SkipPaths {
		if path == skipPath {
			return true
		}
	}
	return false
}

// recordRequestMetrics records HTTP request metrics
func (mm *MonitoringMiddleware) recordRequestMetrics(method, path string, status int, duration time.Duration, size int) {
	labels := map[string]string{
		"method": method,
		"path":   path,
		"status": strconv.Itoa(status),
	}

	// Request count
	mm.metrics.NewCounter("http_requests_total", "Total HTTP requests", labels).Inc()

	// Request duration
	mm.metrics.NewHistogram("http_request_duration_seconds", "HTTP request duration", labels, nil).Observe(duration.Seconds())

	mm.metrics.NewHistogram("http_response_size_bytes", "HTTP response size", labels, nil).Observe(float64(size))

	// Error count
	if status >= 400 {
		errorLabels := map[string]string{
			"method": method,
			"path":   path,
			"status": strconv.Itoa(status),
		}
		mm.metrics.NewCounter("http_errors_total", "Total HTTP errors", errorLabels).Inc()
	}

	// Slow requests
	if duration > mm.config.SlowRequestThreshold {
		slowLabels := map[string]string{
			"method": method,
			"path":   path,
		}
		mm.metrics.NewCounter("http_slow_requests_total", "Total slow HTTP requests", slowLabels).Inc()
	}
}

// checkAlertConditions checks if any alert conditions are met
func (mm *MonitoringMiddleware) checkAlertConditions(method, path string, status int, duration time.Duration) {
	// Alert on high error rate
	if status >= 500 {
		alert := &Alert{
			ID:          generateAlertID(),
			RuleName:    "high_error_rate",
			Level:       AlertLevelCritical,
			Status:      AlertStatusFiring,
			Message:     "High error rate detected",
			Description: "HTTP 5xx error detected on " + method + " " + path,
			Timestamp:   time.Now(),
			Labels: map[string]string{
				"method": method,
				"path":   path,
				"status": strconv.Itoa(status),
			},
		}
		mm.alerts.TriggerAlert(*alert)
	}

	// Alert on slow requests
	if duration > mm.config.SlowRequestThreshold*2 { // Alert on very slow requests
		alert := &Alert{
			ID:          generateAlertID(),
			RuleName:    "slow_request",
			Level:       AlertLevelWarning,
			Status:      AlertStatusFiring,
			Message:     "Slow request detected",
			Description: "Request took " + duration.String() + " on " + method + " " + path,
			Timestamp:   time.Now(),
			Labels: map[string]string{
				"method":   method,
				"path":     path,
				"duration": duration.String(),
			},
		}
		mm.alerts.TriggerAlert(*alert)
	}
}

// generateAlertID generates a unique alert ID
func generateAlertID() string {
	return "alert_" + strconv.FormatInt(time.Now().UnixNano(), 36)
}

// RegisterRoutes registers monitoring endpoints
func (mm *MonitoringMiddleware) RegisterRoutes(router *gin.Engine) {
	if mm.config.EnableMetrics && mm.metrics != nil {
		router.GET(mm.config.MetricsPath, mm.metrics.PrometheusHandler())
		router.GET(mm.config.MetricsPath+"/json", mm.metrics.JSONHandler())
	}

	if mm.config.EnableHealthChecks && mm.health != nil {
		router.GET(mm.config.HealthPath, mm.health.HealthHandler())
		router.GET(mm.config.HealthPath+"/live", mm.health.LivenessHandler())
		router.GET(mm.config.HealthPath+"/ready", mm.health.ReadinessHandler())
	}

	if mm.config.EnableTracing && mm.tracer != nil {
		router.GET(mm.config.TracingPath, mm.tracer.TracingHandler())
		router.GET(mm.config.TracingPath+"/:id", mm.tracer.GetTraceHandler())
	}

	if mm.config.EnableAlerting && mm.alerts != nil {
		router.GET(mm.config.AlertsPath, mm.alerts.AlertsHandler())
		router.GET(mm.config.AlertsPath+"/history", mm.alerts.AlertHistoryHandler())
		router.GET(mm.config.AlertsPath+"/rules", mm.alerts.RulesHandler())
		router.GET(mm.config.AlertsPath+"/channels", mm.alerts.ChannelsHandler())
	}
}

// GetMetrics returns the metrics collector
func (mm *MonitoringMiddleware) GetMetrics() *MetricsCollector {
	return mm.metrics
}

// GetTracer returns the tracer
func (mm *MonitoringMiddleware) GetTracer() *Tracer {
	return mm.tracer
}

// GetAlerts returns the alert manager
func (mm *MonitoringMiddleware) GetAlerts() *AlertManager {
	return mm.alerts
}

// GetHealth returns the health checker
func (mm *MonitoringMiddleware) GetHealth() *HealthChecker {
	return mm.health
}

// SetMetrics sets the metrics collector
func (mm *MonitoringMiddleware) SetMetrics(metrics *MetricsCollector) {
	mm.metrics = metrics
}

// SetTracer sets the tracer
func (mm *MonitoringMiddleware) SetTracer(tracer *Tracer) {
	mm.tracer = tracer
}

// SetAlerts sets the alert manager
func (mm *MonitoringMiddleware) SetAlerts(alerts *AlertManager) {
	mm.alerts = alerts
}

// SetHealth sets the health checker
func (mm *MonitoringMiddleware) SetHealth(health *HealthChecker) {
	mm.health = health
}

// Shutdown gracefully shuts down the monitoring middleware
func (mm *MonitoringMiddleware) Shutdown(ctx context.Context) error {
	if mm.alerts != nil {
		mm.alerts.Stop()
	}

	if mm.tracer != nil {
		mm.tracer.Stop()
	}

	return nil
}
