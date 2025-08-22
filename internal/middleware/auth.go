package middleware

import (
	"context"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/meetsmatch/meetsmatch/internal/interfaces"
	"github.com/meetsmatch/meetsmatch/internal/telemetry"
)

// AuthMiddleware provides authentication middleware for bot handlers
type AuthMiddleware struct {
	userService interfaces.UserServiceInterface
}

// NewAuthMiddleware creates a new authentication middleware
func NewAuthMiddleware(userService interfaces.UserServiceInterface) *AuthMiddleware {
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
		logger := telemetry.GetContextualLogger(ctx)
		if err != nil {
			logger.WithFields(map[string]interface{}{
				"operation":   "authenticate_user",
				"user_id":     userID,
				"telegram_id": userID,
				"service":     "auth_middleware",
				"result":      "failed",
			}).WithError(err).Warn("Authentication failed for user, allowing for registration")
			// For new users, we'll let them through to handle registration
			next(ctx, b, update)
			return
		}

		// Add user to context for downstream handlers
		ctx = context.WithValue(ctx, "user", user)
		logger.WithFields(map[string]interface{}{
			"operation":   "authenticate_user",
			"user_id":     user.ID,
			"user_name":   user.Name,
			"telegram_id": userID,
			"service":     "auth_middleware",
			"result":      "success",
		}).Info("User authenticated successfully")

		// Continue to next handler
		next(ctx, b, update)
	}
}
