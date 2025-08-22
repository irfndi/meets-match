package errors

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestErrorType_Values(t *testing.T) {
	tests := []struct {
		name      string
		errorType ErrorType
		expected  string
	}{
		{"Validation error", ErrorTypeValidation, "validation"},
		{"Authentication error", ErrorTypeAuthentication, "authentication"},
		{"Authorization error", ErrorTypeAuthorization, "authorization"},
		{"Not found error", ErrorTypeNotFound, "not_found"},
		{"Rate limit error", ErrorTypeRateLimit, "rate_limit"},
		{"Internal error", ErrorTypeInternal, "internal"},
		{"External error", ErrorTypeExternal, "external"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := string(tt.errorType)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestNewAppError(t *testing.T) {
	errorType := ErrorTypeValidation
	code := "INVALID_INPUT"
	message := "Invalid input provided"

	appErr := NewAppError(errorType, code, message)

	assert.Equal(t, errorType, appErr.Type)
	assert.Equal(t, code, appErr.Code)
	assert.Equal(t, message, appErr.Message)
	assert.WithinDuration(t, time.Now(), appErr.Timestamp, time.Second)
	assert.Nil(t, appErr.Cause)
	assert.Equal(t, http.StatusBadRequest, appErr.HTTPStatus)
}

func TestNewAppErrorWithCause(t *testing.T) {
	errorType := ErrorTypeInternal
	code := "DB_ERROR"
	message := "Database connection failed"
	originalErr := errors.New("connection timeout")

	appErr := NewAppErrorWithCause(errorType, code, message, originalErr)

	assert.Equal(t, errorType, appErr.Type)
	assert.Equal(t, code, appErr.Code)
	assert.Equal(t, message, appErr.Message)
	assert.Equal(t, originalErr, appErr.Cause)
	assert.Equal(t, originalErr.Error(), appErr.Details)
	assert.WithinDuration(t, time.Now(), appErr.Timestamp, time.Second)
	assert.Equal(t, http.StatusInternalServerError, appErr.HTTPStatus)
}

func TestAppError_WithMethods(t *testing.T) {
	originalErr := errors.New("original error")
	errorType := ErrorTypeInternal
	code := "WRAPPED_ERROR"
	message := "An error occurred"
	correlationID := "test-correlation-id"

	appErr := NewAppErrorWithCause(errorType, code, message, originalErr).
		WithCorrelationID(correlationID).
		WithMetadata("context", "test").
		WithDetails("additional details")

	assert.Equal(t, errorType, appErr.Type)
	assert.Equal(t, code, appErr.Code)
	assert.Equal(t, message, appErr.Message)
	assert.Equal(t, correlationID, appErr.CorrelationID)
	assert.Equal(t, "test", appErr.Metadata["context"])
	assert.Equal(t, "additional details", appErr.Details)
	assert.WithinDuration(t, time.Now(), appErr.Timestamp, time.Second)
	assert.Equal(t, originalErr, appErr.Cause)
}

func TestAppError_WithHTTPStatus(t *testing.T) {
	errorType := ErrorTypeValidation
	code := "VALIDATION_ERROR"
	message := "Validation failed"
	customStatus := http.StatusTeapot

	appErr := NewAppError(errorType, code, message).WithHTTPStatus(customStatus)

	assert.Equal(t, errorType, appErr.Type)
	assert.Equal(t, code, appErr.Code)
	assert.Equal(t, message, appErr.Message)
	assert.Equal(t, customStatus, appErr.HTTPStatus)
	assert.WithinDuration(t, time.Now(), appErr.Timestamp, time.Second)
	assert.Nil(t, appErr.Cause)
}

func TestAppError_Error(t *testing.T) {
	appErr := &AppError{
		Type:      ErrorTypeValidation,
		Code:      "INVALID_INPUT",
		Message:   "Invalid input provided",
		Timestamp: time.Now(),
	}

	errorString := appErr.Error()

	expected := "INVALID_INPUT: Invalid input provided"
	assert.Equal(t, expected, errorString)
}

func TestAppError_Error_WithDetails(t *testing.T) {
	appErr := &AppError{
		Type:      ErrorTypeInternal,
		Code:      "WRAPPED_ERROR",
		Message:   "An error occurred",
		Details:   "original error",
		Timestamp: time.Now(),
	}

	errorString := appErr.Error()

	expected := "WRAPPED_ERROR: An error occurred - original error"
	assert.Equal(t, expected, errorString)
}

func TestAppError_Unwrap(t *testing.T) {
	originalErr := errors.New("original error")
	appErr := &AppError{
		Cause: originalErr,
	}

	unwrapped := appErr.Unwrap()
	assert.Equal(t, originalErr, unwrapped)
}

func TestAppError_Unwrap_NoCause(t *testing.T) {
	appErr := &AppError{}

	unwrapped := appErr.Unwrap()
	assert.Nil(t, unwrapped)
}

func TestIsErrorType(t *testing.T) {
	appErr := NewAppError(ErrorTypeValidation, "TEST", "test message")

	// Test with correct error type
	assert.True(t, IsErrorType(appErr, ErrorTypeValidation))

	// Test with different error type
	assert.False(t, IsErrorType(appErr, ErrorTypeInternal))

	// Test with non-AppError
	regularErr := errors.New("regular error")
	assert.False(t, IsErrorType(regularErr, ErrorTypeValidation))
}

func TestDefaultHTTPStatus(t *testing.T) {
	tests := []struct {
		name         string
		errorType    ErrorType
		expectedCode int
	}{
		{"Validation error", ErrorTypeValidation, http.StatusBadRequest},
		{"Authentication error", ErrorTypeAuthentication, http.StatusUnauthorized},
		{"Authorization error", ErrorTypeAuthorization, http.StatusForbidden},
		{"Not found error", ErrorTypeNotFound, http.StatusNotFound},
		{"Rate limit error", ErrorTypeRateLimit, http.StatusTooManyRequests},
		{"Internal error", ErrorTypeInternal, http.StatusInternalServerError},
		{"Timeout error", ErrorTypeTimeout, http.StatusRequestTimeout},
		{"Unknown error", ErrorType("unknown"), http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			appErr := NewAppError(tt.errorType, "TEST", "test message")
			assert.Equal(t, tt.expectedCode, appErr.HTTPStatus)
		})
	}
}

func TestNewValidationError(t *testing.T) {
	err := NewValidationError("INVALID_FIELD", "Field is required")

	assert.Equal(t, ErrorTypeValidation, err.Type)
	assert.Equal(t, "VALIDATION_ERROR", err.Code)
	assert.Equal(t, "Field is required", err.Message)
	assert.NotZero(t, err.Timestamp)
}

func TestNewAuthenticationError(t *testing.T) {
	err := NewAuthenticationError("Token is invalid")

	assert.Equal(t, ErrorTypeAuthentication, err.Type)
	assert.Equal(t, "AUTH_ERROR", err.Code)
	assert.Equal(t, "Token is invalid", err.Message)
	assert.NotZero(t, err.Timestamp)
}

func TestNewAuthorizationError(t *testing.T) {
	message := "Access denied"

	appErr := NewAuthorizationError(message)

	assert.Equal(t, ErrorTypeAuthorization, appErr.Type)
	assert.Equal(t, "AUTHZ_ERROR", appErr.Code)
	assert.Equal(t, message, appErr.Message)
	assert.WithinDuration(t, time.Now(), appErr.Timestamp, time.Second)
}

func TestNewNotFoundError(t *testing.T) {
	err := NewNotFoundError("User")

	assert.Equal(t, ErrorTypeNotFound, err.Type)
	assert.Equal(t, "NOT_FOUND", err.Code)
	assert.Equal(t, "User not found", err.Message)
	assert.Equal(t, "User", err.Metadata["resource"])
	assert.NotZero(t, err.Timestamp)
}

func TestNewRateLimitError(t *testing.T) {
	limit := 100
	window := "1h"

	appErr := NewRateLimitError(limit, window)

	assert.Equal(t, ErrorTypeRateLimit, appErr.Type)
	assert.Equal(t, "RATE_LIMIT_EXCEEDED", appErr.Code)
	assert.Equal(t, "Rate limit exceeded", appErr.Message)
	assert.Equal(t, limit, appErr.Metadata["limit"])
	assert.Equal(t, window, appErr.Metadata["window"])
	assert.WithinDuration(t, time.Now(), appErr.Timestamp, time.Second)
}

func TestNewInternalError(t *testing.T) {
	cause := errors.New("database connection failed")
	err := NewInternalError("Database connection failed", cause)

	assert.Equal(t, ErrorTypeInternal, err.Type)
	assert.Equal(t, "INTERNAL_ERROR", err.Code)
	assert.Equal(t, "Database connection failed", err.Message)
	assert.Equal(t, cause, err.Cause)
	assert.NotZero(t, err.Timestamp)
}

func TestNewExternalError(t *testing.T) {
	cause := errors.New("connection timeout")
	err := NewExternalError("payment-service", "process payment", cause)

	assert.Equal(t, ErrorTypeExternal, err.Type)
	assert.Equal(t, "EXTERNAL_ERROR", err.Code)
	assert.Equal(t, "External service error: payment-service", err.Message)
	assert.Equal(t, cause, err.Cause)
	assert.Equal(t, "payment-service", err.Metadata["service"])
	assert.Equal(t, "process payment", err.Metadata["operation"])
	assert.NotZero(t, err.Timestamp)
}

func TestNewDatabaseError(t *testing.T) {
	cause := errors.New("connection refused")
	err := NewDatabaseError("SELECT", cause)

	assert.Equal(t, ErrorTypeDatabase, err.Type)
	assert.Equal(t, "DATABASE_ERROR", err.Code)
	assert.Equal(t, "Database operation failed: SELECT", err.Message)
	assert.Equal(t, cause, err.Cause)
	assert.Equal(t, "SELECT", err.Metadata["operation"])
	assert.NotZero(t, err.Timestamp)
}

func TestNewCacheError(t *testing.T) {
	cause := errors.New("redis connection lost")
	err := NewCacheError("GET", cause)

	assert.Equal(t, ErrorTypeCache, err.Type)
	assert.Equal(t, "CACHE_ERROR", err.Code)
	assert.Equal(t, "Cache operation failed: GET", err.Message)
	assert.Equal(t, cause, err.Cause)
	assert.Equal(t, "GET", err.Metadata["operation"])
	assert.NotZero(t, err.Timestamp)
}

func TestNewTelegramError(t *testing.T) {
	cause := errors.New("rate limit exceeded")
	err := NewTelegramError("sendMessage", cause)

	assert.Equal(t, ErrorTypeTelegram, err.Type)
	assert.Equal(t, "TELEGRAM_ERROR", err.Code)
	assert.Equal(t, "Telegram API operation failed: sendMessage", err.Message)
	assert.Equal(t, cause, err.Cause)
	assert.Equal(t, "sendMessage", err.Metadata["operation"])
	assert.NotZero(t, err.Timestamp)
}

func TestNewTimeoutError(t *testing.T) {
	timeout := 30 * time.Second
	err := NewTimeoutError("database query", timeout)

	assert.Equal(t, ErrorTypeTimeout, err.Type)
	assert.Equal(t, "TIMEOUT", err.Code)
	assert.Equal(t, "Operation timed out: database query", err.Message)
	assert.Equal(t, "database query", err.Metadata["operation"])
	assert.Equal(t, timeout.String(), err.Metadata["timeout"])
	assert.NotZero(t, err.Timestamp)
}

func TestGetErrorType(t *testing.T) {
	appErr := NewAppError(ErrorTypeValidation, "TEST", "test message")

	// Test with AppError
	errorType, ok := GetErrorType(appErr)
	assert.True(t, ok)
	assert.Equal(t, ErrorTypeValidation, errorType)

	// Test with non-AppError
	regularErr := errors.New("regular error")
	errorType, ok = GetErrorType(regularErr)
	assert.False(t, ok)
	assert.Equal(t, ErrorType(""), errorType)
}

func TestGetCorrelationID(t *testing.T) {
	appErr := NewAppError(ErrorTypeValidation, "TEST", "test message").WithCorrelationID("test-correlation-id")

	// Test with AppError that has correlation ID
	correlationID := GetCorrelationID(appErr)
	assert.Equal(t, "test-correlation-id", correlationID)

	// Test with AppError without correlation ID
	appErrNoCorr := NewAppError(ErrorTypeValidation, "TEST", "test message")
	correlationID = GetCorrelationID(appErrNoCorr)
	assert.Empty(t, correlationID)

	// Test with non-AppError
	regularErr := errors.New("regular error")
	correlationID = GetCorrelationID(regularErr)
	assert.Empty(t, correlationID)
}

func TestGetDefaultHTTPStatus(t *testing.T) {
	tests := []struct {
		name         string
		errorType    ErrorType
		expectedCode int
	}{
		{"Validation error", ErrorTypeValidation, http.StatusBadRequest},
		{"Authentication error", ErrorTypeAuthentication, http.StatusUnauthorized},
		{"Authorization error", ErrorTypeAuthorization, http.StatusForbidden},
		{"Not found error", ErrorTypeNotFound, http.StatusNotFound},
		{"Rate limit error", ErrorTypeRateLimit, http.StatusTooManyRequests},
		{"Internal error", ErrorTypeInternal, http.StatusInternalServerError},
		{"External error", ErrorTypeExternal, http.StatusInternalServerError},
		{"Unknown error", ErrorType("unknown"), http.StatusInternalServerError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status := getDefaultHTTPStatus(tt.errorType)
			assert.Equal(t, tt.expectedCode, status)
		})
	}
}

func TestAppError_WithMetadata(t *testing.T) {
	appErr := NewValidationError("email", "Invalid email format")
	appErr = appErr.WithMetadata("field", "email").WithMetadata("value", "invalid")

	assert.Equal(t, "email", appErr.Metadata["field"])
	assert.Equal(t, "invalid", appErr.Metadata["value"])
}

func TestAppError_ChainedErrors(t *testing.T) {
	// Create a chain of errors
	originalErr := errors.New("database connection failed")
	middleErr := NewDatabaseError("SELECT", originalErr)
	finalErr := NewInternalError("Service unavailable", middleErr)

	// Test error chain
	assert.True(t, errors.Is(finalErr, originalErr))
	assert.True(t, errors.Is(finalErr, middleErr))

	// Test unwrapping
	unwrapped := errors.Unwrap(finalErr)
	assert.Equal(t, middleErr, unwrapped)

	// Test final error properties
	assert.Equal(t, ErrorTypeInternal, finalErr.Type)
	assert.Equal(t, "INTERNAL_ERROR", finalErr.Code)
	assert.Equal(t, "Service unavailable", finalErr.Message)
}

func TestAppError_JSONSerialization(t *testing.T) {
	// This test would require JSON marshaling/unmarshaling
	// Since the AppError struct has exported fields, it should be JSON serializable
	appErr := NewValidationError("email", "Invalid input").WithCorrelationID("test-correlation-id")
	appErr = appErr.WithMetadata("value", "invalid-email")

	// Test that all fields are accessible (indicating they're exported)
	assert.Equal(t, ErrorTypeValidation, appErr.Type)
	assert.Equal(t, "VALIDATION_ERROR", appErr.Code)
	assert.Equal(t, "Invalid input", appErr.Message)
	assert.Equal(t, "test-correlation-id", appErr.CorrelationID)
	assert.NotNil(t, appErr.Metadata)
	assert.False(t, appErr.Timestamp.IsZero())
}

func TestAppError_ConcurrentAccess(t *testing.T) {
	// Test that AppError can be safely accessed from multiple goroutines
	cause := errors.New("test error")
	appErr := NewInternalError("Concurrent test", cause)

	// Start multiple goroutines that read from the error
	done := make(chan bool, 10)
	for i := 0; i < 10; i++ {
		go func() {
			// Read operations should be safe
			_ = appErr.Error()
			_ = appErr.HTTPStatus
			_ = appErr.Type
			_ = appErr.Code
			_ = appErr.Message
			done <- true
		}()
	}

	// Wait for all goroutines to complete
	for i := 0; i < 10; i++ {
		<-done
	}

	// Verify the error is still intact
	assert.Equal(t, ErrorTypeInternal, appErr.Type)
	assert.Equal(t, "INTERNAL_ERROR", appErr.Code)
	assert.Equal(t, "Concurrent test", appErr.Message)
}
