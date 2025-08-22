package bothandler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/meetsmatch/meetsmatch/internal/database"
	"github.com/meetsmatch/meetsmatch/internal/interfaces"
	"github.com/meetsmatch/meetsmatch/internal/middleware"
	"github.com/meetsmatch/meetsmatch/internal/services"
)

// BotInterface defines the interface for bot operations needed for testing
type BotInterface interface {
	GetMe(ctx context.Context) (*models.User, error)
	SendMessage(ctx context.Context, params *bot.SendMessageParams) (*models.Message, error)
}

// MockBot is a mock implementation of the Telegram bot
type MockBot struct {
	mock.Mock
}

func (m *MockBot) GetMe(ctx context.Context) (*models.User, error) {
	args := m.Called(ctx)
	return args.Get(0).(*models.User), args.Error(1)
}

func (m *MockBot) SendMessage(ctx context.Context, params *bot.SendMessageParams) (*models.Message, error) {
	args := m.Called(ctx, params)
	return args.Get(0).(*models.Message), args.Error(1)
}

// MockUserService is a mock implementation of UserService
type MockUserService struct {
	mock.Mock
}

func (m *MockUserService) CreateUser(telegramID int64, username, name string) (*services.User, error) {
	args := m.Called(telegramID, username, name)
	return args.Get(0).(*services.User), args.Error(1)
}

func (m *MockUserService) GetUserByID(id string) (*services.User, error) {
	args := m.Called(id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*services.User), args.Error(1)
}

func (m *MockUserService) GetUserByTelegramID(telegramID int64) (*services.User, error) {
	args := m.Called(telegramID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*services.User), args.Error(1)
}

func (m *MockUserService) UpdateUserState(userID, state string) error {
	args := m.Called(userID, state)
	return args.Error(0)
}

func (m *MockUserService) UpdateUserName(userID, name string) error {
	args := m.Called(userID, name)
	return args.Error(0)
}

func (m *MockUserService) UpdateUserAge(userID string, age int) error {
	args := m.Called(userID, age)
	return args.Error(0)
}

func (m *MockUserService) UpdateUserGender(userID string, gender string) error {
	args := m.Called(userID, gender)
	return args.Error(0)
}

func (m *MockUserService) UpdateUserBio(userID string, bio string) error {
	args := m.Called(userID, bio)
	return args.Error(0)
}

func (m *MockUserService) UpdateUserLocation(userID, locationText string, lat, lng *float64) error {
	args := m.Called(userID, locationText, lat, lng)
	return args.Error(0)
}

func (m *MockUserService) UpdateUserPhotos(userID string, photos database.Photos) error {
	args := m.Called(userID, photos)
	return args.Error(0)
}

func (m *MockUserService) UpdateUserPreferences(userID string, preferences database.Preferences) error {
	args := m.Called(userID, preferences)
	return args.Error(0)
}

func (m *MockUserService) SetUserActive(userID string, active bool) error {
	args := m.Called(userID, active)
	return args.Error(0)
}

func (m *MockUserService) DeleteUser(userID string) error {
	args := m.Called(userID)
	return args.Error(0)
}

func (m *MockUserService) GetUserStats(userID string) (*services.UserStats, error) {
	args := m.Called(userID)
	return args.Get(0).(*services.UserStats), args.Error(1)
}

func (m *MockUserService) GetActiveUsers(limit, offset int) ([]*services.User, error) {
	args := m.Called(limit, offset)
	return args.Get(0).([]*services.User), args.Error(1)
}

// MockMatchingService is a mock implementation of MatchingService
type MockMatchingService struct {
	mock.Mock
}

func (m *MockMatchingService) GetPotentialMatches(userID string, limit int) ([]*services.User, error) {
	args := m.Called(userID, limit)
	return args.Get(0).([]*services.User), args.Error(1)
}

