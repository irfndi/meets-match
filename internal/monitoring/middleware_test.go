package monitoring

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// Mock implementations for testing
type MockMetricsCollector struct {
	mock.Mock
}

func (m *MockMetricsCollector) RecordUserInteraction(userID, interactionType string) {
	m.Called(userID, interactionType)
}

func (m *MockMetricsCollector) RecordMatchAttempt(userID string, success bool) {
	m.Called(userID, success)
}

func (m *MockMetricsCollector) RecordMessageProcessing(messageType string, processingTime time.Duration) {
	m.Called(messageType, processingTime)
}

func (m *MockMetricsCollector) GetMetrics() map[string]interface{} {
	args := m.Called()
	return args.Get(0).(map[string]interface{})
}

func (m *MockMetricsCollector) GetPrometheusMetrics() string {
	args := m.Called()
	return args.String(0)
}

type MockTracer struct {
	mock.Mock
}

func (m *MockTracer) StartSpan(operationName string, tags map[string]string) *Span {
	args := m.Called(operationName, tags)
	return args.Get(0).(*Span)
}

func (m *MockTracer) StartSpanWithParent(operationName string, parent *Span, tags map[string]string) *Span {
	args := m.Called(operationName, parent, tags)
	return args.Get(0).(*Span)
}

func (m *MockTracer) FinishSpan(span *Span) {
	m.Called(span)
}

func (m *MockTracer) GetTrace(traceID string) *Trace {
	args := m.Called(traceID)
	if args.Get(0) == nil {
		return nil
	}
	return args.Get(0).(*Trace)
}

func (m *MockTracer) GetActiveSpans() []*Span {
	args := m.Called()
	return args.Get(0).([]*Span)
}

func (m *MockTracer) GetAllTraces() []*Trace {
	args := m.Called()
	return args.Get(0).([]*Trace)
}

func (m *MockTracer) Stop() {
	m.Called()
}

type MockAlertManager struct {
	mock.Mock
}

func (m *MockAlertManager) AddRule(rule AlertRule) {
	m.Called(rule)
}

func (m *MockAlertManager) RemoveRule(name string) {
	m.Called(name)
}

func (m *MockAlertManager) GetRules() []AlertRule {
	args := m.Called()
	return args.Get(0).([]AlertRule)
}

func (m *MockAlertManager) EvaluateRule(rule AlertRule, value float64) (bool, *Alert) {
	args := m.Called(rule, value)
	return args.Bool(0), args.Get(1).(*Alert)
}

func (m *MockAlertManager) TriggerAlert(alert Alert) error {
	args := m.Called(alert)
	return args.Error(0)
}

func (m *MockAlertManager) GetAlerts() []Alert {
	args := m.Called()
	return args.Get(0).([]Alert)
}

func (m *MockAlertManager) GetAlertsByRule(ruleName string) []Alert {
	args := m.Called(ruleName)
	return args.Get(0).([]Alert)
}

func (m *MockAlertManager) GetAlertsBySeverity(severity AlertSeverity) []Alert {
	args := m.Called(severity)
	return args.Get(0).([]Alert)
}

func (m *MockAlertManager) ClearOldAlerts() {
	m.Called()
}

func (m *MockAlertManager) Start() {
	m.Called()
}

func (m *MockAlertManager) Stop() {
	m.Called()
}

type MockHealthChecker struct {
	mock.Mock
}

func (m *MockHealthChecker) CheckHealth() HealthStatus {
	args := m.Called()
	return args.Get(0).(HealthStatus)
}

func (m *MockHealthChecker) IsHealthy() bool {
	args := m.Called()
	return args.Bool(0)
}

func (m *MockHealthChecker) IsReady() bool {
	args := m.Called()
	return args.Bool(0)
}

func (m *MockHealthChecker) IsLive() bool {
	args := m.Called()
	return args.Bool(0)
}

func TestNewMonitoringMiddleware(t *testing.T) {
	config := MiddlewareConfig{
		MetricsPath: "/metrics",
		HealthPath:  "/health",
		TracesPath:  "/traces",
		AlertsPath:  "/alerts",
		SkipPaths:   []string{"/favicon.ico"},
		Enabled:     true,
	}

	middleware := NewMonitoringMiddleware(config)

	assert.NotNil(t, middleware)
	assert.Equal(t, config, middleware.config)
	assert.NotNil(t, middleware.metrics)
	assert.NotNil(t, middleware.tracer)
	assert.NotNil(t, middleware.alerts)
	assert.NotNil(t, middleware.health)
}

