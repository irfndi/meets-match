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
	bot                 *bot.Bot
	ctx                 context.Context
	userService         *services.UserService
	matchingService     *services.MatchingService
	messagingService    *services.MessagingService
	authMiddleware      *middleware.AuthMiddleware
	loggingMiddleware   *middleware.LoggingMiddleware
	rateLimitMiddleware *middleware.RateLimitMiddleware
	stateManager        *StateManager
}

func NewHandler(
	bot *bot.Bot,
	userService *services.UserService,
	matchingService *services.MatchingService,
	messagingService *services.MessagingService,
) *Handler {
	// Initialize state manager with 24 hour session TTL
	stateManager := NewStateManager(24 * time.Hour)
	// Start cleanup routine to run every hour
	stateManager.StartCleanupRoutine(1 * time.Hour)

	return &Handler{
		bot:                 bot,
		userService:         userService,
		matchingService:     matchingService,
		messagingService:    messagingService,
		ctx:                 context.Background(),
		authMiddleware:      middleware.NewAuthMiddleware(userService),
		loggingMiddleware:   middleware.NewLoggingMiddleware(),
		rateLimitMiddleware: middleware.NewRateLimitMiddleware(10, time.Minute),
		stateManager:        stateManager,
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
	case "conversations":
		h.handleConversationsCommand(chatID, user)
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

	case "onboarding_bio":
		if len(text) < 10 || len(text) > 500 {
			h.sendMessage(chatID, "Please enter a bio between 10-500 characters:")
			return
		}
		h.userService.UpdateUserBio(user.ID, text)
		h.userService.UpdateUserState(user.ID, "onboarding_location")
		h.sendMessage(chatID, "Perfect! Now, please share your location or type your city name:")

	case "onboarding_location":
		if len(text) < 2 || len(text) > 100 {
			h.sendMessage(chatID, "Please enter a valid location (2-100 characters):")
			return
		}
		h.userService.UpdateUserLocation(user.ID, text, nil, nil)
		h.userService.UpdateUserState(user.ID, "onboarding_preferences")
		h.showPreferencesSetup(chatID, user.ID)

	case "onboarding_preferences_age_min":
		age, err := strconv.Atoi(text)
		if err != nil || age < 18 || age > 100 {
			h.sendMessage(chatID, "Please enter a valid minimum age (18-100):")
			return
		}
		h.setUserPreference(user.ID, "min_age", age)
		h.userService.UpdateUserState(user.ID, "onboarding_preferences_age_max")
		h.sendMessage(chatID, "What's the maximum age you're interested in? (18-100)")

	case "onboarding_preferences_age_max":
		age, err := strconv.Atoi(text)
		if err != nil || age < 18 || age > 100 {
			h.sendMessage(chatID, "Please enter a valid maximum age (18-100):")
			return
		}
		h.setUserPreference(user.ID, "max_age", age)
		h.userService.UpdateUserState(user.ID, "onboarding_preferences_distance")
		h.sendMessage(chatID, "What's the maximum distance you're willing to travel? (in km, 1-500)")

	case "onboarding_preferences_distance":
		distance, err := strconv.Atoi(text)
		if err != nil || distance < 1 || distance > 500 {
			h.sendMessage(chatID, "Please enter a valid distance (1-500 km):")
			return
		}
		h.setUserPreference(user.ID, "max_distance", distance)
		h.completeOnboarding(chatID, user.ID)

	case "active":
		// Handle conversation messages for active users
		h.handleConversationMessage(message, user)

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

	switch {
	case strings.HasPrefix(data, "gender_"):
		gender := strings.TrimPrefix(data, "gender_")
		h.userService.UpdateUserGender(user.ID, gender)
		h.userService.UpdateUserState(user.ID, "onboarding_bio")
		h.sendMessage(chatID, "Perfect! Now tell me a bit about yourself (bio - 10-500 characters):")

	case strings.HasPrefix(data, "like_"):
		targetUserID := strings.TrimPrefix(data, "like_")
		_, err := h.matchingService.CreateMatch(user.ID, targetUserID, "accepted")
		if err != nil {
			log.Printf("Error creating match: %v", err)
			h.sendMessage(chatID, "Sorry, there was an error processing your like.")
			return
		}
		h.sendMessage(chatID, "Great choice! 💚 We'll let you know if it's a mutual match!")
		h.showNextMatch(chatID, user)

	case strings.HasPrefix(data, "pass_"):
		targetUserID := strings.TrimPrefix(data, "pass_")
		_, err := h.matchingService.CreateMatch(user.ID, targetUserID, "declined")
		if err != nil {
			log.Printf("Error creating match: %v", err)
		}
		h.sendMessage(chatID, "No worries! There are plenty more matches waiting. 💫")
		h.showNextMatch(chatID, user)

	case strings.HasPrefix(data, "preferences_gender_"):
		gender := strings.TrimPrefix(data, "preferences_gender_")
		h.addGenderPreference(user.ID, gender)
		h.sendMessage(chatID, "Great! Now, what's the minimum age you're interested in? (18-100)")
		h.userService.UpdateUserState(user.ID, "onboarding_preferences_age_min")

	case data == "find_matches":
		h.handleMatchesCommand(chatID, user)

	case data == "view_messages":
		h.handleMessagesCommand(chatID, user)

	case data == "view_profile":
		h.handleProfileCommand(chatID, user)

	case data == "view_settings":
		h.handleSettingsCommand(chatID, user)

	case data == "edit_profile":
		h.handleEditProfileCommand(chatID, user)

	case strings.HasPrefix(data, "select_conversation_"):
		conversationID := strings.TrimPrefix(data, "select_conversation_")
		userIDStr := fmt.Sprintf("%d", user.ID)
		h.stateManager.GetSession(userIDStr, chatID) // Initialize session
		h.setUserActiveConversation(userIDStr, conversationID)
		h.sendMessage(chatID, "💬 Conversation selected! Now you can type your message and it will be sent to this chat. Type /conversations to switch to a different chat.")

	default:
		h.sendMessage(chatID, "Unknown action. Please try again.")
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

// showPreferencesSetup shows the gender preferences setup
func (h *Handler) showPreferencesSetup(chatID int64, userID string) {
	msg := "Almost done! Let's set up your preferences.\n\nWhat gender(s) are you interested in?"
	keyboard := models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "👨 Men", CallbackData: "preferences_gender_male"},
				{Text: "👩 Women", CallbackData: "preferences_gender_female"},
			},
			{
				{Text: "🌈 Non-binary", CallbackData: "preferences_gender_nonbinary"},
				{Text: "🤷 Everyone", CallbackData: "preferences_gender_all"},
			},
		},
	}
	h.sendMessageWithKeyboard(chatID, msg, keyboard)
}

