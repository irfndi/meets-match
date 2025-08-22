package monitoring

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestNewTracer(t *testing.T) {
	config := TracerConfig{
		ServiceName:    "test-service",
		ServiceVersion: "1.0.0",
		MaxTraces:      100,
		TraceRetention: time.Hour,
		SamplingRate:   0.5,
		Enabled:        true,
	}

	tracer := NewTracer(config)

	assert.NotNil(t, tracer)
	assert.Equal(t, "test-service", tracer.config.ServiceName)
	assert.Equal(t, "1.0.0", tracer.config.ServiceVersion)
	assert.Equal(t, 100, tracer.config.MaxTraces)
	assert.Equal(t, time.Hour, tracer.config.TraceRetention)
	assert.Equal(t, 0.5, tracer.config.SamplingRate)
	assert.True(t, tracer.config.Enabled)
	assert.NotNil(t, tracer.traces)
	assert.NotNil(t, tracer.activeSpans)
}

func TestDefaultTracerConfig(t *testing.T) {
	config := DefaultTracerConfig()

	assert.Equal(t, "unknown-service", config.ServiceName)
	assert.Equal(t, "unknown", config.ServiceVersion)
	assert.Equal(t, 1000, config.MaxTraces)
	assert.Equal(t, 24*time.Hour, config.TraceRetention)
	assert.Equal(t, 0.1, config.SamplingRate)
	assert.True(t, config.Enabled)
}

func TestTracer_StartSpan(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	tags := map[string]string{
		"operation": "test",
		"user_id":   "123",
	}

	span := tracer.StartSpan("test-operation", tags)

	assert.NotNil(t, span)
	assert.NotEmpty(t, span.TraceID)
	assert.NotEmpty(t, span.SpanID)
	assert.Equal(t, "test-operation", span.OperationName)
	assert.Equal(t, tags, span.Tags)
	assert.Equal(t, SpanStatusActive, span.Status)
	assert.True(t, span.StartTime.Before(time.Now().Add(time.Second)))
	assert.NotNil(t, span.TraceContext)

	// Check that span is stored in active spans
	assert.Contains(t, tracer.activeSpans, span.SpanID)
}

func TestTracer_StartSpanWithParent(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())

	// Create parent span
	parentSpan := tracer.StartSpan("parent-operation", nil)
	assert.NotNil(t, parentSpan)

	// Create child span
	childSpan := tracer.StartSpanWithParent("child-operation", parentSpan, map[string]string{"child": "true"})

	assert.NotNil(t, childSpan)
	assert.Equal(t, parentSpan.TraceID, childSpan.TraceID)     // Same trace ID
	assert.NotEqual(t, parentSpan.SpanID, childSpan.SpanID)    // Different span ID
	assert.Equal(t, parentSpan.SpanID, childSpan.ParentSpanID) // Parent relationship
	assert.Equal(t, "child-operation", childSpan.OperationName)
	assert.Equal(t, "true", childSpan.Tags["child"])
}

func TestTracer_FinishSpan(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	span := tracer.StartSpan("test-operation", nil)

	// Add some delay to test duration
	time.Sleep(10 * time.Millisecond)

	tracer.FinishSpan(span)

	assert.Equal(t, SpanStatusFinished, span.Status)
	assert.True(t, span.EndTime.After(span.StartTime))
	assert.True(t, span.Duration > 0)

	// Check that span is removed from active spans
	assert.NotContains(t, tracer.activeSpans, span.SpanID)

	// Check that trace is stored
	assert.Contains(t, tracer.traces, span.TraceID)
}

func TestTracer_GetTrace(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	span := tracer.StartSpan("test-operation", nil)
	tracer.FinishSpan(span)

	trace := tracer.GetTrace(span.TraceID)

	assert.NotNil(t, trace)
	assert.Equal(t, span.TraceID, trace.TraceID)
	assert.Len(t, trace.Spans, 1)
	assert.Equal(t, span.SpanID, trace.Spans[0].SpanID)
}

func TestTracer_GetTrace_NotFound(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())

	trace := tracer.GetTrace("non-existent-trace-id")

	assert.Nil(t, trace)
}