func TestDefaultMiddlewareConfig(t *testing.T) {
	config := DefaultMiddlewareConfig()

	assert.Equal(t, "/metrics", config.MetricsPath)
	assert.Equal(t, "/health", config.HealthPath)
	assert.Equal(t, "/traces", config.TracesPath)
	assert.Equal(t, "/alerts", config.AlertsPath)
	assert.Contains(t, config.SkipPaths, "/favicon.ico")
	assert.Contains(t, config.SkipPaths, "/robots.txt")
	assert.True(t, config.Enabled)
}

func TestMonitoringMiddleware_SetComponents(t *testing.T) {
	middleware := NewMonitoringMiddleware(DefaultMiddlewareConfig())
	mockMetrics := &MockMetricsCollector{}
	mockTracer := &MockTracer{}
	mockAlerts := &MockAlertManager{}
	mockHealth := &MockHealthChecker{}

	middleware.SetMetrics(mockMetrics)
	middleware.SetTracer(mockTracer)
	middleware.SetAlerts(mockAlerts)
	middleware.SetHealth(mockHealth)

	assert.Equal(t, mockMetrics, middleware.metrics)
	assert.Equal(t, mockTracer, middleware.tracer)
	assert.Equal(t, mockAlerts, middleware.alerts)
	assert.Equal(t, mockHealth, middleware.health)
}

func TestMonitoringMiddleware_GinMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	middleware := NewMonitoringMiddleware(DefaultMiddlewareConfig())
	mockMetrics := &MockMetricsCollector{}
	mockTracer := &MockTracer{}
	mockAlerts := &MockAlertManager{}

	// Setup mocks
	mockSpan := &Span{
		TraceID:       "test-trace-id",
		SpanID:        "test-span-id",
		OperationName: "GET /test",
		StartTime:     time.Now(),
		Status:        SpanStatusActive,
	}
	mockMetrics.On("RecordMessageProcessing", mock.AnythingOfType("string"), mock.AnythingOfType("time.Duration")).Return()
	mockTracer.On("StartSpan", mock.AnythingOfType("string"), mock.AnythingOfType("map[string]string")).Return(mockSpan)
	mockTracer.On("FinishSpan", mockSpan).Return()
	mockAlerts.On("GetRules").Return([]AlertRule{})

	middleware.SetMetrics(mockMetrics)
	middleware.SetTracer(mockTracer)
	middleware.SetAlerts(mockAlerts)

	// Create test router
	router := gin.New()
	router.Use(middleware.GinMiddleware())
	router.GET("/test", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "success"})
	})

	// Make request
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
	mockMetrics.AssertExpectations(t)
	mockTracer.AssertExpectations(t)
	mockAlerts.AssertExpectations(t)
}

func TestMonitoringMiddleware_ShouldSkipPath(t *testing.T) {
	config := DefaultMiddlewareConfig()
	config.SkipPaths = []string{"/favicon.ico", "/robots.txt", "/metrics"}
	middleware := NewMonitoringMiddleware(config)

	assert.True(t, middleware.shouldSkipPath("/favicon.ico"))
	assert.True(t, middleware.shouldSkipPath("/robots.txt"))
	assert.True(t, middleware.shouldSkipPath("/metrics"))
	assert.False(t, middleware.shouldSkipPath("/api/users"))
	assert.False(t, middleware.shouldSkipPath("/health"))
}

