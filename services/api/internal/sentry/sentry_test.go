package sentry

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	gosentry "github.com/getsentry/sentry-go"
	"github.com/irfndi/match-bot/services/api/internal/config"
)

func TestInit_Disabled(t *testing.T) {
	cfg := config.Config{
		EnableSentry: false,
		SentryDSN:    "",
	}

	err := Init(cfg)
	if err != nil {
		t.Errorf("Expected no error for disabled Sentry, got %v", err)
	}
}

func TestInit_EmptyDSN(t *testing.T) {
	cfg := config.Config{
		EnableSentry: true,
		SentryDSN:    "", // Empty DSN should gracefully degrade
	}

	err := Init(cfg)
	if err != nil {
		t.Errorf("Expected graceful degradation for empty DSN, got %v", err)
	}
}

func TestCaptureError_NilError(t *testing.T) {
	// Should not panic on nil error
	CaptureError(nil, nil, nil)
}

func TestCaptureError_NonNilError(t *testing.T) {
	// Should not panic even without Sentry initialized
	err := errors.New("test error")
	CaptureError(err, map[string]string{"key": "value"}, map[string]interface{}{"extra": 123})
}

func TestCaptureErrorWithContext_NilError(t *testing.T) {
	ctx := context.Background()
	// Should not panic on nil error
	CaptureErrorWithContext(ctx, nil, nil, nil)
}

func TestCaptureErrorWithContext_WithUserID(t *testing.T) {
	ctx := WithUserID(context.Background(), "user123")
	err := errors.New("test error")
	// Should not panic
	CaptureErrorWithContext(ctx, err, nil, nil)
}

func TestCaptureErrorWithContext_WithRequestID(t *testing.T) {
	ctx := WithRequestID(context.Background(), "req-abc-123")
	err := errors.New("test error")
	// Should not panic
	CaptureErrorWithContext(ctx, err, nil, nil)
}

func TestAddBreadcrumb(t *testing.T) {
	// Should not panic even without Sentry initialized
	AddBreadcrumb("test", "test message", gosentry.LevelInfo, nil)
	AddBreadcrumb("test", "test with data", gosentry.LevelError, map[string]interface{}{"key": "value"})
}

func TestWithUserID(t *testing.T) {
	ctx := context.Background()
	newCtx := WithUserID(ctx, "user123")

	if newCtx == ctx {
		t.Error("Expected new context to be different from original")
	}

	userID, ok := newCtx.Value(contextKeyUserID).(string)
	if !ok || userID != "user123" {
		t.Errorf("Expected user ID 'user123', got %v", userID)
	}
}

func TestWithRequestID(t *testing.T) {
	ctx := context.Background()
	newCtx := WithRequestID(ctx, "req-123")

	if newCtx == ctx {
		t.Error("Expected new context to be different from original")
	}

	requestID, ok := newCtx.Value(contextKeyRequestID).(string)
	if !ok || requestID != "req-123" {
		t.Errorf("Expected request ID 'req-123', got %v", requestID)
	}
}

func TestWrapDBError_Nil(t *testing.T) {
	ctx := context.Background()
	err := WrapDBError(ctx, "SELECT", "SELECT * FROM users", nil)
	if err != nil {
		t.Errorf("Expected nil error, got %v", err)
	}
}

func TestWrapDBError_ErrNoRows(t *testing.T) {
	ctx := context.Background()
	err := WrapDBError(ctx, "SELECT", "SELECT * FROM users WHERE id = $1", sql.ErrNoRows)
	if err != sql.ErrNoRows {
		t.Errorf("Expected sql.ErrNoRows to be returned unchanged")
	}
}

func TestWrapDBError_NonNil(t *testing.T) {
	ctx := context.Background()
	originalErr := errors.New("connection refused")
	err := WrapDBError(ctx, "SELECT", "SELECT * FROM users", originalErr)
	if err != originalErr {
		t.Errorf("Expected original error to be returned")
	}
}

func TestTruncateQuery(t *testing.T) {
	tests := []struct {
		name     string
		query    string
		expected int
	}{
		{
			name:     "short query unchanged",
			query:    "SELECT * FROM users",
			expected: len("SELECT * FROM users"),
		},
		{
			name:     "exact length unchanged",
			query:    string(make([]byte, 200)),
			expected: 200,
		},
		{
			name:     "long query truncated",
			query:    string(make([]byte, 300)),
			expected: 203, // 200 + "..."
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := truncateQuery(tt.query)
			if len(result) != tt.expected {
				t.Errorf("Expected length %d, got %d", tt.expected, len(result))
			}
		})
	}
}

func TestFlush(t *testing.T) {
	// Should not panic even without Sentry initialized
	Flush(0)
}