func TestTracer_GetActiveSpans(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())

	// Start multiple spans
	span1 := tracer.StartSpan("operation-1", nil)
	span2 := tracer.StartSpan("operation-2", nil)
	span3 := tracer.StartSpan("operation-3", nil)

	activeSpans := tracer.GetActiveSpans()

	assert.Len(t, activeSpans, 3)
	spanIDs := make([]string, len(activeSpans))
	for i, span := range activeSpans {
		spanIDs[i] = span.SpanID
	}
	assert.Contains(t, spanIDs, span1.SpanID)
	assert.Contains(t, spanIDs, span2.SpanID)
	assert.Contains(t, spanIDs, span3.SpanID)

	// Finish one span
	tracer.FinishSpan(span1)
	activeSpans = tracer.GetActiveSpans()
	assert.Len(t, activeSpans, 2)
}

func TestTracer_GetAllTraces(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())

	// Create and finish multiple spans
	span1 := tracer.StartSpan("operation-1", nil)
	span2 := tracer.StartSpan("operation-2", nil)
	tracer.FinishSpan(span1)
	tracer.FinishSpan(span2)

	allTraces := tracer.GetAllTraces()

	assert.Len(t, allTraces, 2)
	traceIDs := make([]string, len(allTraces))
	for i, trace := range allTraces {
		traceIDs[i] = trace.TraceID
	}
	assert.Contains(t, traceIDs, span1.TraceID)
	assert.Contains(t, traceIDs, span2.TraceID)
}

func TestTracer_Stop(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())

	// Start some spans
	span1 := tracer.StartSpan("operation-1", nil)
	span2 := tracer.StartSpan("operation-2", nil)

	tracer.Stop()

	// Check that all active spans are finished
	activeSpans := tracer.GetActiveSpans()
	assert.Len(t, activeSpans, 0)

	// Check that spans were moved to traces
	allTraces := tracer.GetAllTraces()
	assert.Len(t, allTraces, 2)

	// Verify spans have finished status
	trace1 := tracer.GetTrace(span1.TraceID)
	trace2 := tracer.GetTrace(span2.TraceID)
	assert.Equal(t, SpanStatusFinished, trace1.Spans[0].Status)
	assert.Equal(t, SpanStatusFinished, trace2.Spans[0].Status)
}

func TestSpan_SetTag(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	span := tracer.StartSpan("test-operation", nil)

	span.SetTag("user_id", "123")
	span.SetTag("operation_type", "read")

	assert.Equal(t, "123", span.Tags["user_id"])
	assert.Equal(t, "read", span.Tags["operation_type"])
}

func TestSpan_SetStatus(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	span := tracer.StartSpan("test-operation", nil)

	span.SetStatus(SpanStatusError)

	assert.Equal(t, SpanStatusError, span.Status)
}

func TestSpan_AddEvent(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	span := tracer.StartSpan("test-operation", nil)

	span.AddEvent("database_query", map[string]string{"query": "SELECT * FROM users"})
	span.AddEvent("cache_hit", map[string]string{"key": "user:123"})

	assert.Len(t, span.Events, 2)
	assert.Equal(t, "database_query", span.Events[0].Name)
	assert.Equal(t, "SELECT * FROM users", span.Events[0].Attributes["query"])
	assert.Equal(t, "cache_hit", span.Events[1].Name)
	assert.Equal(t, "user:123", span.Events[1].Attributes["key"])
}

func TestNewTraceContext(t *testing.T) {
	ctx := NewTraceContext()

	assert.NotNil(t, ctx)
	assert.NotEmpty(t, ctx.TraceID)
	assert.NotEmpty(t, ctx.SpanID)
	assert.Len(t, ctx.TraceID, 32) // 16 bytes hex encoded
	assert.Len(t, ctx.SpanID, 16)  // 8 bytes hex encoded
}

func TestExtractHTTPHeaders(t *testing.T) {
	headers := http.Header{
		"X-Trace-Id": []string{"12345678901234567890123456789012"},
		"X-Span-Id":  []string{"1234567890123456"},
	}

	ctx := ExtractHTTPHeaders(headers)

	assert.NotNil(t, ctx)
	assert.Equal(t, "12345678901234567890123456789012", ctx.TraceID)
	assert.Equal(t, "1234567890123456", ctx.SpanID)
}

func TestExtractHTTPHeaders_MissingHeaders(t *testing.T) {
	headers := http.Header{}

	ctx := ExtractHTTPHeaders(headers)

	assert.Nil(t, ctx)
}

func TestExtractHTTPHeaders_PartialHeaders(t *testing.T) {
	headers := http.Header{
		"X-Trace-Id": []string{"12345678901234567890123456789012"},
		// Missing X-Span-Id
	}

	ctx := ExtractHTTPHeaders(headers)

	assert.Nil(t, ctx)
}

