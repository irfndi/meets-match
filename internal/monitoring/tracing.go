package monitoring

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// TraceContext keys for context propagation
type TraceContext string

const (
	TraceIDKey  TraceContext = "trace_id"
	SpanIDKey   TraceContext = "span_id"
	ParentIDKey TraceContext = "parent_id"
	BaggageKey  TraceContext = "baggage"
)

// Legacy context keys for backward compatibility
type contextKey string

const (
	LegacyTraceIDKey contextKey = "trace_id"
	LegacySpanIDKey  contextKey = "span_id"
	ParentSpanKey    contextKey = "parent_span_id"
	CorrelationKey   contextKey = "correlation_id"
)

// SpanKind represents the kind of span
type SpanKind string

const (
	SpanKindServer   SpanKind = "server"
	SpanKindClient   SpanKind = "client"
	SpanKindProducer SpanKind = "producer"
	SpanKindConsumer SpanKind = "consumer"
	SpanKindInternal SpanKind = "internal"
)

// SpanStatus represents the status of a span
type SpanStatus string

const (
	SpanStatusOK    SpanStatus = "ok"
	SpanStatusError SpanStatus = "error"
	SpanStatusAbort SpanStatus = "abort"
)

// Span represents a single span in a trace
type Span struct {
	TraceID       string                 `json:"trace_id"`
	SpanID        string                 `json:"span_id"`
	ParentSpanID  string                 `json:"parent_span_id,omitempty"`
	OperationName string                 `json:"operation_name"`
	Kind          SpanKind               `json:"kind"`
	Status        SpanStatus             `json:"status"`
	StartTime     time.Time              `json:"start_time"`
	EndTime       *time.Time             `json:"end_time,omitempty"`
	Duration      *time.Duration         `json:"duration,omitempty"`
	Tags          map[string]interface{} `json:"tags,omitempty"`
	Logs          []SpanLog              `json:"logs,omitempty"`
	Error         *SpanError             `json:"error,omitempty"`
	mu            sync.RWMutex           `json:"-"`
}

// SpanLog represents a log entry within a span
type SpanLog struct {
	Timestamp time.Time              `json:"timestamp"`
	Level     string                 `json:"level"`
	Message   string                 `json:"message"`
	Fields    map[string]interface{} `json:"fields,omitempty"`
}

// SpanError represents an error within a span
type SpanError struct {
	Message    string `json:"message"`
	StackTrace string `json:"stack_trace,omitempty"`
	Type       string `json:"type,omitempty"`
}

// NewSpan creates a new span
func NewSpan(operationName string, kind SpanKind) *Span {
	return &Span{
		TraceID:       generateID(),
		SpanID:        generateID(),
		OperationName: operationName,
		Kind:          kind,
		Status:        SpanStatusOK,
		StartTime:     time.Now(),
		Tags:          make(map[string]interface{}),
		Logs:          make([]SpanLog, 0),
	}
}

// NewChildSpan creates a child span from a parent span
func NewChildSpan(parent *Span, operationName string, kind SpanKind) *Span {
	span := NewSpan(operationName, kind)
	span.TraceID = parent.TraceID
	span.ParentSpanID = parent.SpanID
	return span
}

// SetTag sets a tag on the span
func (s *Span) SetTag(key string, value interface{}) *Span {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Tags[key] = value
	return s
}

// SetError sets an error on the span
func (s *Span) SetError(err error, stackTrace ...string) *Span {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.Status = SpanStatusError
	s.Error = &SpanError{
		Message: err.Error(),
		Type:    fmt.Sprintf("%T", err),
	}

	if len(stackTrace) > 0 {
		s.Error.StackTrace = stackTrace[0]
	}

	return s
}

// LogInfo adds an info log to the span
func (s *Span) LogInfo(message string, fields ...map[string]interface{}) *Span {
	return s.log("info", message, fields...)
}

// LogError adds an error log to the span
func (s *Span) LogError(message string, fields ...map[string]interface{}) *Span {
	return s.log("error", message, fields...)
}

// LogWarn adds a warning log to the span
func (s *Span) LogWarn(message string, fields ...map[string]interface{}) *Span {
	return s.log("warn", message, fields...)
}

// LogDebug adds a debug log to the span
func (s *Span) LogDebug(message string, fields ...map[string]interface{}) *Span {
	return s.log("debug", message, fields...)
}

// log adds a log entry to the span
func (s *Span) log(level, message string, fields ...map[string]interface{}) *Span {
	s.mu.Lock()
	defer s.mu.Unlock()

	logEntry := SpanLog{
		Timestamp: time.Now(),
		Level:     level,
		Message:   message,
	}

	if len(fields) > 0 {
		logEntry.Fields = fields[0]
	}

	s.Logs = append(s.Logs, logEntry)
	return s
}

