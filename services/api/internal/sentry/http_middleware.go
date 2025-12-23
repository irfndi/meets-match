package sentry

import (
	"context"

	"github.com/getsentry/sentry-go"
	"github.com/gofiber/fiber/v2"
)

// FiberMiddleware returns a Fiber middleware that captures panics and errors.
func FiberMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		hub := sentry.CurrentHub().Clone()
		userCtx := c.UserContext()
		if userCtx == nil {
			userCtx = context.Background()
		}
		userCtx = sentry.SetHubOnContext(userCtx, hub)
		c.SetUserContext(userCtx)

		hub.Scope().SetTag("http.path", c.Path())
		hub.Scope().SetTag("http.method", c.Method())

		// Track if we recovered from a panic to avoid double-processing
		var recovered bool

		defer func() {
			if r := recover(); r != nil {
				recovered = true
				hub.RecoverWithContext(userCtx, r)
				// Note: We can't return an error from defer, so we set the response directly
				// The fiber.Ctx will handle the response after defer completes
				if jsonErr := c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "Internal Server Error",
				}); jsonErr != nil {
					hub.CaptureException(jsonErr)
				}
			}
		}()

		err := c.Next()

		// Only capture error if we didn't recover from panic (avoid double reporting)
		if !recovered && err != nil && c.Response().StatusCode() >= 500 {
			hub.CaptureException(err)
		}

		return err
	}
}
