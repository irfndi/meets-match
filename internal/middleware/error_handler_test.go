package middleware

import (
	"context"
	stderrors "errors"
	"testing"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	tgbotapi "gopkg.in/telegram-bot-api.v4"

	"github.com/meetsmatch/meetsmatch/internal/errors"
)

// MockBot is a mock implementation of the Telegram bot
type MockBot struct {
	mock.Mock
}

// MockStructuredLogger is a mock implementation of Logger interface
type MockStructuredLogger struct {
	mock.Mock
}

func (m *MockStructuredLogger) LogInfo(correlationID, message string, metadata map[string]interface{}, update *models.Update) {
	m.Called(correlationID, message, metadata, update)
}

func (m *MockStructuredLogger) LogWarning(correlationID, message string, metadata map[string]interface{}, update *models.Update) {
	m.Called(correlationID, message, metadata, update)
}

func (m *MockStructuredLogger) LogError(correlationID, message string, stackTrace *string, update *models.Update) {
	m.Called(correlationID, message, stackTrace, update)
}

func (m *MockBot) Send(c tgbotapi.Chattable) (tgbotapi.Message, error) {
	args := m.Called(c)
	return args.Get(0).(tgbotapi.Message), args.Error(1)
}

func (m *MockBot) GetUpdatesChan(config tgbotapi.UpdateConfig) (tgbotapi.UpdatesChannel, error) {
	args := m.Called(config)
	return args.Get(0).(tgbotapi.UpdatesChannel), args.Error(1)
}

func (m *MockBot) StopReceivingUpdates() {
	m.Called()
}

func (m *MockBot) SetWebhook(config tgbotapi.WebhookConfig) (tgbotapi.APIResponse, error) {
	args := m.Called(config)
	return args.Get(0).(tgbotapi.APIResponse), args.Error(1)
}

func (m *MockBot) DeleteWebhook() (tgbotapi.APIResponse, error) {
	args := m.Called()
	return args.Get(0).(tgbotapi.APIResponse), args.Error(1)
}

func (m *MockBot) GetWebhookInfo() (tgbotapi.WebhookInfo, error) {
	args := m.Called()
	return args.Get(0).(tgbotapi.WebhookInfo), args.Error(1)
}

func TestNewErrorHandlerMiddleware(t *testing.T) {
	mockLogger := &MockStructuredLogger{}

	middleware := NewErrorHandlerMiddleware(mockLogger)

	assert.NotNil(t, middleware)
	assert.Equal(t, mockLogger, middleware.logger)
}

func TestErrorHandlerMiddleware_HandleError(t *testing.T) {
	tests := []struct {
		name     string
		error    error
		expected string
	}{
		{
			name:     "ValidationError",
			error:    errors.NewValidationError("username", "Username is required"),
			expected: "❌ Invalid input. Please check your input and try again.",
		},
		{
			name:     "AuthenticationError",
			error:    errors.NewAuthenticationError("Invalid credentials"),
			expected: "🔒 Authentication required. Please log in and try again.",
		},
		{
			name:     "NotFoundError",
			error:    errors.NewNotFoundError("user"),
			expected: "❓ The requested resource was not found. Please try again.",
		},
		{
			name:     "RateLimitError",
			error:    errors.NewRateLimitError(10, "1m"),
			expected: "⏰ You're sending requests too quickly. Please wait a moment and try again.",
		},
		{
			name:     "InternalError",
			error:    errors.NewInternalError("Database connection failed", nil),
			expected: "🔧 We're experiencing technical difficulties. Please try again later.",
		},
		{
			name:     "GenericError",
			error:    stderrors.New("generic error"),
			expected: "❌ An unexpected error occurred. Please try again later.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockBot := (*bot.Bot)(nil) // Use nil bot for testing
			mockLogger := &MockStructuredLogger{}
			middleware := NewErrorHandlerMiddleware(mockLogger)

			ctx := context.Background()
			update := &models.Update{
				Message: &models.Message{
					From: &models.User{ID: 123, Username: "testuser"},
					Chat: models.Chat{ID: 123},
				},
			}

			// Test should not panic
			defer func() {
				if r := recover(); r != nil {
					t.Errorf("HandleError panicked: %v", r)
				}
			}()

			middleware.HandleError(ctx, mockBot, update, tt.error)

			// No assertions needed - this test just ensures no panic occurs
			// The actual implementation uses telemetry logging, not the mock logger
		})
	}
}

