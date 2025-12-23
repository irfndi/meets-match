// Package sentry provides error tracking integration with Sentry/GlitchTip.
package sentry

import (
	"context"
	"fmt"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/irfndi/match-bot/services/api/internal/config"
)

// Init initializes Sentry with the given configuration.
// Returns nil if Sentry is disabled or DSN is empty (graceful degradation).
func Init(cfg config.Config) error {
	if !cfg.EnableSentry || cfg.SentryDSN == "" {
		return nil // Graceful degradation
	}

	err := sentry.Init(sentry.ClientOptions{
		Dsn:         cfg.SentryDSN,
		Environment: cfg.SentryEnvironment,
		Release:     "meetsmatch-api@1.0.0",
		BeforeSend: func(event *sentry.Event, hint *sentry.EventHint) *sentry.Event {
			sanitizeEvent(event)
			return event
		},
	})
	if err != nil {
		return fmt.Errorf("sentry initialization failed: %w", err)
	}

	return nil
}

// Flush flushes any buffered events before shutdown.
func Flush(timeout time.Duration) {
	sentry.Flush(timeout)
}

// CaptureError captures an error with optional context.
func CaptureError(err error, tags map[string]string, extras map[string]interface{}) {
	if err == nil {
		return
	}

	hub := sentry.CurrentHub().Clone()
	scope := hub.Scope()

	for k, v := range tags {
		scope.SetTag(k, v)
	}
	for k, v := range extras {
		scope.SetExtra(k, v)
	}

	hub.CaptureException(err)
}

// CaptureErrorWithContext captures an error with request context.
func CaptureErrorWithContext(ctx context.Context, err error, tags map[string]string, extras map[string]interface{}) {
	if err == nil {
		return
	}

	hub := sentry.GetHubFromContext(ctx)
	if hub == nil {
		hub = sentry.CurrentHub().Clone()
	}

	scope := hub.Scope()

	// Add context-derived info
	if userID, ok := ctx.Value(contextKeyUserID).(string); ok {
		scope.SetUser(sentry.User{ID: userID})
	}
	if requestID, ok := ctx.Value(contextKeyRequestID).(string); ok {
		scope.SetTag("request_id", requestID)
	}

	for k, v := range tags {
		scope.SetTag(k, v)
	}
	for k, v := range extras {
		scope.SetExtra(k, v)
	}

	hub.CaptureException(err)
}

// AddBreadcrumb adds a breadcrumb to the current scope.
func AddBreadcrumb(category, message string, level sentry.Level, data map[string]interface{}) {
	sentry.AddBreadcrumb(&sentry.Breadcrumb{
		Category: category,
		Message:  message,
		Level:    level,
		Data:     data,
	})
}

// Context key types for type-safe context values
type contextKey string

const (
	contextKeyUserID    contextKey = "user_id"
	contextKeyRequestID contextKey = "request_id"
)

// WithUserID returns a new context with the user ID set.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, contextKeyUserID, userID)
}

// WithRequestID returns a new context with the request ID set.
func WithRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, contextKeyRequestID, requestID)
}

// sanitizeEvent removes sensitive data from Sentry events.
func sanitizeEvent(event *sentry.Event) {
	if event.Request != nil {
		delete(event.Request.Headers, "Authorization")
		delete(event.Request.Headers, "Cookie")
		delete(event.Request.Headers, "X-Api-Key")
	}
}