func TestMonitoringMiddleware_RegisterRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	middleware := NewMonitoringMiddleware(DefaultMiddlewareConfig())
	mockMetrics := &MockMetricsCollector{}
	mockTracer := &MockTracer{}
	mockAlerts := &MockAlertManager{}
	mockHealth := &MockHealthChecker{}

	// Setup mocks
	mockMetrics.On("GetPrometheusMetrics").Return("# Prometheus metrics")
	mockMetrics.On("GetMetrics").Return(map[string]interface{}{"requests_total": 100})
	mockTracer.On("GetAllTraces").Return([]*Trace{})
	mockAlerts.On("GetAlerts").Return([]Alert{})
	mockAlerts.On("GetRules").Return([]AlertRule{})
	mockHealth.On("CheckHealth").Return(HealthStatus{Status: "healthy"})
	mockHealth.On("IsLive").Return(true)
	mockHealth.On("IsReady").Return(true)

	middleware.SetMetrics(mockMetrics)
	middleware.SetTracer(mockTracer)
	middleware.SetAlerts(mockAlerts)
	middleware.SetHealth(mockHealth)

	// Create test router
	router := gin.New()
	middleware.RegisterRoutes(router)

	// Test Prometheus metrics endpoint
	req := httptest.NewRequest("GET", "/metrics", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)
	assert.Equal(t, "# Prometheus metrics", w.Body.String())

	// Test JSON metrics endpoint
	req = httptest.NewRequest("GET", "/metrics/json", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)
	var metrics map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &metrics)
	assert.NoError(t, err)
	assert.Equal(t, float64(100), metrics["requests_total"])

	// Test health check endpoint
	req = httptest.NewRequest("GET", "/health", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)
	var health HealthStatus
	err = json.Unmarshal(w.Body.Bytes(), &health)
	assert.NoError(t, err)
	assert.Equal(t, "healthy", health.Status)

	// Test liveness endpoint
	req = httptest.NewRequest("GET", "/health/live", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)

	// Test readiness endpoint
	req = httptest.NewRequest("GET", "/health/ready", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)

	// Test traces endpoint
	req = httptest.NewRequest("GET", "/traces", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)

	// Test alerts endpoint
	req = httptest.NewRequest("GET", "/alerts", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)

	// Test alert rules endpoint
	req = httptest.NewRequest("GET", "/alerts/rules", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)

	mockMetrics.AssertExpectations(t)
	mockTracer.AssertExpectations(t)
	mockAlerts.AssertExpectations(t)
	mockHealth.AssertExpectations(t)
}

func TestMonitoringMiddleware_HealthEndpoints_Unhealthy(t *testing.T) {
	gin.SetMode(gin.TestMode)

	middleware := NewMonitoringMiddleware(DefaultMiddlewareConfig())
	mockHealth := &MockHealthChecker{}

	// Setup mocks for unhealthy state
	mockHealth.On("IsLive").Return(false)
	mockHealth.On("IsReady").Return(false)

	middleware.SetHealth(mockHealth)

	// Create test router
	router := gin.New()
	middleware.RegisterRoutes(router)

	// Test liveness endpoint (unhealthy)
	req := httptest.NewRequest("GET", "/health/live", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 503, w.Code)

	// Test readiness endpoint (unhealthy)
	req = httptest.NewRequest("GET", "/health/ready", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 503, w.Code)

	mockHealth.AssertExpectations(t)
}

func TestMonitoringMiddleware_RecordRequestMetrics(t *testing.T) {
	middleware := NewMonitoringMiddleware(DefaultMiddlewareConfig())
	mockMetrics := &MockMetricsCollector{}

	mockMetrics.On("RecordMessageProcessing", "GET /test", mock.AnythingOfType("time.Duration")).Return()

	middleware.SetMetrics(mockMetrics)

	// Create mock Gin context
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	startTime := time.Now()
	middleware.recordRequestMetrics(c, startTime)

	mockMetrics.AssertExpectations(t)
}

func TestMonitoringMiddleware_CheckAlertConditions(t *testing.T) {
	middleware := NewMonitoringMiddleware(DefaultMiddlewareConfig())
	mockAlerts := &MockAlertManager{}

	// Setup mock alert rule
	rule := AlertRule{
		Name:        "high_response_time",
		Description: "Response time is too high",
		Metric:      "response_time",
		Operator:    OperatorGreaterThan,
		Threshold:   1000.0, // 1 second
		Severity:    SeverityWarning,
		Enabled:     true,
	}

	alert := &Alert{
		ID:          "test-alert",
		RuleName:    "high_response_time",
		Description: "Response time is too high",
		Severity:    SeverityWarning,
		Status:      AlertStatusFiring,
		Timestamp:   time.Now(),
		Value:       1500.0,
		Threshold:   1000.0,
	}

	mockAlerts.On("GetRules").Return([]AlertRule{rule})
	mockAlerts.On("EvaluateRule", rule, 1500.0).Return(true, alert)
	mockAlerts.On("TriggerAlert", *alert).Return(nil)

	middleware.SetAlerts(mockAlerts)

	// Create mock Gin context
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Writer.WriteHeader(200)

	// Check alert conditions with high response time
	responseTime := 1500 * time.Millisecond
	middleware.checkAlertConditions(c, responseTime)

	mockAlerts.AssertExpectations(t)
}