func TestInjectHTTPHeaders(t *testing.T) {
	ctx := &TraceContext{
		TraceID: "12345678901234567890123456789012",
		SpanID:  "1234567890123456",
	}
	headers := make(map[string]string)

	InjectHTTPHeaders(ctx, headers)

	assert.Equal(t, "12345678901234567890123456789012", headers["X-Trace-Id"])
	assert.Equal(t, "1234567890123456", headers["X-Span-Id"])
}

func TestInjectHTTPHeaders_NilContext(t *testing.T) {
	headers := make(map[string]string)

	InjectHTTPHeaders(nil, headers)

	assert.Empty(t, headers)
}

func TestSetGlobalTracer(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())

	SetGlobalTracer(tracer)

	globalTracer := GetGlobalTracer()
	assert.Equal(t, tracer, globalTracer)
}

func TestGetGlobalTracer_NotSet(t *testing.T) {
	// Reset global tracer
	globalTracer = nil

	tracer := GetGlobalTracer()
	assert.Nil(t, tracer)
}

func TestStartSpanFromContext(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	SetGlobalTracer(tracer)

	// Create parent span and add to context
	parentSpan := tracer.StartSpan("parent-operation", nil)
	ctx := context.WithValue(context.Background(), "span", parentSpan)

	// Start child span from context
	childSpan := StartSpanFromContext(ctx, "child-operation", map[string]string{"child": "true"})

	assert.NotNil(t, childSpan)
	assert.Equal(t, parentSpan.TraceID, childSpan.TraceID)
	assert.Equal(t, parentSpan.SpanID, childSpan.ParentSpanID)
	assert.Equal(t, "child-operation", childSpan.OperationName)
}

func TestStartSpanFromContext_NoParent(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	SetGlobalTracer(tracer)

	ctx := context.Background()

	// Start span from context without parent
	span := StartSpanFromContext(ctx, "root-operation", map[string]string{"root": "true"})

	assert.NotNil(t, span)
	assert.Empty(t, span.ParentSpanID)
	assert.Equal(t, "root-operation", span.OperationName)
}

func TestStartSpanFromContext_NoGlobalTracer(t *testing.T) {
	// Reset global tracer
	globalTracer = nil

	ctx := context.Background()

	// Start span from context without global tracer
	span := StartSpanFromContext(ctx, "operation", nil)

	assert.Nil(t, span)
}

func TestGenerateTraceID(t *testing.T) {
	traceID1 := generateTraceID()
	traceID2 := generateTraceID()

	assert.NotEmpty(t, traceID1)
	assert.NotEmpty(t, traceID2)
	assert.NotEqual(t, traceID1, traceID2)
	assert.Len(t, traceID1, 32) // 16 bytes hex encoded
	assert.Len(t, traceID2, 32) // 16 bytes hex encoded
}

func TestGenerateSpanID(t *testing.T) {
	spanID1 := generateSpanID()
	spanID2 := generateSpanID()

	assert.NotEmpty(t, spanID1)
	assert.NotEmpty(t, spanID2)
	assert.NotEqual(t, spanID1, spanID2)
	assert.Len(t, spanID1, 16) // 8 bytes hex encoded
	assert.Len(t, spanID2, 16) // 8 bytes hex encoded
}

func TestTracer_SamplingRate(t *testing.T) {
	// Test with 0% sampling rate
	config := DefaultTracerConfig()
	config.SamplingRate = 0.0
	tracer := NewTracer(config)

	// All spans should be dropped
	for i := 0; i < 10; i++ {
		span := tracer.StartSpan("test-operation", nil)
		if span != nil {
			tracer.FinishSpan(span)
		}
	}

	allTraces := tracer.GetAllTraces()
	assert.Len(t, allTraces, 0)

	// Test with 100% sampling rate
	config.SamplingRate = 1.0
	tracer = NewTracer(config)

	// All spans should be kept
	for i := 0; i < 5; i++ {
		span := tracer.StartSpan("test-operation", nil)
		tracer.FinishSpan(span)
	}

	allTraces = tracer.GetAllTraces()
	assert.Len(t, allTraces, 5)
}

func TestTracer_MaxTraces(t *testing.T) {
	config := DefaultTracerConfig()
	config.MaxTraces = 3
	tracer := NewTracer(config)

	// Create more traces than the limit
	for i := 0; i < 5; i++ {
		span := tracer.StartSpan("test-operation", nil)
		tracer.FinishSpan(span)
	}

	allTraces := tracer.GetAllTraces()
	assert.LessOrEqual(t, len(allTraces), 3)
}
