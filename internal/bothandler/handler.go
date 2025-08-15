package bothandler

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"github.com/meetsmatch/meetsmatch/internal/middleware"
	"github.com/meetsmatch/meetsmatch/internal/services"
)

type Handler struct {
	bot             *bot.Bot
	ctx             context.Context
	userService     *services.UserService
	matchingService *services.MatchingService
	messagingService *services.MessagingService
	authMiddleware  *middleware.AuthMiddleware
	loggingMiddleware *middleware.LoggingMiddleware
	rateLimitMiddleware *middleware.RateLimitMiddleware
}

func NewHandler(
	bot *bot.Bot,
	userService *services.UserService,
	matchingService *services.MatchingService,
	messagingService *services.MessagingService,
) *Handler {
	return &Handler{
		bot:             bot,
		userService:     userService,
		matchingService: matchingService,
		messagingService: messagingService,
		ctx:             context.Background(),
		authMiddleware:  middleware.NewAuthMiddleware(userService),
		loggingMiddleware: middleware.NewLoggingMiddleware(),
		rateLimitMiddleware: middleware.NewRateLimitMiddleware(10, time.Minute),
	}
}

func (h *Handler) HandleWebhook(c *gin.Context) {
	var update models.Update
	if err := c.ShouldBindJSON(&update); err != nil {
		log.Printf("Error parsing webhook: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON"})
		return
	}

	h.HandleUpdate(h.ctx, h.bot, &update)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) HandleUpdate(ctx context.Context, b *bot.Bot, update *models.Update) {
	if update.Message != nil {
		h.handleMessage(update.Message)
	} else if update.CallbackQuery != nil {
		h.handleCallbackQuery(update.CallbackQuery)
	}
}

func (h *Handler) handleMessage(message *models.Message) {
	userID := message.From.ID
	chatID := message.Chat.ID

	// Check if user exists
	user, err := h.userService.GetUserByTelegramID(userID)
	if err != nil {
		log.Printf("Error getting user: %v", err)
		return
	}

	// Handle commands
	if h.isCommand(message.Text) {
		if user == nil {
			// Only allow /start command for new users
			if h.extractCommand(message.Text) == "start" {
				h.handleStartCommand(chatID, userID)
			} else {
				h.sendMessage(chatID, "Please start with /start command first.")
			}
		} else {
			h.handleCommand(message, user)
		}
		return
	}

	// Handle regular messages based on user state
	h.handleUserState(message, user)
}

func (h *Handler) handleStartCommand(chatID int64, userID int64) {
	// Create new user
	user, err := h.userService.CreateUser(userID, "", "")
	if err != nil {
		log.Printf("Error creating user: %v", err)
		h.sendMessage(chatID, "Sorry, there was an error processing your request.")
		return
	}

	// Start onboarding
	h.userService.UpdateUserState(user.ID, "onboarding_name")
	h.sendMessage(chatID, "Welcome to MeetsMatch! 💕\n\nLet's set up your profile. What's your name?")
}

func (h *Handler) handleCommand(message *models.Message, user *services.User) {
	chatID := message.Chat.ID
	command := h.extractCommand(message.Text)

	switch command {
	case "start":
		h.showMainMenu(chatID, user)
	case "profile":
		h.handleProfileCommand(chatID, user)
	case "matches":
		h.handleMatchesCommand(chatID, user)
	case "settings":
		h.handleSettingsCommand(chatID, user)
	case "help":
		h.handleHelpCommand(chatID)
	default:
		h.sendMessage(chatID, "Unknown command. Type /help for available commands.")
	}
}

func (h *Handler) handleProfileCommand(chatID int64, user *services.User) {
	if user.State == "new" || user.State == "onboarding" {
		h.sendMessage(chatID, "Please complete your profile setup first by using /start")
		return
	}

	msg := fmt.Sprintf("👤 Your Profile:\n\n")
	msg += fmt.Sprintf("Name: %s\n", user.Name)
	msg += fmt.Sprintf("Age: %d\n", user.Age)
	msg += fmt.Sprintf("Gender: %s\n", user.Gender)
	if user.Bio != "" {
		msg += fmt.Sprintf("Bio: %s\n", user.Bio)
	}
	if user.LocationText != "" {
		msg += fmt.Sprintf("Location: %s\n", user.LocationText)
	}

	keyboard := models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "✏️ Edit Profile", CallbackData: "edit_profile"},
				{Text: "🌐 Web Profile", URL: "https://meetsmatch.com/profile"},
			},
		},
	}

	h.sendMessageWithKeyboard(chatID, msg, keyboard)
}

