package middleware

import (
	"context"
	"log"
	"time"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

// LoggingMiddleware provides logging middleware for bot handlers
type LoggingMiddleware struct{}

// NewLoggingMiddleware creates a new logging middleware
func NewLoggingMiddleware() *LoggingMiddleware {
	return &LoggingMiddleware{}
}

// Middleware returns the logging middleware function
func (m *LoggingMiddleware) Middleware(next bot.HandlerFunc) bot.HandlerFunc {
	return func(ctx context.Context, b *bot.Bot, update *models.Update) {
		start := time.Now()

		// Log incoming update
		m.logIncomingUpdate(update)

		// Execute next handler with panic recovery
		defer func() {
			if r := recover(); r != nil {
				log.Printf("PANIC in bot handler: %v", r)
			}
			duration := time.Since(start)
			log.Printf("Request processed in %v", duration)
		}()

		next(ctx, b, update)
	}
}

// logIncomingUpdate logs details about incoming updates
func (m *LoggingMiddleware) logIncomingUpdate(update *models.Update) {
	if update.Message != nil {
		msg := update.Message
		log.Printf("Message from user %d (@%s) in chat %d: %s",
			msg.From.ID, msg.From.Username, msg.Chat.ID, msg.Text)
	} else if update.CallbackQuery != nil {
		cb := update.CallbackQuery
		log.Printf("Callback query from user %d (@%s): %s",
			cb.From.ID, cb.From.Username, cb.Data)
	} else if update.InlineQuery != nil {
		iq := update.InlineQuery
		log.Printf("Inline query from user %d (@%s): %s",
			iq.From.ID, iq.From.Username, iq.Query)
	} else {
		log.Printf("Received update of unknown type: %+v", update)
	}
}