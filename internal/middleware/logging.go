package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/google/uuid"
	"github.com/meetsmatch/meetsmatch/internal/telemetry"
)

// LogEntry represents a structured log entry
type LogEntry struct {
	Timestamp     time.Time              `json:"timestamp"`
	Level         string                 `json:"level"`
	Message       string                 `json:"message"`
	CorrelationID string                 `json:"correlation_id"`
	UserID        *int64                 `json:"user_id,omitempty"`
	ChatID        *int64                 `json:"chat_id,omitempty"`
	UpdateType    string                 `json:"update_type,omitempty"`
	Duration      *int64                 `json:"duration_ms,omitempty"`
	Error         *string                `json:"error,omitempty"`
	StackTrace    *string                `json:"stack_trace,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

// BotLoggingMiddleware provides structured logging middleware for bot handlers
type BotLoggingMiddleware struct {
	logger *StructuredLogger
}

// Logger interface for structured logging
type Logger interface {
	LogInfo(correlationID, message string, metadata map[string]interface{}, update *models.Update)
	LogWarning(correlationID, message string, metadata map[string]interface{}, update *models.Update)
	LogError(correlationID, message string, stackTrace *string, update *models.Update)
}

// StructuredLogger handles JSON structured logging
type StructuredLogger struct {
	output *os.File
}

// NewBotLoggingMiddleware creates a new logging middleware with structured logger
func NewBotLoggingMiddleware() *BotLoggingMiddleware {
	logger := &StructuredLogger{
		output: os.Stdout,
	}
	return &BotLoggingMiddleware{
		logger: logger,
	}
}

// NewStructuredLogger creates a new structured logger
func NewStructuredLogger() *StructuredLogger {
	return &StructuredLogger{
		output: os.Stdout,
	}
}

// Middleware returns the logging middleware function with structured logging
func (m *BotLoggingMiddleware) Middleware(next bot.HandlerFunc) bot.HandlerFunc {
	return func(ctx context.Context, b *bot.Bot, update *models.Update) {
		start := time.Now()
		correlationID := uuid.New().String()

		// Add correlation ID to context
		ctx = context.WithValue(ctx, "correlation_id", correlationID)

		// Log incoming update
		m.logIncomingUpdate(update, correlationID)

		// Execute next handler with comprehensive error recovery
		defer func() {
			duration := time.Since(start).Milliseconds()

			if r := recover(); r != nil {
				// Get stack trace
				buf := make([]byte, 4096)
				n := runtime.Stack(buf, false)
				stackTrace := string(buf[:n])

				// Log panic with full context
				m.logger.LogError(correlationID, fmt.Sprintf("PANIC in bot handler: %v", r), &stackTrace, update)

				// Try to send error response to user if possible
				m.handlePanicResponse(b, update)
			} else {
				// Log successful completion
				m.logger.LogInfo(correlationID, "Request processed successfully", map[string]interface{}{
					"duration_ms": duration,
				}, update)
			}
		}()

		next(ctx, b, update)
	}
}

// logIncomingUpdate logs details about incoming updates with structured format
func (m *BotLoggingMiddleware) logIncomingUpdate(update *models.Update, correlationID string) {
	if update.Message != nil {
		msg := update.Message
		metadata := map[string]interface{}{
			"message_text": msg.Text,
			"message_type": "text",
		}
		if msg.From != nil {
			metadata["username"] = msg.From.Username
		}
		m.logger.LogInfo(correlationID, "Incoming message", metadata, update)
	} else if update.CallbackQuery != nil {
		cb := update.CallbackQuery
		metadata := map[string]interface{}{
			"callback_data": cb.Data,
			"username":      cb.From.Username,
		}
		m.logger.LogInfo(correlationID, "Incoming callback query", metadata, update)
	} else if update.InlineQuery != nil {
		iq := update.InlineQuery
		metadata := map[string]interface{}{
			"query":    iq.Query,
			"username": iq.From.Username,
		}
		m.logger.LogInfo(correlationID, "Incoming inline query", metadata, update)
	} else {
		m.logger.LogWarning(correlationID, "Received update of unknown type", map[string]interface{}{}, update)
	}
}

// handlePanicResponse attempts to send an error message to the user after a panic
func (m *BotLoggingMiddleware) handlePanicResponse(b *bot.Bot, update *models.Update) {
	defer func() {
		// Prevent panic in panic handler
		if r := recover(); r != nil {
			logger := telemetry.GetContextualLogger(context.Background())
			logger.WithFields(map[string]interface{}{
				"operation": "handle_panic_response",
				"service":   "logging_middleware",
				"panic":     fmt.Sprintf("%v", r),
			}).Error("Failed to send panic response")
		}
	}()

	var chatID int64
	if update.Message != nil {
		chatID = update.Message.Chat.ID
	} else if update.CallbackQuery != nil {
		// Handle MaybeInaccessibleMessage
		if update.CallbackQuery.Message.Message != nil {
			chatID = update.CallbackQuery.Message.Message.Chat.ID
		}
	} else {
		return // Can't determine chat ID
	}

	if chatID == 0 {
		return // Can't determine chat ID
	}

	// Send generic error message
	b.SendMessage(context.Background(), &bot.SendMessageParams{
		ChatID: chatID,
		Text:   "Sorry, something went wrong. Please try again later.",
	})
}

// LogInfo logs an info level message
func (sl *StructuredLogger) LogInfo(correlationID, message string, metadata map[string]interface{}, update *models.Update) {
	sl.log("INFO", correlationID, message, nil, nil, metadata, update)
}

// LogWarning logs a warning level message
func (sl *StructuredLogger) LogWarning(correlationID, message string, metadata map[string]interface{}, update *models.Update) {
	sl.log("WARNING", correlationID, message, nil, nil, metadata, update)
}

// LogError logs an error level message
func (sl *StructuredLogger) LogError(correlationID, message string, stackTrace *string, update *models.Update) {
	sl.log("ERROR", correlationID, message, nil, stackTrace, nil, update)
}

// log writes a structured log entry
func (sl *StructuredLogger) log(level, correlationID, message string, errorMsg, stackTrace *string, metadata map[string]interface{}, update *models.Update) {
	// Check if logger is properly initialized
	if sl == nil || sl.output == nil {
		// Fallback to telemetry logging if logger is not initialized
		logger := telemetry.GetContextualLogger(context.Background())
		logger.WithFields(map[string]interface{}{
			"correlation_id": correlationID,
			"service":        "logging_middleware",
			"level":          level,
		}).Info(message)
		return
	}

	entry := LogEntry{
		Timestamp:     time.Now().UTC(),
		Level:         level,
		Message:       message,
		CorrelationID: correlationID,
		Error:         errorMsg,
		StackTrace:    stackTrace,
		Metadata:      metadata,
	}

	// Extract user and chat info from update
	if update != nil {
		if update.Message != nil {
			if update.Message.From != nil {
				entry.UserID = &update.Message.From.ID
			}
			entry.ChatID = &update.Message.Chat.ID
			entry.UpdateType = "message"
		} else if update.CallbackQuery != nil {
			entry.UserID = &update.CallbackQuery.From.ID
			// Handle MaybeInaccessibleMessage
			if update.CallbackQuery.Message.Message != nil {
				entry.ChatID = &update.CallbackQuery.Message.Message.Chat.ID
			}
			entry.UpdateType = "callback_query"
		} else if update.InlineQuery != nil {
			entry.UserID = &update.InlineQuery.From.ID
			entry.UpdateType = "inline_query"
		}
	}

	// Marshal to JSON and write
	jsonData, err := json.Marshal(entry)
	if err != nil {
		// Fallback to telemetry logging if JSON marshaling fails
		logger := telemetry.GetContextualLogger(context.Background())
		logger.WithFields(map[string]interface{}{
			"correlation_id": correlationID,
			"service":        "logging_middleware",
			"level":          level,
		}).WithError(err).Error("Failed to marshal log entry")
		logger.WithFields(map[string]interface{}{
			"correlation_id": correlationID,
			"service":        "logging_middleware",
			"level":          level,
		}).Info(message)
		return
	}

	fmt.Fprintln(sl.output, string(jsonData))
}

// GetCorrelationID extracts correlation ID from context
func GetCorrelationID(ctx context.Context) string {
	if id, ok := ctx.Value("correlation_id").(string); ok {
		return id
	}
	return "unknown"
}
