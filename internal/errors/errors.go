package errors

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ErrorType represents different categories of errors
type ErrorType string

const (
	ErrorTypeValidation     ErrorType = "validation"
	ErrorTypeAuthentication ErrorType = "authentication"
	ErrorTypeAuthorization  ErrorType = "authorization"
	ErrorTypeNotFound       ErrorType = "not_found"
	ErrorTypeConflict       ErrorType = "conflict"
	ErrorTypeRateLimit      ErrorType = "rate_limit"
	ErrorTypeInternal       ErrorType = "internal"
	ErrorTypeExternal       ErrorType = "external"
	ErrorTypeTimeout        ErrorType = "timeout"
	ErrorTypeDatabase       ErrorType = "database"
	ErrorTypeCache          ErrorType = "cache"
	ErrorTypeTelegram       ErrorType = "telegram"
)

// AppError represents a structured application error
type AppError struct {
	Type          ErrorType              `json:"type"`
	Code          string                 `json:"code"`
	Message       string                 `json:"message"`
	Details       string                 `json:"details,omitempty"`
	CorrelationID string                 `json:"correlation_id,omitempty"`
	Timestamp     time.Time              `json:"timestamp"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
	Cause         error                  `json:"-"` // Original error, not serialized
	HTTPStatus    int                    `json:"-"` // HTTP status code for API responses
}

// Error implements the error interface
func (e *AppError) Error() string {
	if e.Details != "" {
		return fmt.Sprintf("%s: %s - %s", e.Code, e.Message, e.Details)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Unwrap returns the underlying error
func (e *AppError) Unwrap() error {
	return e.Cause
}

// ToJSON converts the error to JSON format
func (e *AppError) ToJSON() ([]byte, error) {
	return json.Marshal(e)
}

// NewAppError creates a new application error
func NewAppError(errorType ErrorType, code, message string) *AppError {
	return &AppError{
		Type:       errorType,
		Code:       code,
		Message:    message,
		Timestamp:  time.Now().UTC(),
		HTTPStatus: getDefaultHTTPStatus(errorType),
	}
}

// NewAppErrorWithCause creates a new application error with an underlying cause
func NewAppErrorWithCause(errorType ErrorType, code, message string, cause error) *AppError {
	err := NewAppError(errorType, code, message)
	err.Cause = cause
	if cause != nil {
		err.Details = cause.Error()
	}
	return err
}

// WithCorrelationID adds a correlation ID to the error
func (e *AppError) WithCorrelationID(correlationID string) *AppError {
	e.CorrelationID = correlationID
	return e
}

// WithDetails adds additional details to the error
func (e *AppError) WithDetails(details string) *AppError {
	e.Details = details
	return e
}

// WithMetadata adds metadata to the error
func (e *AppError) WithMetadata(key string, value interface{}) *AppError {
	if e.Metadata == nil {
		e.Metadata = make(map[string]interface{})
	}
	e.Metadata[key] = value
	return e
}

// WithHTTPStatus sets a custom HTTP status code
func (e *AppError) WithHTTPStatus(status int) *AppError {
	e.HTTPStatus = status
	return e
}

// getDefaultHTTPStatus returns the default HTTP status for an error type
func getDefaultHTTPStatus(errorType ErrorType) int {
	switch errorType {
	case ErrorTypeValidation:
		return http.StatusBadRequest
	case ErrorTypeAuthentication:
		return http.StatusUnauthorized
	case ErrorTypeAuthorization:
		return http.StatusForbidden
	case ErrorTypeNotFound:
		return http.StatusNotFound
	case ErrorTypeConflict:
		return http.StatusConflict
	case ErrorTypeRateLimit:
		return http.StatusTooManyRequests
	case ErrorTypeTimeout:
		return http.StatusRequestTimeout
	default:
		return http.StatusInternalServerError
	}
}

// Common error constructors

// NewValidationError creates a validation error
func NewValidationError(field, message string) *AppError {
	return NewAppError(ErrorTypeValidation, "VALIDATION_ERROR", message).
		WithMetadata("field", field)
}

// NewAuthenticationError creates an authentication error
func NewAuthenticationError(message string) *AppError {
	return NewAppError(ErrorTypeAuthentication, "AUTH_ERROR", message)
}

// NewAuthorizationError creates an authorization error
func NewAuthorizationError(message string) *AppError {
	return NewAppError(ErrorTypeAuthorization, "AUTHZ_ERROR", message)
}

// NewNotFoundError creates a not found error
func NewNotFoundError(resource string) *AppError {
	return NewAppError(ErrorTypeNotFound, "NOT_FOUND", fmt.Sprintf("%s not found", resource)).
		WithMetadata("resource", resource)
}

// NewConflictError creates a conflict error
func NewConflictError(message string) *AppError {
	return NewAppError(ErrorTypeConflict, "CONFLICT", message)
}

// NewRateLimitError creates a rate limit error
func NewRateLimitError(limit int, window string) *AppError {
	return NewAppError(ErrorTypeRateLimit, "RATE_LIMIT_EXCEEDED", "Rate limit exceeded").
		WithMetadata("limit", limit).
		WithMetadata("window", window)
}

// NewInternalError creates an internal server error
func NewInternalError(message string, cause error) *AppError {
	return NewAppErrorWithCause(ErrorTypeInternal, "INTERNAL_ERROR", message, cause)
}

// NewDatabaseError creates a database error
func NewDatabaseError(operation string, cause error) *AppError {
	return NewAppErrorWithCause(ErrorTypeDatabase, "DATABASE_ERROR",
		fmt.Sprintf("Database operation failed: %s", operation), cause).
		WithMetadata("operation", operation)
}

// NewCacheError creates a cache error
func NewCacheError(operation string, cause error) *AppError {
	return NewAppErrorWithCause(ErrorTypeCache, "CACHE_ERROR",
		fmt.Sprintf("Cache operation failed: %s", operation), cause).
		WithMetadata("operation", operation)
}

// NewTelegramError creates a Telegram API error
func NewTelegramError(operation string, cause error) *AppError {
	return NewAppErrorWithCause(ErrorTypeTelegram, "TELEGRAM_ERROR",
		fmt.Sprintf("Telegram API operation failed: %s", operation), cause).
		WithMetadata("operation", operation)
}

// NewTimeoutError creates a timeout error
func NewTimeoutError(operation string, timeout time.Duration) *AppError {
	return NewAppError(ErrorTypeTimeout, "TIMEOUT",
		fmt.Sprintf("Operation timed out: %s", operation)).
		WithMetadata("operation", operation).
		WithMetadata("timeout", timeout.String())
}

// NewExternalError creates an external service error
func NewExternalError(service, operation string, cause error) *AppError {
	return NewAppErrorWithCause(ErrorTypeExternal, "EXTERNAL_ERROR",
		fmt.Sprintf("External service error: %s", service), cause).
		WithMetadata("service", service).
		WithMetadata("operation", operation)
}

// IsErrorType checks if an error is of a specific type
func IsErrorType(err error, errorType ErrorType) bool {
	if appErr, ok := err.(*AppError); ok {
		return appErr.Type == errorType
	}
	return false
}

// GetErrorType returns the error type if it's an AppError
func GetErrorType(err error) (ErrorType, bool) {
	if appErr, ok := err.(*AppError); ok {
		return appErr.Type, true
	}
	return "", false
}

// GetCorrelationID extracts correlation ID from an error
func GetCorrelationID(err error) string {
	if appErr, ok := err.(*AppError); ok {
		return appErr.CorrelationID
	}
	return ""
}