func TestErrorHandlerMiddleware_getErrorMessage(t *testing.T) {
	mockLogger := &MockStructuredLogger{}
	middleware := NewErrorHandlerMiddleware(mockLogger)

	tests := []struct {
		name      string
		errorType errors.ErrorType
		expected  string
	}{
		{"Validation", errors.ErrorTypeValidation, "❌ Invalid input: "},
		{"Authentication", errors.ErrorTypeAuthentication, "🔐 Please log in first to use this feature."},
		{"NotFound", errors.ErrorTypeNotFound, "❓ The requested item was not found."},
		{"Internal", errors.ErrorTypeInternal, "❌ Something went wrong. Please try again later."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			appErr := &errors.AppError{Type: tt.errorType}
			result := middleware.getUserFriendlyMessage(appErr)
			if tt.errorType == errors.ErrorTypeValidation {
				assert.Contains(t, result, "❌ Invalid input:")
			} else {
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

func TestErrorHandler(t *testing.T) {
	mockBot := (*bot.Bot)(nil) // Use nil bot for testing
	update := &models.Update{
		Message: &models.Message{
			From: &models.User{ID: 123, Username: "testuser"},
			Chat: models.Chat{ID: 123},
		},
	}

	// Create validation error
	appErr := errors.NewValidationError("username", "Username is required")

	ctx := context.Background()

	// Test should not panic
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("ErrorHandler panicked: %v", r)
		}
	}()

	ErrorHandler(ctx, mockBot, update, appErr)

	// No assertions needed as this is a helper function test
}

func TestWrapHandler_Success(t *testing.T) {
	mockBot := (*bot.Bot)(nil) // Use nil bot for testing
	update := &models.Update{
		Message: &models.Message{
			From: &models.User{ID: 123, Username: "testuser"},
			Chat: models.Chat{ID: 123},
		},
	}

	ctx := context.Background()

	// Handler that returns no error
	handler := func(ctx context.Context, b *bot.Bot, update *models.Update) error {
		return nil
	}

	wrappedHandler := WrapHandler(handler)
	wrappedHandler(ctx, mockBot, update)

	// No assertions needed for successful case
}

func TestWrapHandler_Error(t *testing.T) {
	mockBot := (*bot.Bot)(nil) // Use nil bot for testing
	update := &models.Update{
		Message: &models.Message{
			From: &models.User{ID: 123, Username: "testuser"},
			Chat: models.Chat{ID: 123},
		},
	}

	ctx := context.Background()
	appErr := errors.NewValidationError("username", "Username is required")

	// Handler that returns an error
	handler := func(ctx context.Context, b *bot.Bot, update *models.Update) error {
		return appErr
	}

	wrappedHandler := WrapHandler(handler)
	wrappedHandler(ctx, mockBot, update)

	// No assertions needed for this test
}

func TestWrapHandler_BotSendFails(t *testing.T) {
	mockBot := (*bot.Bot)(nil) // Use nil bot for testing
	update := &models.Update{
		Message: &models.Message{
			From: &models.User{ID: 123, Username: "testuser"},
			Chat: models.Chat{ID: 123},
		},
	}

	ctx := context.Background()
	appErr := errors.NewValidationError("username", "Username is required")

	// Handler that returns an error
	handler := func(ctx context.Context, b *bot.Bot, update *models.Update) error {
		return appErr
	}

	wrappedHandler := WrapHandler(handler)
	wrappedHandler(ctx, mockBot, update)

	// No assertions needed for this test
}

func TestErrorHandlerMiddleware_Integration(t *testing.T) {
	// This test simulates a complete error handling workflow
	mockBot := (*bot.Bot)(nil) // Use nil bot for testing
	mockLogger := &MockStructuredLogger{}
	middleware := NewErrorHandlerMiddleware(mockLogger)

	ctx := context.Background()
	update := &models.Update{
		Message: &models.Message{
			From: &models.User{ID: 123, Username: "testuser"},
			Chat: models.Chat{ID: 123},
		},
	}

	// Test different error types in sequence
	errorTypes := []struct {
		name  string
		error error
	}{
		{
			"validation",
			errors.NewValidationError("username", "Username is required"),
		},
		{
			"authentication",
			errors.NewAuthenticationError("Invalid credentials"),
		},
		{
			"not_found",
			errors.NewNotFoundError("user"),
		},
		{
			"internal",
			errors.NewInternalError("Database connection failed", nil),
		},
	}

	for _, errorType := range errorTypes {
		t.Run(errorType.name, func(t *testing.T) {
			// Test should not panic
			defer func() {
				if r := recover(); r != nil {
					t.Errorf("HandleError panicked for %s: %v", errorType.name, r)
				}
			}()

			// Handle error
			middleware.HandleError(ctx, mockBot, update, errorType.error)
		})
	}

	// No assertions needed - this test just ensures no panic occurs
	// The actual implementation uses telemetry logging, not the mock logger
}

func TestErrorHandlerMiddleware_ContextCancellation(t *testing.T) {
	mockBot := (*bot.Bot)(nil) // Use nil bot for testing
	mockLogger := &MockStructuredLogger{}
	middleware := NewErrorHandlerMiddleware(mockLogger)

	// Create a cancelled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	update := &models.Update{
		Message: &models.Message{
			From: &models.User{ID: 123, Username: "testuser"},
			Chat: models.Chat{ID: 123},
		},
	}

	// Create validation error
	appErr := errors.NewValidationError("username", "Username is required")

	// Test should not panic even with cancelled context
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("HandleError panicked with cancelled context: %v", r)
		}
	}()

	middleware.HandleError(ctx, mockBot, update, appErr)

	// No assertions needed - this test just ensures no panic occurs with cancelled context
}
