package sentry

import (
	"github.com/getsentry/sentry-go"
	"github.com/gofiber/fiber/v2"
)

// FiberMiddleware returns a Fiber middleware that captures panics and errors.
func FiberMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		hub := sentry.CurrentHub().Clone()
		hub.Scope().SetTag("http.path", c.Path())
		hub.Scope().SetTag("http.method", c.Method())

		defer func() {
			if r := recover(); r != nil {
				hub.RecoverWithContext(c.Context(), r)
				_ = c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "Internal Server Error",
				})
			}
		}()

		err := c.Next()
		if err != nil && c.Response().StatusCode() >= 500 {
			hub.CaptureException(err)
		}

		return err
	}
}
