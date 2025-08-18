package middleware

import (
	"context"
	"log"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/meetsmatch/meetsmatch/internal/services"
)

// AuthMiddleware provides authentication middleware for bot handlers
type AuthMiddleware struct {
	userService *services.UserService
}

// NewAuthMiddleware creates a new authentication middleware
func NewAuthMiddleware(userService *services.UserService) *AuthMiddleware {
	return &AuthMiddleware{
		userService: userService,
	}
}

// Middleware returns the authentication middleware function
func (m *AuthMiddleware) Middleware(next bot.HandlerFunc) bot.HandlerFunc {
	return func(ctx context.Context, b *bot.Bot, update *models.Update) {
		// Extract user ID from update
		var userID int64
		if update.Message != nil {
			userID = update.Message.From.ID
		} else if update.CallbackQuery != nil {
			userID = update.CallbackQuery.From.ID
		} else {
			// Skip authentication for other update types
			next(ctx, b, update)
			return
		}

		// Check if user exists in database
		user, err := m.userService.GetUserByTelegramID(userID)
		if err != nil {
			log.Printf("Authentication failed for user %d: %v", userID, err)
			// For new users, we'll let them through to handle registration
			next(ctx, b, update)
			return
		}

		// Add user to context for downstream handlers
		ctx = context.WithValue(ctx, "user", user)
		log.Printf("User %s (%s) authenticated successfully", user.ID, user.Name)

		// Continue to next handler
		next(ctx, b, update)
	}
}