func TestMonitoringMiddleware_GetComponents(t *testing.T) {
	middleware := NewMonitoringMiddleware(DefaultMiddlewareConfig())
	mockMetrics := &MockMetricsCollector{}
	mockTracer := &MockTracer{}
	mockAlerts := &MockAlertManager{}
	mockHealth := &MockHealthChecker{}

	middleware.SetMetrics(mockMetrics)
	middleware.SetTracer(mockTracer)
	middleware.SetAlerts(mockAlerts)
	middleware.SetHealth(mockHealth)

	assert.Equal(t, mockMetrics, middleware.GetMetrics())
	assert.Equal(t, mockTracer, middleware.GetTracer())
	assert.Equal(t, mockAlerts, middleware.GetAlerts())
	assert.Equal(t, mockHealth, middleware.GetHealth())
}

func TestMonitoringMiddleware_Shutdown(t *testing.T) {
	middleware := NewMonitoringMiddleware(DefaultMiddlewareConfig())
	mockTracer := &MockTracer{}
	mockAlerts := &MockAlertManager{}

	mockTracer.On("Stop").Return()
	mockAlerts.On("Stop").Return()

	middleware.SetTracer(mockTracer)
	middleware.SetAlerts(mockAlerts)

	middleware.Shutdown()

	mockTracer.AssertExpectations(t)
	mockAlerts.AssertExpectations(t)
}

func TestMonitoringMiddleware_DisabledMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	config := DefaultMiddlewareConfig()
	config.Enabled = false
	middleware := NewMonitoringMiddleware(config)

	// Create test router
	router := gin.New()
	router.Use(middleware.GinMiddleware())
	router.GET("/test", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "success"})
	})

	// Make request
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should still work but without monitoring
	assert.Equal(t, 200, w.Code)
}

func TestMonitoringMiddleware_SkippedPaths(t *testing.T) {
	gin.SetMode(gin.TestMode)

	config := DefaultMiddlewareConfig()
	config.SkipPaths = []string{"/favicon.ico"}
	middleware := NewMonitoringMiddleware(config)
	mockMetrics := &MockMetricsCollector{}
	mockTracer := &MockTracer{}

	// Should not call any monitoring methods for skipped paths
	middleware.SetMetrics(mockMetrics)
	middleware.SetTracer(mockTracer)

	// Create test router
	router := gin.New()
	router.Use(middleware.GinMiddleware())
	router.GET("/favicon.ico", func(c *gin.Context) {
		c.Status(200)
	})

	// Make request to skipped path
	req := httptest.NewRequest("GET", "/favicon.ico", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
	// No expectations set, so if any methods were called, the test would fail
	mockMetrics.AssertExpectations(t)
	mockTracer.AssertExpectations(t)
}

func TestMonitoringMiddleware_TraceContextPropagation(t *testing.T) {
	gin.SetMode(gin.TestMode)

	middleware := NewMonitoringMiddleware(DefaultMiddlewareConfig())
	mockTracer := &MockTracer{}

	// Setup mock span with trace context
	mockSpan := &Span{
		TraceID:       "test-trace-id",
		SpanID:        "test-span-id",
		OperationName: "GET /test",
		StartTime:     time.Now(),
		Status:        SpanStatusActive,
		TraceContext: &TraceContext{
			TraceID: "test-trace-id",
			SpanID:  "test-span-id",
		},
	}

	mockTracer.On("StartSpan", mock.AnythingOfType("string"), mock.AnythingOfType("map[string]string")).Return(mockSpan)
	mockTracer.On("FinishSpan", mockSpan).Return()

	middleware.SetTracer(mockTracer)

	// Create test router
	router := gin.New()
	router.Use(middleware.GinMiddleware())
	router.GET("/test", func(c *gin.Context) {
		// Check if trace context is available in the request context
		span, exists := c.Get("span")
		assert.True(t, exists)
		assert.Equal(t, mockSpan, span)
		c.JSON(200, gin.H{"message": "success"})
	})

	// Make request with trace headers
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Trace-Id", "parent-trace-id")
	req.Header.Set("X-Span-Id", "parent-span-id")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
	// Check if trace headers are set in response
	assert.Equal(t, "test-trace-id", w.Header().Get("X-Trace-Id"))
	assert.Equal(t, "test-span-id", w.Header().Get("X-Span-Id"))

	mockTracer.AssertExpectations(t)
}