// setUserPreference sets a user preference
func (h *Handler) setUserPreference(userID string, key string, value interface{}) {
	// Get current user to update preferences
	user, err := h.userService.GetUserByID(userID)
	if err != nil {
		log.Printf("Error getting user for preference update: %v", err)
		return
	}

	// Update the specific preference
	prefs := user.Preferences
	switch key {
	case "min_age":
		if age, ok := value.(int); ok {
			prefs.MinAge = age
		}
	case "max_age":
		if age, ok := value.(int); ok {
			prefs.MaxAge = age
		}
	case "max_distance":
		if distance, ok := value.(int); ok {
			prefs.MaxDistance = distance
		}
	}

	// Save updated preferences
	err = h.userService.UpdateUserPreferences(userID, prefs)
	if err != nil {
		log.Printf("Error updating user preferences: %v", err)
	}
}

// addGenderPreference adds a gender preference for the user
func (h *Handler) addGenderPreference(userID string, gender string) {
	// Get current user to update preferences
	user, err := h.userService.GetUserByID(userID)
	if err != nil {
		log.Printf("Error getting user for gender preference update: %v", err)
		return
	}

	// Update gender preferences
	prefs := user.Preferences
	switch gender {
	case "male":
		prefs.Genders = []string{"male"}
	case "female":
		prefs.Genders = []string{"female"}
	case "nonbinary":
		prefs.Genders = []string{"nonbinary"}
	case "all":
		prefs.Genders = []string{"male", "female", "nonbinary"}
	default:
		log.Printf("Unknown gender preference: %s", gender)
		return
	}

	// Save updated preferences
	err = h.userService.UpdateUserPreferences(userID, prefs)
	if err != nil {
		log.Printf("Error updating gender preferences: %v", err)
	}
}

