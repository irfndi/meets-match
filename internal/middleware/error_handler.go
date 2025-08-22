package middleware

import (
	"context"
	"fmt"
	"runtime/debug"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/meetsmatch/meetsmatch/internal/errors"
	"github.com/meetsmatch/meetsmatch/internal/telemetry"
)

// ErrorHandlerMiddleware provides centralized error handling for bot operations
type ErrorHandlerMiddleware struct {
	logger Logger
}

// NewErrorHandlerMiddleware creates a new error handler middleware
func NewErrorHandlerMiddleware(logger Logger) *ErrorHandlerMiddleware {
	return &ErrorHandlerMiddleware{
		logger: logger,
	}
}

// Middleware returns the error handling middleware function
func (m *ErrorHandlerMiddleware) Middleware(next bot.HandlerFunc) bot.HandlerFunc {
	return func(ctx context.Context, b *bot.Bot, update *models.Update) {
		defer func() {
			if r := recover(); r != nil {
				// Handle panics as internal errors with stack trace
				ctx = telemetry.WithCorrelationID(ctx, telemetry.NewCorrelationID())
				correlationID := GetCorrelationID(ctx)
				stackTrace := string(debug.Stack())

				logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
					"operation":   "error_handler_panic",
					"panic_value": fmt.Sprintf("%v", r),
					"stack_trace": stackTrace,
					"service":     "middleware",
				})

				logger.Error("Panic recovered in bot handler")

				err := errors.NewInternalError(fmt.Sprintf("Panic in handler: %v", r), nil).
					WithCorrelationID(correlationID)

				m.handleError(ctx, b, update, err)
			}
		}()

		next(ctx, b, update)
	}
}

// HandleError provides a centralized way to handle errors in bot handlers
func (m *ErrorHandlerMiddleware) HandleError(ctx context.Context, b *bot.Bot, update *models.Update, err error) {
	m.handleError(ctx, b, update, err)
}

// handleError processes and responds to errors
func (m *ErrorHandlerMiddleware) handleError(ctx context.Context, b *bot.Bot, update *models.Update, err error) {
	correlationID := GetCorrelationID(ctx)

	// Convert to AppError if it's not already
	var appErr *errors.AppError
	if ae, ok := err.(*errors.AppError); ok {
		appErr = ae
		if appErr.CorrelationID == "" {
			appErr = appErr.WithCorrelationID(correlationID)
		}
	} else {
		// Wrap unknown errors as internal errors
		appErr = errors.NewInternalError("An unexpected error occurred", err).
			WithCorrelationID(correlationID)
	}

	// Log the error
	m.logError(appErr, update)

	// Send user-friendly response
	m.sendErrorResponse(b, update, appErr)
}

// logError logs the error with appropriate level based on error type
func (m *ErrorHandlerMiddleware) logError(appErr *errors.AppError, update *models.Update) {
	ctx := context.Background()
	if appErr.CorrelationID != "" {
		ctx = telemetry.WithCorrelationID(ctx, telemetry.NewCorrelationID())
	}

	logger := telemetry.GetContextualLogger(ctx).WithFields(map[string]interface{}{
		"operation":  "error_handler_log",
		"error_type": string(appErr.Type),
		"error_code": appErr.Code,
		"service":    "middleware",
	})

	// Add user context if available
	if update != nil {
		if update.Message != nil {
			logger = logger.WithFields(map[string]interface{}{
				"user_id":      update.Message.From.ID,
				"chat_id":      update.Message.Chat.ID,
				"message_type": "message",
			})
		} else if update.CallbackQuery != nil {
			logger = logger.WithFields(map[string]interface{}{
				"user_id":      update.CallbackQuery.From.ID,
				"message_type": "callback_query",
			})
		}
	}

	// Add error metadata if present
	for k, v := range appErr.Metadata {
		logger = logger.WithField(k, v)
	}

	// Add stack trace for serious errors
	if appErr.Cause != nil {
		logger = logger.WithField("cause", appErr.Cause.Error())
	}

	// Add details if present
	if appErr.Details != "" {
		logger = logger.WithField("details", appErr.Details)
	}

	// Log with appropriate level based on error type
	switch appErr.Type {
	case errors.ErrorTypeValidation, errors.ErrorTypeAuthentication, errors.ErrorTypeAuthorization:
		logger.Warn(appErr.Message)
	case errors.ErrorTypeNotFound, errors.ErrorTypeConflict:
		logger.Info(appErr.Message)
	case errors.ErrorTypeRateLimit:
		logger.Warn(appErr.Message)
	default:
		// Log as error for internal, database, external, etc.
		logger.Error(appErr.Message)
	}
}

