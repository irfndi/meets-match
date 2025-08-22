package telemetry

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
	"go.opentelemetry.io/otel/trace"
	"gopkg.in/natefinch/lumberjack.v2"
)

// LogLevel represents the logging level
type LogLevel string

const (
	DebugLevel LogLevel = "debug"
	InfoLevel  LogLevel = "info"
	WarnLevel  LogLevel = "warn"
	ErrorLevel LogLevel = "error"
)

// LogConfig holds the logging configuration
type LogConfig struct {
	Level      LogLevel `json:"level"`
	Format     string   `json:"format"` // "json" or "text"
	Output     string   `json:"output"` // "stdout", "stderr", or file path
	Rotation   bool     `json:"rotation"`
	MaxSize    int      `json:"max_size"` // MB
	MaxBackups int      `json:"max_backups"`
	MaxAge     int      `json:"max_age"` // days
	Compress   bool     `json:"compress"`
}

// DefaultLogConfig returns the default logging configuration
func DefaultLogConfig() *LogConfig {
	return &LogConfig{
		Level:      InfoLevel,
		Format:     "json",
		Output:     "stdout",
		Rotation:   false,
		MaxSize:    100,
		MaxBackups: 3,
		MaxAge:     28,
		Compress:   true,
	}
}

// Logger wraps logrus with additional functionality
type Logger struct {
	*logrus.Logger
	config *LogConfig
}

// NewLogger creates a new logger instance
func NewLogger(config *LogConfig) (*Logger, error) {
	if config == nil {
		config = DefaultLogConfig()
	}

	logger := logrus.New()

	// Set log level
	switch config.Level {
	case DebugLevel:
		logger.SetLevel(logrus.DebugLevel)
	case InfoLevel:
		logger.SetLevel(logrus.InfoLevel)
	case WarnLevel:
		logger.SetLevel(logrus.WarnLevel)
	case ErrorLevel:
		logger.SetLevel(logrus.ErrorLevel)
	default:
		logger.SetLevel(logrus.InfoLevel)
	}

	// Set formatter
	if config.Format == "json" {
		logger.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat: time.RFC3339,
			FieldMap: logrus.FieldMap{
				logrus.FieldKeyTime:  "timestamp",
				logrus.FieldKeyLevel: "level",
				logrus.FieldKeyMsg:   "message",
				logrus.FieldKeyFunc:  "function",
				logrus.FieldKeyFile:  "file",
			},
		})
	} else {
		logger.SetFormatter(&logrus.TextFormatter{
			TimestampFormat: time.RFC3339,
			FullTimestamp:   true,
		})
	}

	// Set output
	var output io.Writer
	switch config.Output {
	case "stdout":
		output = os.Stdout
	case "stderr":
		output = os.Stderr
	default:
		// File output with optional rotation
		if config.Rotation {
			output = &lumberjack.Logger{
				Filename:   config.Output,
				MaxSize:    config.MaxSize,
				MaxBackups: config.MaxBackups,
				MaxAge:     config.MaxAge,
				Compress:   config.Compress,
			}
		} else {
			file, err := os.OpenFile(config.Output, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
			if err != nil {
				return nil, fmt.Errorf("failed to open log file: %w", err)
			}
			output = file
		}
	}

	logger.SetOutput(output)

	// Enable caller reporting for file and function info
	logger.SetReportCaller(true)

	return &Logger{
		Logger: logger,
		config: config,
	}, nil
}

// ContextualLogger provides context-aware logging
type ContextualLogger struct {
	*Logger
	fields logrus.Fields
}

// WithContext creates a new logger with context information
func (l *Logger) WithContext(ctx context.Context) *ContextualLogger {
	fields := logrus.Fields{}

	// Add correlation ID if present
	if correlationID := GetCorrelationID(ctx); correlationID != "" {
		fields["correlation_id"] = correlationID
	}

	// Add trace information if present
	span := trace.SpanFromContext(ctx)
	if span.SpanContext().IsValid() {
		fields["trace_id"] = span.SpanContext().TraceID().String()
		fields["span_id"] = span.SpanContext().SpanID().String()
	}

	return &ContextualLogger{
		Logger: l,
		fields: fields,
	}
}

