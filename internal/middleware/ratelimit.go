package middleware

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

// RateLimiter represents a simple token bucket rate limiter
type RateLimiter struct {
	tokens    int
	maxTokens int
	lastRefill time.Time
	refillRate time.Duration
	mu        sync.Mutex
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(maxTokens int, refillRate time.Duration) *RateLimiter {
	return &RateLimiter{
		tokens:     maxTokens,
		maxTokens:  maxTokens,
		lastRefill: time.Now(),
		refillRate: refillRate,
	}
}

// Allow checks if a request is allowed
func (rl *RateLimiter) Allow() bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(rl.lastRefill)

	// Refill tokens based on elapsed time
	if elapsed >= rl.refillRate {
		tokensToAdd := int(elapsed / rl.refillRate)
		rl.tokens = min(rl.maxTokens, rl.tokens+tokensToAdd)
		rl.lastRefill = now
	}

	// Check if we have tokens available
	if rl.tokens > 0 {
		rl.tokens--
		return true
	}

	return false
}

// RateLimitMiddleware provides rate limiting middleware for bot handlers
type RateLimitMiddleware struct {
	limiters map[int64]*RateLimiter
	mu       sync.RWMutex
	maxTokens int
	refillRate time.Duration
}

// NewRateLimitMiddleware creates a new rate limiting middleware
func NewRateLimitMiddleware(maxTokens int, refillRate time.Duration) *RateLimitMiddleware {
	return &RateLimitMiddleware{
		limiters:   make(map[int64]*RateLimiter),
		maxTokens:  maxTokens,
		refillRate: refillRate,
	}
}

// Middleware returns the rate limiting middleware function
func (m *RateLimitMiddleware) Middleware(next bot.HandlerFunc) bot.HandlerFunc {
	return func(ctx context.Context, b *bot.Bot, update *models.Update) {
		// Extract user ID from update
		var userID int64
		if update.Message != nil {
			userID = update.Message.From.ID
		} else if update.CallbackQuery != nil {
			userID = update.CallbackQuery.From.ID
		} else {
			// Skip rate limiting for other update types
			next(ctx, b, update)
			return
		}

		// Get or create rate limiter for user
		limiter := m.getLimiter(userID)

		// Check if request is allowed
		if !limiter.Allow() {
			log.Printf("Rate limit exceeded for user %d", userID)
			m.sendRateLimitMessage(ctx, b, update)
			return
		}

		// Continue to next handler
		next(ctx, b, update)
	}
}

// getLimiter gets or creates a rate limiter for a user
func (m *RateLimitMiddleware) getLimiter(userID int64) *RateLimiter {
	m.mu.RLock()
	limiter, exists := m.limiters[userID]
	m.mu.RUnlock()

	if !exists {
		m.mu.Lock()
		// Double-check after acquiring write lock
		if limiter, exists = m.limiters[userID]; !exists {
			limiter = NewRateLimiter(m.maxTokens, m.refillRate)
			m.limiters[userID] = limiter
		}
		m.mu.Unlock()
	}

	return limiter
}

// sendRateLimitMessage sends a rate limit warning to the user
func (m *RateLimitMiddleware) sendRateLimitMessage(ctx context.Context, b *bot.Bot, update *models.Update) {
	var chatID int64
	if update.Message != nil {
		chatID = update.Message.Chat.ID
	} else if update.CallbackQuery != nil && update.CallbackQuery.Message.Message != nil {
		chatID = update.CallbackQuery.Message.Message.Chat.ID
	} else {
		return
	}

	message := "⚠️ You're sending messages too quickly. Please wait a moment before trying again."
	_, err := b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID: chatID,
		Text:   message,
	})
	if err != nil {
		log.Printf("Error sending rate limit message: %v", err)
	}
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}