func (h *Handler) handleMatchesCommand(chatID int64, user *services.User) {
	if user.State != "active" {
		h.sendMessage(chatID, "Please complete your profile setup first.")
		return
	}

	matches, err := h.matchingService.GetPotentialMatches(user.ID, 5)
	if err != nil {
		log.Printf("Error getting matches: %v", err)
		h.sendMessage(chatID, "Sorry, there was an error getting your matches.")
		return
	}

	if len(matches) == 0 {
		h.sendMessage(chatID, "No new matches found. Check back later! 💫")
		return
	}

	// Show first match
	match := matches[0]
	msg := fmt.Sprintf("💕 New Match!\n\n")
	msg += fmt.Sprintf("Name: %s, %d\n", match.Name, match.Age)
	if match.Bio != "" {
		msg += fmt.Sprintf("Bio: %s\n", match.Bio)
	}
	if match.LocationText != "" {
		msg += fmt.Sprintf("Location: %s\n", match.LocationText)
	}

	keyboard := models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "💚 Like", CallbackData: fmt.Sprintf("like_%s", match.ID)},
				{Text: "💔 Pass", CallbackData: fmt.Sprintf("pass_%s", match.ID)},
			},
			{
				{Text: "🌐 View More", URL: "https://meetsmatch.com/matches"},
			},
		},
	}

	h.sendMessageWithKeyboard(chatID, msg, keyboard)
}

func (h *Handler) handleSettingsCommand(chatID int64, user *services.User) {
	keyboard := models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "🎯 Preferences", CallbackData: "settings_preferences"},
				{Text: "🔔 Notifications", CallbackData: "settings_notifications"},
			},
			{
				{Text: "🔒 Privacy", CallbackData: "settings_privacy"},
				{Text: "❓ Help", CallbackData: "settings_help"},
			},
		},
	}

	h.sendMessageWithKeyboard(chatID, "⚙️ Settings", keyboard)
}

func (h *Handler) handleHelpCommand(chatID int64) {
	msg := "🤖 MeetsMatch Bot Help\n\n"
	msg += "Available commands:\n"
	msg += "/start - Start or show main menu\n"
	msg += "/profile - View your profile\n"
	msg += "/matches - See potential matches\n"
	msg += "/settings - Bot settings\n"
	msg += "/help - Show this help\n\n"
	msg += "For more features, visit our web app: https://meetsmatch.com"

	h.sendMessage(chatID, msg)
}

func (h *Handler) handleUserState(message *models.Message, user *services.User) {
	chatID := message.Chat.ID
	text := message.Text

	switch user.State {
	case "onboarding_name":
		if len(text) < 2 || len(text) > 50 {
			h.sendMessage(chatID, "Please enter a valid name (2-50 characters):")
			return
		}
		h.userService.UpdateUserName(user.ID, text)
		h.userService.UpdateUserState(user.ID, "onboarding_age")
		h.sendMessage(chatID, "Great! Now, how old are you? (18-100)")

	case "onboarding_age":
		age, err := strconv.Atoi(text)
		if err != nil || age < 18 || age > 100 {
			h.sendMessage(chatID, "Please enter a valid age (18-100):")
			return
		}
		h.userService.UpdateUserAge(user.ID, age)
		h.userService.UpdateUserState(user.ID, "onboarding_gender")
		
		keyboard := models.InlineKeyboardMarkup{
			InlineKeyboard: [][]models.InlineKeyboardButton{
				{
					{Text: "👨 Male", CallbackData: "gender_male"},
					{Text: "👩 Female", CallbackData: "gender_female"},
				},
				{
					{Text: "🌈 Non-binary", CallbackData: "gender_nonbinary"},
					{Text: "🤷 Other", CallbackData: "gender_other"},
				},
			},
		}
		h.sendMessageWithKeyboard(chatID, "What's your gender?", keyboard)

	default:
		h.sendMessage(chatID, "I didn't understand that. Type /help for available commands.")
	}
}