// completeOnboarding completes the user onboarding process
func (h *Handler) completeOnboarding(chatID int64, userID string) {
	h.userService.UpdateUserState(userID, "active")
	msg := "🎉 Congratulations! Your profile is complete!\n\n"
	msg += "You're now ready to start meeting amazing people. Good luck! 💕\n\n"
	msg += "Use /matches to see potential matches or /profile to view your profile."
	h.sendMessage(chatID, msg)
	h.showMainMenuForUser(chatID, userID)
}

// showMainMenuForUser shows the main menu for a specific user
func (h *Handler) showMainMenuForUser(chatID int64, userID string) {
	user, err := h.userService.GetUserByID(userID)
	if err != nil {
		log.Printf("Error getting user: %v", err)
		return
	}
	h.showMainMenu(chatID, user)
}

// showNextMatch shows the next potential match
func (h *Handler) showNextMatch(chatID int64, user *services.User) {
	matches, err := h.matchingService.GetPotentialMatches(user.ID, 1)
	if err != nil {
		log.Printf("Error getting next match: %v", err)
		h.sendMessage(chatID, "Sorry, there was an error getting your next match.")
		return
	}

	if len(matches) == 0 {
		h.sendMessage(chatID, "No more matches available right now. Check back later! 💫")
		return
	}

	// Show the next match
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
		},
	}

	h.sendMessageWithKeyboard(chatID, msg, keyboard)
}

// handleMessagesCommand handles the messages command
func (h *Handler) handleMessagesCommand(chatID int64, user *services.User) {
	conversations, err := h.messagingService.GetConversations(user.ID, 10, 0)
	if err != nil {
		log.Printf("Error getting conversations: %v", err)
		h.sendMessage(chatID, "Sorry, there was an error getting your messages.")
		return
	}

	if len(conversations) == 0 {
		h.sendMessage(chatID, "No conversations yet. Start matching to begin chatting! 💬")
		return
	}

	msg := "💬 Your Conversations:\n\n"
	for i, conv := range conversations {
		if i >= 5 { // Limit to 5 conversations in bot
			break
		}
		// Get the other user's name
		otherUserID := conv.User1ID
		if conv.User1ID == user.ID {
			otherUserID = conv.User2ID
		}
		otherUser, err := h.userService.GetUserByID(otherUserID)
		if err == nil {
			msg += fmt.Sprintf("%d. %s\n", i+1, otherUser.Name)
			if conv.LastMessage != nil && *conv.LastMessage != "" {
				msg += fmt.Sprintf("   Last: %s\n", *conv.LastMessage)
			}
		}
	}

	msg += "\nFor full messaging experience, visit the web app: https://meetsmatch.com/messages"
	h.sendMessage(chatID, msg)
}

// handleEditProfileCommand handles the edit profile command
func (h *Handler) handleEditProfileCommand(chatID int64, user *services.User) {
	msg := "✏️ Edit Profile\n\nWhat would you like to edit?"
	keyboard := models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "📝 Bio", CallbackData: "edit_bio"},
				{Text: "📍 Location", CallbackData: "edit_location"},
			},
			{
				{Text: "🎯 Preferences", CallbackData: "edit_preferences"},
				{Text: "🌐 Web Editor", URL: "https://meetsmatch.com/profile/edit"},
			},
		},
	}
	h.sendMessageWithKeyboard(chatID, msg, keyboard)
}

func (h *Handler) handleConversationsCommand(chatID int64, user *services.User) {
	conversations, err := h.messagingService.GetConversations(user.ID, 10, 0)
	if err != nil {
		h.sendMessage(chatID, "❌ Error retrieving conversations. Please try again.")
		return
	}

	if len(conversations) == 0 {
		h.sendMessage(chatID, "💬 You don't have any conversations yet. Start matching with people to begin chatting!")
		return
	}

	h.showConversationSelection(chatID, conversations)
}

