package httpserver

import (
	"github.com/gofiber/fiber/v2"
	sentrypkg "github.com/irfndi/match-bot/services/api/internal/sentry"
)

func New() *fiber.App {
	app := fiber.New()

	// Add Sentry middleware for panic recovery and error capture
	app.Use(sentrypkg.FiberMiddleware())

	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"message":  "MeetMatch API is running",
			"docs_url": "/docs",
		})
	})

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	return app
}