// Finish finishes the span
func (s *Span) Finish() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.EndTime == nil {
		now := time.Now()
		s.EndTime = &now
		duration := now.Sub(s.StartTime)
		s.Duration = &duration
	}
}

// FinishSpan completes the span and records its duration
func (s *Span) FinishSpan() {
	s.EndTime = &time.Time{}
	*s.EndTime = time.Now()
	duration := s.EndTime.Sub(s.StartTime)
	s.Duration = &duration
	if s.Status == "" {
		s.Status = SpanStatusOK
	}

	// Notify tracer that span is finished
	if tracer := GetGlobalTracer(); tracer != nil {
		tracer.FinishSpan(s)
	}
}

// IsFinished returns true if the span is finished
func (s *Span) IsFinished() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.EndTime != nil
}

// SpanFromContext extracts a span from context
func SpanFromContext(ctx context.Context) *Span {
	if span := ctx.Value("span"); span != nil {
		if s, ok := span.(*Span); ok {
			return s
		}
	}
	return nil
}

// ContextWithSpan returns a new context with the span attached
func ContextWithSpan(ctx context.Context, span *Span) context.Context {
	if span == nil {
		return ctx
	}

	ctx = context.WithValue(ctx, TraceIDKey, span.TraceID)
	ctx = context.WithValue(ctx, SpanIDKey, span.SpanID)
	ctx = context.WithValue(ctx, "span", span)

	return ctx
}

// TraceIDFromContext extracts trace ID from context
func TraceIDFromContext(ctx context.Context) string {
	if traceID := ctx.Value(TraceIDKey); traceID != nil {
		if id, ok := traceID.(string); ok {
			return id
		}
	}
	return ""
}

// SpanIDFromContext extracts span ID from context
func SpanIDFromContext(ctx context.Context) string {
	if spanID := ctx.Value(SpanIDKey); spanID != nil {
		if id, ok := spanID.(string); ok {
			return id
		}
	}
	return ""
}

// StartSpanFromContext is a convenience function to start a span from context
func StartSpanFromContext(ctx context.Context, operationName string) (*Span, context.Context) {
	tracer := GetGlobalTracer()
	if tracer == nil {
		return nil, ctx
	}

	span := tracer.StartSpan(operationName, SpanKindInternal)
	newCtx := ContextWithSpan(ctx, span)

	return span, newCtx
}

// GetDuration returns the span duration
func (s *Span) GetDuration() time.Duration {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.Duration != nil {
		return *s.Duration
	}

	if s.EndTime != nil {
		return s.EndTime.Sub(s.StartTime)
	}

	return time.Since(s.StartTime)
}

// Trace represents a collection of spans
type Trace struct {
	TraceID   string                 `json:"trace_id"`
	Spans     map[string]*Span       `json:"spans"`
	StartTime time.Time              `json:"start_time"`
	EndTime   *time.Time             `json:"end_time,omitempty"`
	Duration  *time.Duration         `json:"duration,omitempty"`
	Tags      map[string]interface{} `json:"tags,omitempty"`
	mu        sync.RWMutex           `json:"-"`
}

// NewTrace creates a new trace
func NewTrace(traceID string) *Trace {
	return &Trace{
		TraceID:   traceID,
		Spans:     make(map[string]*Span),
		StartTime: time.Now(),
		Tags:      make(map[string]interface{}),
	}
}

// AddSpan adds a span to the trace
func (t *Trace) AddSpan(span *Span) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Spans[span.SpanID] = span
}

// GetSpan gets a span by ID
func (t *Trace) GetSpan(spanID string) (*Span, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	span, exists := t.Spans[spanID]
	return span, exists
}

// Finish finishes the trace
func (t *Trace) Finish() {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.EndTime == nil {
		now := time.Now()
		t.EndTime = &now
		duration := now.Sub(t.StartTime)
		t.Duration = &duration
	}
}

// Tracer manages traces and spans
type Tracer struct {
	mu     sync.RWMutex
	traces map[string]*Trace
	config TracerConfig
}

// TracerConfig holds tracer configuration
type TracerConfig struct {
	ServiceName    string        `json:"service_name"`
	ServiceVersion string        `json:"service_version"`
	MaxTraces      int           `json:"max_traces"`
	TraceRetention time.Duration `json:"trace_retention"`
	SamplingRate   float64       `json:"sampling_rate"`
	Enabled        bool          `json:"enabled"`
}