// handleConversationMessage handles regular text messages from active users
func (h *Handler) handleConversationMessage(message *models.Message, user *services.User) {
	chatID := message.Chat.ID
	text := message.Text
	userIDStr := fmt.Sprintf("%d", user.ID)

	// Initialize session for this user
	h.stateManager.GetSession(userIDStr, chatID)

	// Check if user has an active conversation state
	activeConversation := h.getUserActiveConversation(userIDStr)
	if activeConversation == "" {
		// No active conversation, show available conversations
		conversations, err := h.messagingService.GetConversations(user.ID, 5, 0)
		if err != nil {
			log.Printf("Error getting conversations: %v", err)
			h.sendMessage(chatID, "Sorry, there was an error getting your conversations.")
			return
		}

		if len(conversations) == 0 {
			h.sendMessage(chatID, "You don't have any conversations yet. Use /matches to find someone to chat with! 💬")
			return
		}

		h.showConversationSelection(chatID, conversations)
		return
	}

	// Send message to the active conversation
	err := h.sendMessageToConversation(user.ID, activeConversation, text)
	if err != nil {
		log.Printf("Error sending message to conversation: %v", err)
		h.sendMessage(chatID, "Sorry, there was an error sending your message. Please try again.")
		return
	}

	// Confirm message sent
	h.sendMessage(chatID, "✅ Message sent! Type /conversations to switch chats or continue typing to send more messages.")
}

// getUserActiveConversation gets the user's currently active conversation using StateManager
func (h *Handler) getUserActiveConversation(userID string) string {
	return h.stateManager.GetActiveConversation(userID)
}

// setUserActiveConversation sets the user's active conversation using StateManager
func (h *Handler) setUserActiveConversation(userID, conversationID string) {
	h.stateManager.SetActiveConversation(userID, conversationID)
}

// clearUserActiveConversation clears the user's active conversation using StateManager
func (h *Handler) clearUserActiveConversation(userID string) {
	h.stateManager.ClearActiveConversation(userID)
}

// showConversationSelection shows available conversations for the user to select
func (h *Handler) showConversationSelection(chatID int64, conversations []*services.Conversation) {
	msg := "💬 Select a conversation to send your message to:\n\n"
	keyboard := models.InlineKeyboardMarkup{}

	for i, conv := range conversations {
		// Get the other user's name
		otherUserName := "Unknown User"
		if conv.User1ID != "" {
			if otherUser, err := h.userService.GetUserByID(conv.User1ID); err == nil {
				otherUserName = otherUser.Name
			}
		}
		if conv.User2ID != "" && otherUserName == "Unknown User" {
			if otherUser, err := h.userService.GetUserByID(conv.User2ID); err == nil {
				otherUserName = otherUser.Name
			}
		}

		msg += fmt.Sprintf("%d. %s\n", i+1, otherUserName)
		keyboard.InlineKeyboard = append(keyboard.InlineKeyboard, []models.InlineKeyboardButton{
			{Text: fmt.Sprintf("💬 %s", otherUserName), CallbackData: fmt.Sprintf("select_conversation_%s", conv.ID)},
		})
	}

	msg += "\nOr use /conversations to see all your conversations."
	h.sendMessageWithKeyboard(chatID, msg, keyboard)
}

// sendMessageToConversation sends a message to a specific conversation
func (h *Handler) sendMessageToConversation(senderID, conversationID, content string) error {
	// Get conversation details
	conv, err := h.getConversationByID(conversationID)
	if err != nil {
		return fmt.Errorf("failed to get conversation: %w", err)
	}

	// Determine receiver ID
	receiverID := conv.User1ID
	if conv.User1ID == senderID {
		receiverID = conv.User2ID
	}

	// Send the message
	_, err = h.messagingService.SendMessage(senderID, receiverID, content, "text")
	if err != nil {
		return fmt.Errorf("failed to send message: %w", err)
	}

	return nil
}

// getConversationByID gets a conversation by its ID
func (h *Handler) getConversationByID(conversationID string) (*services.Conversation, error) {
	// This is a simplified implementation - you might want to add this method to the messaging service
	conversations, err := h.messagingService.GetConversations("", 100, 0) // Get all conversations
	if err != nil {
		return nil, err
	}

	for _, conv := range conversations {
		if conv.ID == conversationID {
			return conv, nil
		}
	}

	return nil, fmt.Errorf("conversation not found")
}
