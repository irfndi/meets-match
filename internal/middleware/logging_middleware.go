package middleware

import (
	"bytes"
	"io"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/meetsmatch/meetsmatch/internal/telemetry"
	"github.com/sirupsen/logrus"
)

// LoggingConfig holds the configuration for logging middleware
type LoggingConfig struct {
	SkipPaths   []string `json:"skip_paths"`
	LogBody     bool     `json:"log_body"`
	LogHeaders  bool     `json:"log_headers"`
	MaxBodySize int      `json:"max_body_size"` // bytes
}

// DefaultLoggingConfig returns the default logging middleware configuration
func DefaultLoggingConfig() *LoggingConfig {
	return &LoggingConfig{
		SkipPaths: []string{
			"/health",
			"/metrics",
			"/ping",
		},
		LogBody:     false,
		LogHeaders:  true,
		MaxBodySize: 1024, // 1KB
	}
}

// LoggingMiddleware creates a new logging middleware
func LoggingMiddleware(config *LoggingConfig) gin.HandlerFunc {
	if config == nil {
		config = DefaultLoggingConfig()
	}

	return func(c *gin.Context) {
		// Skip logging for specified paths
		for _, path := range config.SkipPaths {
			if c.Request.URL.Path == path {
				c.Next()
				return
			}
		}

		start := time.Now()

		// Generate correlation ID if not present
		correlationID := c.GetHeader("X-Correlation-ID")
		if correlationID == "" {
			correlationID = telemetry.NewCorrelationID()
			c.Header("X-Correlation-ID", correlationID)
		}

		// Add correlation ID to context
		ctx := telemetry.WithCorrelationID(c.Request.Context(), correlationID)
		c.Request = c.Request.WithContext(ctx)

		// Create contextual logger
		logger := telemetry.LogFromContext(ctx)

		// Prepare request fields
		requestFields := logrus.Fields{
			"method":     c.Request.Method,
			"path":       c.Request.URL.Path,
			"query":      c.Request.URL.RawQuery,
			"user_agent": c.Request.UserAgent(),
			"remote_ip":  c.ClientIP(),
			"referer":    c.Request.Referer(),
		}

		// Add headers if configured
		if config.LogHeaders {
			headers := make(map[string]string)
			for name, values := range c.Request.Header {
				// Skip sensitive headers
				if name == "Authorization" || name == "Cookie" || name == "X-Api-Key" {
					headers[name] = "[REDACTED]"
				} else if len(values) > 0 {
					headers[name] = values[0]
				}
			}
			requestFields["headers"] = headers
		}

		// Log request body if configured
		var requestBody string
		if config.LogBody && c.Request.Body != nil {
			bodyBytes, err := io.ReadAll(io.LimitReader(c.Request.Body, int64(config.MaxBodySize)))
			if err == nil {
				requestBody = string(bodyBytes)
				// Restore the body for the next handler
				c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
				requestFields["body"] = requestBody
			}
		}

		// Log incoming request
		logger.WithFields(requestFields).Info("Incoming HTTP request")

		// Create a custom response writer to capture response data
		writer := &responseWriter{
			ResponseWriter: c.Writer,
			body:           &bytes.Buffer{},
			logBody:        config.LogBody,
			maxBodySize:    config.MaxBodySize,
		}
		c.Writer = writer

		// Process request
		c.Next()

		// Calculate duration
		duration := time.Since(start)

		// Prepare response fields
		responseFields := logrus.Fields{
			"status":      c.Writer.Status(),
			"duration_ms": float64(duration.Nanoseconds()) / 1000000,
			"size":        c.Writer.Size(),
		}

		// Add response body if configured and captured
		if config.LogBody && writer.body.Len() > 0 {
			responseFields["response_body"] = writer.body.String()
		}

		// Add error information if present
		if len(c.Errors) > 0 {
			errors := make([]string, len(c.Errors))
			for i, err := range c.Errors {
				errors[i] = err.Error()
			}
			responseFields["errors"] = errors
		}

		// Combine request and response fields
		allFields := make(logrus.Fields)
		for k, v := range requestFields {
			allFields[k] = v
		}
		for k, v := range responseFields {
			allFields[k] = v
		}

		// Log response with appropriate level
		logEntry := logger.WithFields(allFields)
		switch {
		case c.Writer.Status() >= 500:
			logEntry.Error("HTTP request completed with server error")
		case c.Writer.Status() >= 400:
			logEntry.Warn("HTTP request completed with client error")
		case duration > 5*time.Second:
			logEntry.Warn("HTTP request completed (slow)")
		default:
			logEntry.Info("HTTP request completed")
		}
	}
}

// responseWriter wraps gin.ResponseWriter to capture response data
type responseWriter struct {
	gin.ResponseWriter
	body        *bytes.Buffer
	logBody     bool
	maxBodySize int
}

// Write captures the response body if logging is enabled
func (w *responseWriter) Write(data []byte) (int, error) {
	if w.logBody && w.body.Len() < w.maxBodySize {
		remaining := w.maxBodySize - w.body.Len()
		if len(data) > remaining {
			w.body.Write(data[:remaining])
		} else {
			w.body.Write(data)
		}
	}
	return w.ResponseWriter.Write(data)
}

// WriteString captures the response body if logging is enabled
func (w *responseWriter) WriteString(s string) (int, error) {
	return w.Write([]byte(s))
}