// WithFields adds additional fields to the logger
func (cl *ContextualLogger) WithFields(fields logrus.Fields) *ContextualLogger {
	combined := make(logrus.Fields)
	for k, v := range cl.fields {
		combined[k] = v
	}
	for k, v := range fields {
		combined[k] = v
	}

	return &ContextualLogger{
		Logger: cl.Logger,
		fields: combined,
	}
}

// WithField adds a single field to the logger
func (cl *ContextualLogger) WithField(key string, value interface{}) *ContextualLogger {
	return cl.WithFields(logrus.Fields{key: value})
}

// Debug logs a debug message
func (cl *ContextualLogger) Debug(args ...interface{}) {
	cl.Logger.WithFields(cl.fields).Debug(args...)
}

// Debugf logs a formatted debug message
func (cl *ContextualLogger) Debugf(format string, args ...interface{}) {
	cl.Logger.WithFields(cl.fields).Debugf(format, args...)
}

// Info logs an info message
func (cl *ContextualLogger) Info(args ...interface{}) {
	cl.Logger.WithFields(cl.fields).Info(args...)
}

// Infof logs a formatted info message
func (cl *ContextualLogger) Infof(format string, args ...interface{}) {
	cl.Logger.WithFields(cl.fields).Infof(format, args...)
}

// Warn logs a warning message
func (cl *ContextualLogger) Warn(args ...interface{}) {
	cl.Logger.WithFields(cl.fields).Warn(args...)
}

// Warnf logs a formatted warning message
func (cl *ContextualLogger) Warnf(format string, args ...interface{}) {
	cl.Logger.WithFields(cl.fields).Warnf(format, args...)
}

// Error logs an error message
func (cl *ContextualLogger) Error(args ...interface{}) {
	cl.Logger.WithFields(cl.fields).Error(args...)
}

// Errorf logs a formatted error message
func (cl *ContextualLogger) Errorf(format string, args ...interface{}) {
	cl.Logger.WithFields(cl.fields).Errorf(format, args...)
}

// ErrorWithStack logs an error with stack trace
func (cl *ContextualLogger) ErrorWithStack(err error) {
	fields := make(logrus.Fields)
	for k, v := range cl.fields {
		fields[k] = v
	}

	// Add stack trace
	stack := make([]string, 0)
	for i := 1; i < 10; i++ {
		_, file, line, ok := runtime.Caller(i)
		if !ok {
			break
		}
		stack = append(stack, fmt.Sprintf("%s:%d", filepath.Base(file), line))
	}
	fields["stack_trace"] = strings.Join(stack, " -> ")

	cl.Logger.WithFields(fields).Error(err)
}

// Correlation ID context key
type correlationIDKey struct{}

// WithCorrelationID adds a correlation ID to the context
func WithCorrelationID(ctx context.Context, correlationID string) context.Context {
	if correlationID == "" {
		correlationID = uuid.New().String()
	}
	return context.WithValue(ctx, correlationIDKey{}, correlationID)
}

// GetCorrelationID retrieves the correlation ID from the context
func GetCorrelationID(ctx context.Context) string {
	if correlationID, ok := ctx.Value(correlationIDKey{}).(string); ok {
		return correlationID
	}
	return ""
}

// NewCorrelationID generates a new correlation ID
func NewCorrelationID() string {
	return uuid.New().String()
}

// Global logger instance
var globalLogger *Logger

// InitGlobalLogger initializes the global logger
func InitGlobalLogger(config *LogConfig) error {
	logger, err := NewLogger(config)
	if err != nil {
		return err
	}
	globalLogger = logger
	return nil
}

// GetGlobalLogger returns the global logger instance
func GetGlobalLogger() *Logger {
	if globalLogger == nil {
		// Initialize with default config if not set
		logger, _ := NewLogger(DefaultLogConfig())
		globalLogger = logger
	}
	return globalLogger
}

// LogFromContext creates a contextual logger from context
func LogFromContext(ctx context.Context) *ContextualLogger {
	return GetGlobalLogger().WithContext(ctx)
}

// GetContextualLogger is an alias for LogFromContext for backward compatibility
func GetContextualLogger(ctx context.Context) *ContextualLogger {
	return LogFromContext(ctx)
}