// DefaultTracerConfig returns default tracer configuration
func DefaultTracerConfig() TracerConfig {
	return TracerConfig{
		ServiceName:    "telegram-bot",
		ServiceVersion: "1.0.0",
		MaxTraces:      1000,
		TraceRetention: 24 * time.Hour,
		SamplingRate:   1.0, // 100% sampling by default
		Enabled:        true,
	}
}

// NewTracer creates a new tracer
func NewTracer(config TracerConfig) *Tracer {
	tracer := &Tracer{
		traces: make(map[string]*Trace),
		config: config,
	}

	// Start cleanup goroutine
	go tracer.cleanupRoutine()

	return tracer
}

// Global tracer instance
var (
	globalTracer *Tracer
	tracerMu     sync.RWMutex
)

// SetGlobalTracer sets the global tracer instance
func SetGlobalTracer(tracer *Tracer) {
	tracerMu.Lock()
	defer tracerMu.Unlock()
	globalTracer = tracer
}

// GetGlobalTracer returns the global tracer instance
func GetGlobalTracer() *Tracer {
	tracerMu.RLock()
	defer tracerMu.RUnlock()
	return globalTracer
}

// StartSpan starts a new span
func (t *Tracer) StartSpan(operationName string, kind SpanKind) *Span {
	if !t.config.Enabled {
		return nil
	}

	span := NewSpan(operationName, kind)
	span.SetTag("service.name", t.config.ServiceName)
	span.SetTag("service.version", t.config.ServiceVersion)

	t.mu.Lock()
	defer t.mu.Unlock()

	// Create trace if it doesn't exist
	if _, exists := t.traces[span.TraceID]; !exists {
		t.traces[span.TraceID] = NewTrace(span.TraceID)
	}

	t.traces[span.TraceID].AddSpan(span)
	return span
}

// StartChildSpan starts a child span
func (t *Tracer) StartChildSpan(parent *Span, operationName string, kind SpanKind) *Span {
	if !t.config.Enabled || parent == nil {
		return nil
	}

	span := NewChildSpan(parent, operationName, kind)
	span.SetTag("service.name", t.config.ServiceName)
	span.SetTag("service.version", t.config.ServiceVersion)

	t.mu.Lock()
	defer t.mu.Unlock()

	if trace, exists := t.traces[span.TraceID]; exists {
		trace.AddSpan(span)
	}

	return span
}

// GetTrace gets a trace by ID
func (t *Tracer) GetTrace(traceID string) (*Trace, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	trace, exists := t.traces[traceID]
	return trace, exists
}

// GetAllTraces returns all traces
func (t *Tracer) GetAllTraces() map[string]*Trace {
	t.mu.RLock()
	defer t.mu.RUnlock()

	traces := make(map[string]*Trace)
	for id, trace := range t.traces {
		traces[id] = trace
	}
	return traces
}

// cleanupRoutine periodically cleans up old traces
func (t *Tracer) cleanupRoutine() {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()

	for range ticker.C {
		t.cleanup()
	}
}

// cleanup removes old traces
func (t *Tracer) cleanup() {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-t.config.TraceRetention)

	for traceID, trace := range t.traces {
		if trace.StartTime.Before(cutoff) {
			delete(t.traces, traceID)
		}
	}

	// Also enforce max traces limit
	if len(t.traces) > t.config.MaxTraces {
		// Remove oldest traces
		type traceAge struct {
			id  string
			age time.Time
		}

		var ages []traceAge
		for id, trace := range t.traces {
			ages = append(ages, traceAge{id: id, age: trace.StartTime})
		}

		// Sort by age (oldest first)
		for i := 0; i < len(ages)-1; i++ {
			for j := i + 1; j < len(ages); j++ {
				if ages[i].age.After(ages[j].age) {
					ages[i], ages[j] = ages[j], ages[i]
				}
			}
		}

		// Remove oldest traces
		toRemove := len(t.traces) - t.config.MaxTraces
		for i := 0; i < toRemove; i++ {
			delete(t.traces, ages[i].id)
		}
	}
}

// generateID generates a unique ID
func generateID() string {
	return uuid.New().String()
}

