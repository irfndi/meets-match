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
	// assert.NotNil(t, tracer.activeSpans)
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
	span := tracer.StartSpan("test-operation", SpanKindServer)

	assert.NotNil(t, span)
	assert.NotEmpty(t, span.TraceID)
	assert.NotEmpty(t, span.SpanID)
	assert.Equal(t, "test-operation", span.OperationName)
	// assert.Equal(t, tags, span.Tags)
	assert.Equal(t, SpanStatusOK, span.Status)
	assert.True(t, span.StartTime.Before(time.Now().Add(time.Second)))
	// assert.NotNil(t, span.TraceContext)

	// Check that span is stored in active spans
	// assert.Contains(t, tracer.activeSpans, span.SpanID)
}

func TestTracer_FinishSpan(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	span := tracer.StartSpan("test-operation", SpanKindInternal)

	// Add some delay to test duration
	time.Sleep(10 * time.Millisecond)

	tracer.FinishSpan(span)

	assert.Equal(t, SpanStatusOK, span.Status)
	assert.True(t, span.EndTime.After(span.StartTime))
	assert.True(t, *span.Duration > 0)

	// Check that trace is stored
	assert.Contains(t, tracer.traces, span.TraceID)
}

func TestTracer_GetTrace(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	span := tracer.StartSpan("test-operation", SpanKindInternal)
	tracer.FinishSpan(span)

	trace, exists := tracer.GetTrace(span.TraceID)

	assert.True(t, exists)
	assert.NotNil(t, trace)
	assert.Equal(t, span.TraceID, trace.TraceID)
	assert.Len(t, trace.Spans, 1)
	assert.Equal(t, span.SpanID, trace.Spans[span.SpanID].SpanID)
}

func TestTracer_GetTrace_NotFound(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())

	trace, exists := tracer.GetTrace("non-existent-trace-id")

	assert.False(t, exists)
	assert.Nil(t, trace)
}

func TestTracer_GetAllTraces(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())

	// Create and finish multiple spans
	span1 := tracer.StartSpan("operation-1", SpanKindInternal)
	span2 := tracer.StartSpan("operation-2", SpanKindInternal)
	tracer.FinishSpan(span1)
	tracer.FinishSpan(span2)

	allTraces := tracer.GetAllTraces()

	assert.Len(t, allTraces, 2)
	traceIDs := make([]string, 0, len(allTraces))
	for traceID := range allTraces {
		traceIDs = append(traceIDs, traceID)
	}
	assert.Contains(t, traceIDs, span1.TraceID)
	assert.Contains(t, traceIDs, span2.TraceID)
}

func TestTracer_Stop(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())

	// Start some spans
	span1 := tracer.StartSpan("operation-1", SpanKindInternal)
	span2 := tracer.StartSpan("operation-2", SpanKindInternal)

	tracer.Stop()

	// Check that spans were moved to traces
	allTraces := tracer.GetAllTraces()
	assert.Len(t, allTraces, 2)

	// Verify spans have finished status
	trace1, exists1 := tracer.GetTrace(span1.TraceID)
	trace2, exists2 := tracer.GetTrace(span2.TraceID)
	assert.True(t, exists1)
	assert.True(t, exists2)
	assert.Equal(t, SpanStatusOK, trace1.Spans[span1.SpanID].Status)
	assert.Equal(t, SpanStatusOK, trace2.Spans[span2.SpanID].Status)
}

func TestSpan_SetTag(t *testing.T) {
	tracer := NewTracer(DefaultTracerConfig())
	span := tracer.StartSpan("test-operation", SpanKindInternal)

	span.SetTag("user_id", "123")
	span.SetTag("operation_type", "read")

	assert.Equal(t, "123", span.Tags["user_id"])
	assert.Equal(t, "read", span.Tags["operation_type"])
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
	ctx := &TraceContextStruct{
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

	globalTracer = GetGlobalTracer()
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
	parentSpan := tracer.StartSpan("parent-operation", SpanKindInternal)
	ctx := context.WithValue(context.Background(), "span", parentSpan)

	// Start child span from context
	childSpan, _ := StartSpanFromContext(ctx, "child-operation")

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
	span, _ := StartSpanFromContext(ctx, "root-operation")

	assert.NotNil(t, span)
	assert.Empty(t, span.ParentSpanID)
	assert.Equal(t, "root-operation", span.OperationName)
}

func TestStartSpanFromContext_NoGlobalTracer(t *testing.T) {
	// Reset global tracer
	globalTracer = nil

	ctx := context.Background()

	// Start span from context without global tracer
	span, _ := StartSpanFromContext(ctx, "operation")

	assert.Nil(t, span)
}

func TestTracer_SamplingRate(t *testing.T) {
	// Test with 0% sampling rate
	config := DefaultTracerConfig()
	config.SamplingRate = 0.0
	tracer := NewTracer(config)

	// All spans should be dropped
	for i := 0; i < 10; i++ {
		span := tracer.StartSpan("test-operation", SpanKindInternal)
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
		span := tracer.StartSpan("test-operation", SpanKindInternal)
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
		span := tracer.StartSpan("test-operation", SpanKindInternal)
		tracer.FinishSpan(span)
	}

	allTraces := tracer.GetAllTraces()
	assert.LessOrEqual(t, len(allTraces), 3)
}