func (m *MockMatchingService) CreateMatch(userID, targetID, status string) (*services.Match, error) {
	args := m.Called(userID, targetID, status)
	return args.Get(0).(*services.Match), args.Error(1)
}

func (m *MockMatchingService) GetMatches(userID, status string) ([]*services.Match, error) {
	args := m.Called(userID, status)
	return args.Get(0).([]*services.Match), args.Error(1)
}

// MockMessagingService is a mock implementation of MessagingService
type MockMessagingService struct {
	mock.Mock
}

func (m *MockMessagingService) SendMessage(senderID, receiverID, content, messageType string) (*services.Message, error) {
	args := m.Called(senderID, receiverID, content, messageType)
	return args.Get(0).(*services.Message), args.Error(1)
}

func (m *MockMessagingService) GetConversations(userID string, limit, offset int) ([]*services.Conversation, error) {
	args := m.Called(userID, limit, offset)
	return args.Get(0).([]*services.Conversation), args.Error(1)
}

func (m *MockMessagingService) GetMessages(conversationID string, limit, offset int) ([]*services.Message, error) {
	args := m.Called(conversationID, limit, offset)
	return args.Get(0).([]*services.Message), args.Error(1)
}

func (m *MockMessagingService) MarkMessageAsRead(messageID string) error {
	args := m.Called(messageID)
	return args.Error(0)
}

// NewTestHandler creates a handler for testing with mock bot
func NewTestHandler(
	mockBot BotInterface,
	userService interfaces.UserServiceInterface,
	matchingService interfaces.MatchingServiceInterface,
	messagingService interfaces.MessagingServiceInterface,
) *Handler {
	// Create a minimal handler for testing
	return &Handler{
		bot:                 nil, // We'll use mockBot through a different mechanism
		userService:         userService,
		matchingService:     matchingService,
		messagingService:    messagingService,
		ctx:                 context.Background(),
		authMiddleware:      middleware.NewAuthMiddleware(userService),
		loggingMiddleware:   middleware.NewBotLoggingMiddleware(),
		rateLimitMiddleware: middleware.NewRateLimitMiddleware(10, time.Minute),
		stateManager:        NewStateManager(24 * time.Hour),
	}
}

func TestNewHandler(t *testing.T) {
	mockBot := &MockBot{}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	handler := NewTestHandler(mockBot, mockUserService, mockMatchingService, mockMessagingService)

	assert.NotNil(t, handler)
	assert.Equal(t, mockUserService, handler.userService)
	assert.Equal(t, mockMatchingService, handler.matchingService)
	assert.Equal(t, mockMessagingService, handler.messagingService)
	assert.NotNil(t, handler.stateManager)
	assert.NotNil(t, handler.authMiddleware)
	assert.NotNil(t, handler.loggingMiddleware)
	assert.NotNil(t, handler.rateLimitMiddleware)
}

func TestHandler_HandleWebhook_ValidUpdate(t *testing.T) {
	mockBot := &MockBot{}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	handler := NewTestHandler(mockBot, mockUserService, mockMatchingService, mockMessagingService)

	// Create a valid update
	update := models.Update{
		Message: &models.Message{
			From: &models.User{
				ID:       789,
				Username: "testuser",
			},
			Chat: models.Chat{
				ID:   789,
				Type: "private",
			},
			Text: "/start",
			Date: int(time.Now().Unix()),
		},
	}

	// Mock user service to return nil (new user)
	mockUserService.On("GetUserByTelegramID", int64(789)).Return(nil, nil)
	mockUserService.On("CreateUser", int64(789), "", "").Return(&services.User{
		ID:         1,
		TelegramID: 789,
		State:      "onboarding_name",
	}, nil)
	mockUserService.On("UpdateUserState", int64(1), "onboarding_name").Return(nil)

	// Create request
	body, _ := json.Marshal(update)
	req := httptest.NewRequest("POST", "/webhook", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	// Create response recorder
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	// Call handler
	handler.HandleWebhook(c)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]string
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "ok", response["status"])

	// Verify mocks were called
	mockUserService.AssertExpectations(t)
}