// TracingMiddleware returns a Gin middleware for distributed tracing
func TracingMiddleware(tracer *Tracer) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !tracer.config.Enabled {
			c.Next()
			return
		}

		// Extract trace context from headers
		traceID := c.GetHeader("X-Trace-ID")
		parentSpanID := c.GetHeader("X-Parent-Span-ID")
		correlationID := c.GetHeader("X-Correlation-ID")

		// Generate correlation ID if not present
		if correlationID == "" {
			correlationID = generateID()
		}

		// Start span
		operationName := fmt.Sprintf("%s %s", c.Request.Method, c.FullPath())
		span := tracer.StartSpan(operationName, SpanKindServer)

		if span != nil {
			// Use existing trace ID if provided
			if traceID != "" {
				span.TraceID = traceID
			}

			// Set parent span if provided
			if parentSpanID != "" {
				span.ParentSpanID = parentSpanID
			}

			// Set span tags
			span.SetTag("http.method", c.Request.Method)
			span.SetTag("http.url", c.Request.URL.String())
			span.SetTag("http.user_agent", c.Request.UserAgent())
			span.SetTag("http.remote_addr", c.ClientIP())
			span.SetTag("correlation_id", correlationID)

			// Add to context
			ctx := context.WithValue(c.Request.Context(), TraceIDKey, span.TraceID)
			ctx = context.WithValue(ctx, SpanIDKey, span.SpanID)
			ctx = context.WithValue(ctx, CorrelationKey, correlationID)
			c.Request = c.Request.WithContext(ctx)

			// Set response headers
			c.Header("X-Trace-ID", span.TraceID)
			c.Header("X-Span-ID", span.SpanID)
			c.Header("X-Correlation-ID", correlationID)

			// Defer span finish
			defer func() {
				span.SetTag("http.status_code", c.Writer.Status())
				span.SetTag("http.response_size", c.Writer.Size())

				if c.Writer.Status() >= 400 {
					span.Status = SpanStatusError
					span.LogError(fmt.Sprintf("HTTP %d", c.Writer.Status()))
				}

				span.Finish()
			}()
		}

		c.Next()
	}
}

// GetTraceFromContext extracts trace information from context
func GetTraceFromContext(ctx context.Context) (traceID, spanID, correlationID string) {
	if ctx == nil {
		return "", "", ""
	}

	if tid, ok := ctx.Value(TraceIDKey).(string); ok {
		traceID = tid
	}

	if sid, ok := ctx.Value(SpanIDKey).(string); ok {
		spanID = sid
	}

	if cid, ok := ctx.Value(CorrelationKey).(string); ok {
		correlationID = cid
	}

	return
}

// InjectTraceHeaders injects trace headers into HTTP request
func InjectTraceHeaders(req *http.Request, traceID, spanID, correlationID string) {
	if traceID != "" {
		req.Header.Set("X-Trace-ID", traceID)
	}
	if spanID != "" {
		req.Header.Set("X-Parent-Span-ID", spanID)
	}
	if correlationID != "" {
		req.Header.Set("X-Correlation-ID", correlationID)
	}
}

// TracingHandler returns handlers for trace management
func (t *Tracer) TracingHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		traces := t.GetAllTraces()

		summary := map[string]interface{}{
			"total_traces": len(traces),
			"config":       t.config,
			"traces":       traces,
		}

		c.JSON(http.StatusOK, summary)
	}
}

// GetTraceHandler returns a handler for getting a specific trace
func (t *Tracer) GetTraceHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		traceID := c.Param("traceId")
		if traceID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "trace_id is required"})
			return
		}

		trace, exists := t.GetTrace(traceID)
		if !exists {
			c.JSON(http.StatusNotFound, gin.H{"error": "trace not found"})
			return
		}

		c.JSON(http.StatusOK, trace)
	}
}

// TraceContextStruct represents trace context for HTTP header extraction/injection
type TraceContextStruct struct {
	TraceID string `json:"trace_id"`
	SpanID  string `json:"span_id"`
}

// ExtractHTTPHeaders extracts trace context from HTTP headers
func ExtractHTTPHeaders(headers http.Header) *TraceContextStruct {
	traceID := headers.Get("X-Trace-Id")
	spanID := headers.Get("X-Span-Id")

	if traceID == "" || spanID == "" {
		return nil
	}

	return &TraceContextStruct{
		TraceID: traceID,
		SpanID:  spanID,
	}
}

// InjectHTTPHeaders injects trace context into HTTP headers map
func InjectHTTPHeaders(ctx *TraceContextStruct, headers map[string]string) {
	if ctx == nil {
		return
	}

	headers["X-Trace-Id"] = ctx.TraceID
	headers["X-Span-Id"] = ctx.SpanID
}

// FinishSpan completes a span and records it
func (t *Tracer) FinishSpan(span *Span) {
	if span == nil {
		return
	}
	span.Finish()
}

// Stop stops the tracer and cleans up resources
func (t *Tracer) Stop() {
	// Currently no cleanup needed, but method exists for interface compatibility
}
