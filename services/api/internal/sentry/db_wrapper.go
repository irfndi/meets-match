package sentry

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/getsentry/sentry-go"
)

// WrapDBError wraps a database error with Sentry capture and breadcrumb.
// It does not report sql.ErrNoRows as these are expected "not found" scenarios.
func WrapDBError(ctx context.Context, operation string, query string, err error) error {
	if err == nil {
		return nil
	}

	// Don't report ErrNoRows as an error to Sentry
	if err == sql.ErrNoRows {
		return err
	}

	// Get hub from context, fall back to current hub if not set
	hub := sentry.GetHubFromContext(ctx)
	if hub == nil {
		hub = sentry.CurrentHub().Clone()
	}

	// Add breadcrumb to the request-specific hub
	hub.AddBreadcrumb(&sentry.Breadcrumb{
		Category: "db",
		Message:  fmt.Sprintf("DB %s failed", operation),
		Level:    sentry.LevelError,
		Data: map[string]interface{}{
			"operation": operation,
			"query":     truncateQuery(query),
		},
	}, nil)

	CaptureErrorWithContext(ctx, err, map[string]string{
		"db.operation": operation,
	}, map[string]interface{}{
		"query": truncateQuery(query),
	})

	return err
}

// truncateQuery truncates a query string to prevent large queries in Sentry events.
func truncateQuery(query string) string {
	const maxLen = 200
	if len(query) > maxLen {
		return query[:maxLen] + "..."
	}
	return query
}
