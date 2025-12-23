package sentry

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/getsentry/sentry-go"
	"github.com/gofiber/fiber/v2"
)

func TestFiberMiddleware_AttachesHubToContext(t *testing.T) {
	app := fiber.New()
	app.Use(FiberMiddleware())
	app.Get("/check", func(c *fiber.Ctx) error {
		hub := sentry.GetHubFromContext(c.UserContext())
		if hub == nil {
			return c.Status(fiber.StatusInternalServerError).SendString("missing hub")
		}
		return c.SendString("ok")
	})

	req := httptest.NewRequest(http.MethodGet, "/check", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("Expected status 200, got %d: %s", resp.StatusCode, string(body))
	}
}

func TestFiberMiddleware_PanicRecovery(t *testing.T) {
	app := fiber.New()
	app.Use(FiberMiddleware())
	app.Get("/panic", func(c *fiber.Ctx) error {
		panic("boom")
	})

	req := httptest.NewRequest(http.MethodGet, "/panic", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("Expected status 500, got %d: %s", resp.StatusCode, string(body))
	}
	if !strings.Contains(string(body), "Internal Server Error") {
		t.Fatalf("Expected error message in response, got %s", string(body))
	}
}