// sendErrorResponse sends an appropriate error message to the user
func (m *ErrorHandlerMiddleware) sendErrorResponse(b *bot.Bot, update *models.Update, appErr *errors.AppError) {
	chatID := m.getChatID(update)
	if chatID == 0 {
		return // Can't send response without chat ID
	}

	// Check if bot is nil or not properly initialized (for testing scenarios)
	if b == nil {
		return
	}

	message := m.getUserFriendlyMessage(appErr)

	// Send the error message with comprehensive error handling
	defer func() {
		if r := recover(); r != nil {
			// Log panic but don't propagate it
			m.logger.LogError(appErr.CorrelationID, "Panic while sending error response to user", nil, update)
		}
	}()

	// Try to send message, but catch any panics that might occur
	func() {
		defer func() {
			if r := recover(); r != nil {
				// Bot is not properly initialized, just log and return
				m.logger.LogError(appErr.CorrelationID, "Bot not properly initialized for sending messages", nil, update)
			}
		}()

		_, err := b.SendMessage(context.Background(), &bot.SendMessageParams{
			ChatID: chatID,
			Text:   message,
		})

		if err != nil {
			// Log failure to send error message, but don't create infinite loop
			m.logger.LogError(appErr.CorrelationID, "Failed to send error response to user", nil, update)
		}
	}()
}

// getChatID extracts chat ID from update
func (m *ErrorHandlerMiddleware) getChatID(update *models.Update) int64 {
	if update.Message != nil {
		return update.Message.Chat.ID
	}
	if update.CallbackQuery != nil {
		// Handle MaybeInaccessibleMessage
		if update.CallbackQuery.Message.Message != nil {
			return update.CallbackQuery.Message.Message.Chat.ID
		}
	}
	return 0
}

// getUserFriendlyMessage converts technical errors to user-friendly messages
func (m *ErrorHandlerMiddleware) getUserFriendlyMessage(appErr *errors.AppError) string {
	switch appErr.Type {
	case errors.ErrorTypeValidation:
		return fmt.Sprintf("❌ Invalid input: %s", appErr.Message)
	case errors.ErrorTypeAuthentication:
		return "🔐 Please log in first to use this feature."
	case errors.ErrorTypeAuthorization:
		return "🚫 You don't have permission to perform this action."
	case errors.ErrorTypeNotFound:
		return "❓ The requested item was not found."
	case errors.ErrorTypeConflict:
		return "⚠️ This action conflicts with existing data. Please try again."
	case errors.ErrorTypeRateLimit:
		return "⏰ You're sending requests too quickly. Please wait a moment and try again."
	case errors.ErrorTypeTimeout:
		return "⏱️ The request timed out. Please try again."
	case errors.ErrorTypeExternal:
		return "🌐 External service is temporarily unavailable. Please try again later."
	case errors.ErrorTypeDatabase:
		return "💾 Database error occurred. Please try again later."
	case errors.ErrorTypeCache:
		return "🗄️ Cache error occurred. Please try again."
	case errors.ErrorTypeTelegram:
		return "📱 Telegram API error occurred. Please try again."
	default:
		return "❌ Something went wrong. Please try again later."
	}
}

// ErrorHandler is a helper function for handlers to easily report errors
func ErrorHandler(ctx context.Context, b *bot.Bot, update *models.Update, err error) {
	if err == nil {
		return
	}

	// Try to get error handler from context or create a new one
	logger := NewStructuredLogger()
	errorHandler := NewErrorHandlerMiddleware(logger)
	errorHandler.HandleError(ctx, b, update, err)
}

// WrapHandler wraps a handler function with error handling
func WrapHandler(handler func(ctx context.Context, b *bot.Bot, update *models.Update) error) bot.HandlerFunc {
	return func(ctx context.Context, b *bot.Bot, update *models.Update) {
		if err := handler(ctx, b, update); err != nil {
			ErrorHandler(ctx, b, update, err)
		}
	}
}