func (h *Handler) handleCallbackQuery(callback *models.CallbackQuery) {
	// Handle MaybeInaccessibleMessage
	if callback.Message.Message == nil {
		log.Printf("Callback query message is nil or inaccessible")
		return
	}

	chatID := callback.Message.Message.Chat.ID
	userID := callback.From.ID
	data := callback.Data

	// Acknowledge the callback
	_, err := h.bot.AnswerCallbackQuery(h.ctx, &bot.AnswerCallbackQueryParams{
		CallbackQueryID: callback.ID,
	})
	if err != nil {
		log.Printf("Error answering callback query: %v", err)
	}

	user, err := h.userService.GetUserByTelegramID(userID)
	if err != nil {
		log.Printf("Error getting user: %v", err)
		return
	}

	if strings.HasPrefix(data, "gender_") {
		gender := strings.TrimPrefix(data, "gender_")
		h.userService.UpdateUserGender(user.ID, gender)
		h.userService.UpdateUserState(user.ID, "onboarding_bio")
		h.sendMessage(chatID, "Perfect! Now tell me a bit about yourself (bio):")
	} else if strings.HasPrefix(data, "like_") {
		targetUserID := strings.TrimPrefix(data, "like_")
		h.matchingService.CreateMatch(user.ID, targetUserID, "accepted")
		h.sendMessage(chatID, "Great choice! 💚 We'll let you know if it's a mutual match!")
	} else if strings.HasPrefix(data, "pass_") {
		targetUserID := strings.TrimPrefix(data, "pass_")
		h.matchingService.CreateMatch(user.ID, targetUserID, "declined")
		h.sendMessage(chatID, "No worries! There are plenty more matches waiting. 💫")
	}
}

func (h *Handler) showMainMenu(chatID int64, user *services.User) {
	msg := fmt.Sprintf("Welcome back, %s! 👋\n\n", user.Name)
	msg += "What would you like to do?"

	keyboard := models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "💕 Find Matches", CallbackData: "find_matches"},
				{Text: "💬 Messages", CallbackData: "view_messages"},
			},
			{
				{Text: "👤 Profile", CallbackData: "view_profile"},
				{Text: "⚙️ Settings", CallbackData: "view_settings"},
			},
			{
				{Text: "🌐 Web App", URL: "https://meetsmatch.com"},
			},
		},
	}

	h.sendMessageWithKeyboard(chatID, msg, keyboard)
}

// extractCommand extracts the command from a message text
func (h *Handler) extractCommand(text string) string {
	if !strings.HasPrefix(text, "/") {
		return ""
	}
	parts := strings.Fields(text)
	if len(parts) == 0 {
		return ""
	}
	return strings.TrimPrefix(parts[0], "/")
}

// isCommand checks if a message is a command
func (h *Handler) isCommand(text string) bool {
	return strings.HasPrefix(text, "/")
}

func (h *Handler) sendMessage(chatID int64, text string) {
	_, err := h.bot.SendMessage(h.ctx, &bot.SendMessageParams{
		ChatID:    chatID,
		Text:      text,
		ParseMode: models.ParseModeMarkdown,
	})
	if err != nil {
		log.Printf("Error sending message: %v", err)
	}
}

func (h *Handler) sendMessageWithKeyboard(chatID int64, text string, keyboard models.InlineKeyboardMarkup) {
	_, err := h.bot.SendMessage(h.ctx, &bot.SendMessageParams{
		ChatID:      chatID,
		Text:        text,
		ParseMode:   models.ParseModeMarkdown,
		ReplyMarkup: keyboard,
	})
	if err != nil {
		log.Printf("Error sending message with keyboard: %v", err)
	}
}

// RegisterHandlers registers all bot handlers with the bot instance
func (h *Handler) RegisterHandlers() {
	// Create middleware chain
	messageHandler := h.chainMiddleware(h.handleBotUpdate)
	callbackHandler := h.chainMiddleware(h.handleBotCallbackQuery)

	// Register handler for all text messages (including commands)
	h.bot.RegisterHandler(bot.HandlerTypeMessageText, "", bot.MatchTypePrefix, messageHandler)
	// Register handler for callback queries
	h.bot.RegisterHandler(bot.HandlerTypeCallbackQueryData, "", bot.MatchTypePrefix, callbackHandler)
}

// chainMiddleware applies all middleware to a handler function
func (h *Handler) chainMiddleware(handler bot.HandlerFunc) bot.HandlerFunc {
	// Apply middleware in reverse order (last middleware wraps first)
	wrapped := handler
	wrapped = h.authMiddleware.Middleware(wrapped)
	wrapped = h.rateLimitMiddleware.Middleware(wrapped)
	wrapped = h.loggingMiddleware.Middleware(wrapped)
	return wrapped
}

// handleBotUpdate handles incoming messages
func (h *Handler) handleBotUpdate(ctx context.Context, b *bot.Bot, update *models.Update) {
	if update.Message != nil {
		h.handleMessage(update.Message)
	}
}

// handleBotCallbackQuery handles callback queries
func (h *Handler) handleBotCallbackQuery(ctx context.Context, b *bot.Bot, update *models.Update) {
	if update.CallbackQuery != nil {
		h.handleCallbackQuery(update.CallbackQuery)
	}
}