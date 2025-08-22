package monitoring

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

const (
	// Instrumentation name for this package
	instrumentationName    = "github.com/meetsmatch/meetsmatch/internal/monitoring"
	instrumentationVersion = "1.0.0"
)

// OTelMiddleware provides OpenTelemetry instrumentation for HTTP requests
type OTelMiddleware struct {
	tracer trace.Tracer
	meter  metric.Meter

	// HTTP metrics
	httpRequestsTotal   metric.Int64Counter
	httpRequestDuration metric.Float64Histogram
	httpRequestSize     metric.Int64Histogram
	httpResponseSize    metric.Int64Histogram
	httpActiveRequests  metric.Int64UpDownCounter
}

// NewOTelMiddleware creates a new OpenTelemetry middleware
func NewOTelMiddleware() (*OTelMiddleware, error) {
	tracer := otel.Tracer(instrumentationName, trace.WithInstrumentationVersion(instrumentationVersion))
	meter := otel.Meter(instrumentationName, metric.WithInstrumentationVersion(instrumentationVersion))

	// Create HTTP metrics
	httpRequestsTotal, err := meter.Int64Counter(
		"http_requests_total",
		metric.WithDescription("Total number of HTTP requests"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create http_requests_total counter: %w", err)
	}

	httpRequestDuration, err := meter.Float64Histogram(
		"http_request_duration_seconds",
		metric.WithDescription("HTTP request duration in seconds"),
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create http_request_duration_seconds histogram: %w", err)
	}

	httpRequestSize, err := meter.Int64Histogram(
		"http_request_size_bytes",
		metric.WithDescription("HTTP request size in bytes"),
		metric.WithUnit("By"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create http_request_size_bytes histogram: %w", err)
	}

	httpResponseSize, err := meter.Int64Histogram(
		"http_response_size_bytes",
		metric.WithDescription("HTTP response size in bytes"),
		metric.WithUnit("By"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create http_response_size_bytes histogram: %w", err)
	}

	httpActiveRequests, err := meter.Int64UpDownCounter(
		"http_active_requests",
		metric.WithDescription("Number of active HTTP requests"),
		metric.WithUnit("1"),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create http_active_requests counter: %w", err)
	}

	return &OTelMiddleware{
		tracer:              tracer,
		meter:               meter,
		httpRequestsTotal:   httpRequestsTotal,
		httpRequestDuration: httpRequestDuration,
		httpRequestSize:     httpRequestSize,
		httpResponseSize:    httpResponseSize,
		httpActiveRequests:  httpActiveRequests,
	}, nil
}

// GinMiddleware returns a Gin middleware function for OpenTelemetry instrumentation
func (m *OTelMiddleware) GinMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract context from headers
		ctx := otel.GetTextMapPropagator().Extract(c.Request.Context(), propagation.HeaderCarrier(c.Request.Header))
		c.Request = c.Request.WithContext(ctx)

		// Start span
		spanName := fmt.Sprintf("%s %s", c.Request.Method, c.FullPath())
		if c.FullPath() == "" {
			spanName = fmt.Sprintf("%s %s", c.Request.Method, c.Request.URL.Path)
		}

		ctx, span := m.tracer.Start(ctx, spanName,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(
				attribute.String("http.method", c.Request.Method),
				attribute.String("http.url", c.Request.URL.String()),
				attribute.String("http.scheme", c.Request.URL.Scheme),
				attribute.String("http.host", c.Request.Host),
				attribute.String("http.target", c.Request.URL.Path),
				attribute.String("http.route", c.FullPath()),
				attribute.String("http.user_agent", c.Request.UserAgent()),
				attribute.String("http.remote_addr", c.ClientIP()),
			),
		)
		defer span.End()

		// Update context in Gin
		c.Request = c.Request.WithContext(ctx)

		// Record request size
		requestSize := c.Request.ContentLength
		if requestSize > 0 {
			m.httpRequestSize.Record(ctx, requestSize,
				metric.WithAttributes(
					attribute.String("method", c.Request.Method),
					attribute.String("route", c.FullPath()),
				),
			)
		}

		// Increment active requests
		m.httpActiveRequests.Add(ctx, 1,
			metric.WithAttributes(
				attribute.String("method", c.Request.Method),
				attribute.String("route", c.FullPath()),
			),
		)

		// Record start time
		start := time.Now()

		// Process request
		c.Next()

		// Calculate duration
		duration := time.Since(start)

		// Decrement active requests
		m.httpActiveRequests.Add(ctx, -1,
			metric.WithAttributes(
				attribute.String("method", c.Request.Method),
				attribute.String("route", c.FullPath()),
			),
		)

		// Set span attributes
		span.SetAttributes(
			attribute.Int("http.status_code", c.Writer.Status()),
			attribute.Int64("http.response_size", int64(c.Writer.Size())),
			attribute.Float64("http.duration", duration.Seconds()),
		)

		// Set span status
		if c.Writer.Status() >= 400 {
			span.SetStatus(codes.Error, http.StatusText(c.Writer.Status()))
		} else {
			span.SetStatus(codes.Ok, "")
		}

		// Record metrics
		attributes := []attribute.KeyValue{
			attribute.String("method", c.Request.Method),
			attribute.String("route", c.FullPath()),
			attribute.String("status_code", strconv.Itoa(c.Writer.Status())),
			attribute.String("status_class", getStatusClass(c.Writer.Status())),
		}

		// Record total requests
		m.httpRequestsTotal.Add(ctx, 1, metric.WithAttributes(attributes...))

		// Record request duration
		m.httpRequestDuration.Record(ctx, duration.Seconds(), metric.WithAttributes(attributes...))

		// Record response size
		if c.Writer.Size() > 0 {
			m.httpResponseSize.Record(ctx, int64(c.Writer.Size()), metric.WithAttributes(attributes...))
		}

		// Record errors in span if any
		if len(c.Errors) > 0 {
			for _, err := range c.Errors {
				span.RecordError(err.Err)
			}
		}
	}
}

// HTTPMiddleware returns a standard HTTP middleware function for OpenTelemetry instrumentation
func (m *OTelMiddleware) HTTPMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract context from headers
		ctx := otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))
		r = r.WithContext(ctx)

		// Start span
		spanName := fmt.Sprintf("%s %s", r.Method, r.URL.Path)
		ctx, span := m.tracer.Start(ctx, spanName,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(
				attribute.String("http.method", r.Method),
				attribute.String("http.url", r.URL.String()),
				attribute.String("http.scheme", r.URL.Scheme),
				attribute.String("http.host", r.Host),
				attribute.String("http.target", r.URL.Path),
				attribute.String("http.user_agent", r.UserAgent()),
				attribute.String("http.remote_addr", r.RemoteAddr),
			),
		)
		defer span.End()

		// Update request context
		r = r.WithContext(ctx)

		// Wrap response writer to capture status and size
		wrapped := &responseWriter{ResponseWriter: w, statusCode: 200}

		// Record request size
		if r.ContentLength > 0 {
			m.httpRequestSize.Record(ctx, r.ContentLength,
				metric.WithAttributes(
					attribute.String("method", r.Method),
					attribute.String("route", r.URL.Path),
				),
			)
		}

		// Increment active requests
		m.httpActiveRequests.Add(ctx, 1,
			metric.WithAttributes(
				attribute.String("method", r.Method),
				attribute.String("route", r.URL.Path),
			),
		)

		// Record start time
		start := time.Now()

		// Process request
		next.ServeHTTP(wrapped, r)

		// Calculate duration
		duration := time.Since(start)

		// Decrement active requests
		m.httpActiveRequests.Add(ctx, -1,
			metric.WithAttributes(
				attribute.String("method", r.Method),
				attribute.String("route", r.URL.Path),
			),
		)

		// Set span attributes
		span.SetAttributes(
			attribute.Int("http.status_code", wrapped.statusCode),
			attribute.Int64("http.response_size", int64(wrapped.size)),
			attribute.Float64("http.duration", duration.Seconds()),
		)

		// Set span status
		if wrapped.statusCode >= 400 {
			span.SetStatus(codes.Error, http.StatusText(wrapped.statusCode))
		} else {
			span.SetStatus(codes.Ok, "")
		}

		// Record metrics
		attributes := []attribute.KeyValue{
			attribute.String("method", r.Method),
			attribute.String("route", r.URL.Path),
			attribute.String("status_code", strconv.Itoa(wrapped.statusCode)),
			attribute.String("status_class", getStatusClass(wrapped.statusCode)),
		}

		// Record total requests
		m.httpRequestsTotal.Add(ctx, 1, metric.WithAttributes(attributes...))

		// Record request duration
		m.httpRequestDuration.Record(ctx, duration.Seconds(), metric.WithAttributes(attributes...))

		// Record response size
		if wrapped.size > 0 {
			m.httpResponseSize.Record(ctx, int64(wrapped.size), metric.WithAttributes(attributes...))
		}
	})
}

// responseWriter wraps http.ResponseWriter to capture status code and response size
type responseWriter struct {
	http.ResponseWriter
	statusCode int
	size       int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	n, err := rw.ResponseWriter.Write(b)
	rw.size += n
	return n, err
}

// getStatusClass returns the status class (1xx, 2xx, 3xx, 4xx, 5xx) for a given status code
func getStatusClass(statusCode int) string {
	switch {
	case statusCode >= 100 && statusCode < 200:
		return "1xx"
	case statusCode >= 200 && statusCode < 300:
		return "2xx"
	case statusCode >= 300 && statusCode < 400:
		return "3xx"
	case statusCode >= 400 && statusCode < 500:
		return "4xx"
	case statusCode >= 500:
		return "5xx"
	default:
		return "unknown"
	}
}