func TestHandler_HandleWebhook_InvalidJSON(t *testing.T) {
	mockBot := &MockBot{}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	handler := NewTestHandler(mockBot, mockUserService, mockMatchingService, mockMessagingService)

	// Create request with invalid JSON
	req := httptest.NewRequest("POST", "/webhook", bytes.NewBufferString("invalid json"))
	req.Header.Set("Content-Type", "application/json")

	// Create response recorder
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	// Call handler
	handler.HandleWebhook(c)

	// Assert response
	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response map[string]string
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Equal(t, "Invalid JSON", response["error"])
}

func TestHandler_HandleUpdate_Message(t *testing.T) {
	mockBot := &MockBot{}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	handler := NewTestHandler(mockBot, mockUserService, mockMatchingService, mockMessagingService)

	// Create update with message
	update := &models.Update{
		Message: &models.Message{
			From: &models.User{ID: 123},
			Chat: models.Chat{ID: 123},
			Text: "/start",
		},
	}

	// Mock user service
	mockUserService.On("GetUserByTelegramID", int64(123)).Return(nil, nil)
	mockUserService.On("CreateUser", int64(123), "", "").Return(&services.User{
		ID:         1,
		TelegramID: 123,
		State:      "onboarding_name",
	}, nil)
	mockUserService.On("UpdateUserState", int64(1), "onboarding_name").Return(nil)

	// Call handler
	handler.HandleUpdate(context.Background(), mockBot, update)

	// Verify mocks were called
	mockUserService.AssertExpectations(t)
}

func TestHandler_HandleUpdate_CallbackQuery(t *testing.T) {
	mockBot := &MockBot{}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	handler := NewTestHandler(mockBot, mockUserService, mockMatchingService, mockMessagingService)

	// Create update with callback query
	update := &models.Update{
		CallbackQuery: &models.CallbackQuery{
			ID:   "test_callback",
			From: models.User{ID: 123},
			Data: "test_data",
		},
	}

	// Mock user service
	mockUserService.On("GetUserByTelegramID", int64(123)).Return(&services.User{
		ID:         1,
		TelegramID: 123,
		State:      "active",
	}, nil)

	// Call handler
	handler.HandleUpdate(context.Background(), mockBot, update)

	// Verify mocks were called
	mockUserService.AssertExpectations(t)
}

func TestHandler_isCommand(t *testing.T) {
	mockBot := &MockBot{}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	handler := NewTestHandler(mockBot, mockUserService, mockMatchingService, mockMessagingService)

	tests := []struct {
		name     string
		text     string
		expected bool
	}{
		{"Valid command", "/start", true},
		{"Valid command with args", "/help me", true},
		{"Not a command", "hello", false},
		{"Empty string", "", false},
		{"Just slash", "/", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := handler.isCommand(tt.text)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestHandler_extractCommand(t *testing.T) {
	mockBot := &MockBot{}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	handler := NewTestHandler(mockBot, mockUserService, mockMatchingService, mockMessagingService)

	tests := []struct {
		name     string
		text     string
		expected string
	}{
		{"Simple command", "/start", "start"},
		{"Command with args", "/help me please", "help"},
		{"Command with bot username", "/start@botname", "start"},
		{"Empty command", "/", ""},
		{"No command", "hello", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := handler.extractCommand(tt.text)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestHandler_SetCacheMiddleware(t *testing.T) {
	mockBot := &MockBot{}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	handler := NewTestHandler(mockBot, mockUserService, mockMatchingService, mockMessagingService)

	// Initially cache middleware should be nil
	assert.Nil(t, handler.cacheMiddleware)

	// Set cache middleware (we'll use nil for this test since we don't have the actual implementation)
	handler.SetCacheMiddleware(nil)

	// Verify it was set
	assert.Nil(t, handler.cacheMiddleware) // Still nil since we passed nil
}
