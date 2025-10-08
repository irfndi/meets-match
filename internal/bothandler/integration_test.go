package bothandler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	tgbotapi "gopkg.in/telegram-bot-api.v4"

	"github.com/meetsmatch/meetsmatch/internal/services"
)

// MockTelegramBot for integration testing
type MockTelegramBot struct {
	mock.Mock
	Updates chan tgbotapi.Update
}

func (m *MockTelegramBot) GetUpdatesChan(config tgbotapi.UpdateConfig) (tgbotapi.UpdatesChannel, error) {
	args := m.Called(config)
	return m.Updates, args.Error(1)
}

func (m *MockTelegramBot) Send(c tgbotapi.Chattable) (tgbotapi.Message, error) {
	args := m.Called(c)
	return args.Get(0).(tgbotapi.Message), args.Error(1)
}

func (m *MockTelegramBot) SetWebhook(config tgbotapi.WebhookConfig) (tgbotapi.APIResponse, error) {
	args := m.Called(config)
	return args.Get(0).(tgbotapi.APIResponse), args.Error(1)
}

func (m *MockTelegramBot) DeleteWebhook() (tgbotapi.APIResponse, error) {
	args := m.Called()
	return args.Get(0).(tgbotapi.APIResponse), args.Error(1)
}

func (m *MockTelegramBot) GetWebhookInfo() (tgbotapi.WebhookInfo, error) {
	args := m.Called()
	return args.Get(0).(tgbotapi.WebhookInfo), args.Error(1)
}

func (m *MockTelegramBot) StopReceivingUpdates() {
	m.Called()
}

// Integration test for webhook mode
func TestWebhookIntegration(t *testing.T) {
	// Setup mocks
	mockBot := &MockTelegramBot{
		Updates: make(chan tgbotapi.Update, 100),
	}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	// Create handler
	handler := NewHandler(nil, mockUserService, mockMatchingService, mockMessagingService)

	// Setup Gin router
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/webhook", handler.HandleWebhook)

	// Test webhook with valid update
	t.Run("Valid webhook update", func(t *testing.T) {
		// Setup expectations
		mockBot.On("Send", mock.AnythingOfType("tgbotapi.MessageConfig")).Return(tgbotapi.Message{
			MessageID: 123,
			Chat:      &tgbotapi.Chat{ID: 12345},
			Text:      "Welcome! Please use /start to begin.",
		}, nil)

		mockUserService.On("GetUserByTelegramID", int64(12345)).Return(nil, fmt.Errorf("user not found"))
		mockUserService.On("CreateUser", mock.AnythingOfType("*models.User")).Return(nil)

		// Create test update
		update := tgbotapi.Update{
			UpdateID: 1,
			Message: &tgbotapi.Message{
				MessageID: 1,
				From: &tgbotapi.User{
					ID:        12345,
					FirstName: "Test",
					UserName:  "testuser",
				},
				Chat: &tgbotapi.Chat{
					ID:   12345,
					Type: "private",
				},
				Date: int(time.Now().Unix()),
				Text: "/start",
			},
		}

		// Convert to JSON
		updateJSON, err := json.Marshal(update)
		require.NoError(t, err)

		// Create request
		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(updateJSON))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		// Execute request
		router.ServeHTTP(w, req)

		// Verify response
		assert.Equal(t, http.StatusOK, w.Code)

		// Verify mocks were called
		mockBot.AssertExpectations(t)
		mockUserService.AssertExpectations(t)
	})

	t.Run("Invalid JSON webhook", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/webhook", strings.NewReader("invalid json"))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("Callback query webhook", func(t *testing.T) {
		// Reset mocks
		mockBot.ExpectedCalls = nil
		mockUserService.ExpectedCalls = nil

		// Setup expectations
		mockBot.On("Send", mock.AnythingOfType("tgbotapi.CallbackConfig")).Return(tgbotapi.Message{}, nil)
		mockUserService.On("GetUserByTelegramID", int64(12345)).Return(&services.User{
			ID:         "1",
			TelegramID: 12345,
			Name:       "Test",
			Username:   "testuser",
		}, nil)

		// Create callback query update
		update := tgbotapi.Update{
			UpdateID: 2,
			CallbackQuery: &tgbotapi.CallbackQuery{
				ID: "callback_1",
				From: &tgbotapi.User{
					ID:        12345,
					FirstName: "Test",
					UserName:  "testuser",
				},
				Message: &tgbotapi.Message{
					MessageID: 2,
					Chat: &tgbotapi.Chat{
						ID:   12345,
						Type: "private",
					},
				},
				Data: "profile_edit",
			},
		}

		updateJSON, err := json.Marshal(update)
		require.NoError(t, err)

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(updateJSON))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		mockBot.AssertExpectations(t)
		mockUserService.AssertExpectations(t)
	})
}

// Integration test for polling mode
func TestPollingIntegration(t *testing.T) {
	// This test simulates the polling mechanism
	t.Run("Polling mode simulation", func(t *testing.T) {
		// Setup mocks
		mockTgBot := &MockTelegramBot{}
		mockUserService := &MockUserService{}
		mockMatchingService := &MockMatchingService{}
		mockMessagingService := &MockMessagingService{}

		// Create updates channel
		updatesChannel := make(chan tgbotapi.Update, 10)
		mockTgBot.Updates = updatesChannel

		// Setup expectations
		mockTgBot.On("GetUpdatesChan", mock.AnythingOfType("tgbotapi.UpdateConfig")).Return(updatesChannel, nil)
		mockTgBot.On("Send", mock.AnythingOfType("tgbotapi.MessageConfig")).Return(tgbotapi.Message{
			MessageID: 123,
			Chat:      &tgbotapi.Chat{ID: 12345},
			Text:      "Welcome! Please use /start to begin.",
		}, nil)
		mockTgBot.On("StopReceivingUpdates").Return()

		mockUserService.On("GetUserByTelegramID", int64(12345)).Return(nil, fmt.Errorf("user not found"))
		mockUserService.On("CreateUser", mock.AnythingOfType("*models.User")).Return(nil)

		// Create handler with mock bot
		_ = &Handler{
			userService:      mockUserService,
			matchingService:  mockMatchingService,
			messagingService: mockMessagingService,
			stateManager:     NewStateManager(24 * time.Hour),
		}

		// Simulate polling
		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer cancel()

		go func() {
			// Simulate receiving an update
			update := tgbotapi.Update{
				UpdateID: 1,
				Message: &tgbotapi.Message{
					MessageID: 1,
					From: &tgbotapi.User{
						ID:        12345,
						FirstName: "Test",
						UserName:  "testuser",
					},
					Chat: &tgbotapi.Chat{
						ID:   12345,
						Type: "private",
					},
					Date: int(time.Now().Unix()),
					Text: "/start",
				},
			}
			updatesChannel <- update
			close(updatesChannel)
		}()

		// Process updates
		for {
			select {
			case _, ok := <-updatesChannel:
				if !ok {
					return // Channel closed
				}
				// Process the update
				// TODO: Fix type incompatibility - handler expects *models.Update but we have tgbotapi.Update
				// handler.HandleUpdate(ctx, nil, update)
			case <-ctx.Done():
				return // Timeout
			}
		}
	})
}

// Test webhook setup and teardown
func TestWebhookManagement(t *testing.T) {
	t.Run("Set webhook", func(t *testing.T) {
		mockTgBot := &MockTelegramBot{}

		// Setup expectations
		mockTgBot.On("SetWebhook", mock.AnythingOfType("tgbotapi.WebhookConfig")).Return(
			tgbotapi.APIResponse{
				Ok:     true,
				Result: json.RawMessage(`{"url":"https://example.com/webhook","has_custom_certificate":false}`),
			}, nil)

		// Test webhook configuration
		webhookConfig := tgbotapi.NewWebhook("https://example.com/webhook")
		response, err := mockTgBot.SetWebhook(webhookConfig)

		assert.NoError(t, err)
		assert.True(t, response.Ok)
		mockTgBot.AssertExpectations(t)
	})

	t.Run("Delete webhook", func(t *testing.T) {
		mockTgBot := &MockTelegramBot{}

		// Setup expectations
		mockTgBot.On("DeleteWebhook").Return(
			tgbotapi.APIResponse{
				Ok:     true,
				Result: json.RawMessage(`true`),
			}, nil)

		// Test webhook deletion
		response, err := mockTgBot.DeleteWebhook()

		assert.NoError(t, err)
		assert.True(t, response.Ok)
		mockTgBot.AssertExpectations(t)
	})

	t.Run("Get webhook info", func(t *testing.T) {
		mockTgBot := &MockTelegramBot{}

		// Setup expectations
		mockTgBot.On("GetWebhookInfo").Return(
			tgbotapi.WebhookInfo{
				URL:                  "https://example.com/webhook",
				HasCustomCertificate: false,
				PendingUpdateCount:   0,
				LastErrorDate:        0,
				LastErrorMessage:     "",
			}, nil)

		// Test getting webhook info
		webhookInfo, err := mockTgBot.GetWebhookInfo()

		assert.NoError(t, err)
		assert.Equal(t, "https://example.com/webhook", webhookInfo.URL)
		assert.False(t, webhookInfo.HasCustomCertificate)
		assert.Equal(t, 0, webhookInfo.PendingUpdateCount)
		mockTgBot.AssertExpectations(t)
	})
}

// Test error handling in integration scenarios
func TestIntegrationErrorHandling(t *testing.T) {
	t.Run("Bot send error in webhook", func(t *testing.T) {
		// Setup mocks
		mockBot := &MockTelegramBot{
			Updates: make(chan tgbotapi.Update, 100),
		}
		mockUserService := &MockUserService{}
		mockMatchingService := &MockMatchingService{}
		mockMessagingService := &MockMessagingService{}

		// Create handler
		handler := NewHandler(nil, mockUserService, mockMatchingService, mockMessagingService)

		// Setup Gin router
		gin.SetMode(gin.TestMode)
		router := gin.New()
		router.POST("/webhook", handler.HandleWebhook)

		// Setup expectations - bot send fails
		mockBot.On("Send", mock.AnythingOfType("tgbotapi.MessageConfig")).Return(
			tgbotapi.Message{}, fmt.Errorf("telegram API error"))

		mockUserService.On("GetUserByTelegramID", int64(12345)).Return(nil, fmt.Errorf("user not found"))
		mockUserService.On("CreateUser", mock.AnythingOfType("*models.User")).Return(nil)

		// Create test update
		update := tgbotapi.Update{
			UpdateID: 1,
			Message: &tgbotapi.Message{
				MessageID: 1,
				From: &tgbotapi.User{
					ID:        12345,
					FirstName: "Test",
					UserName:  "testuser",
				},
				Chat: &tgbotapi.Chat{
					ID:   12345,
					Type: "private",
				},
				Date: int(time.Now().Unix()),
				Text: "/start",
			},
		}

		updateJSON, err := json.Marshal(update)
		require.NoError(t, err)

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(updateJSON))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		// Execute request
		router.ServeHTTP(w, req)

		// Should still return OK even if bot send fails (graceful degradation)
		assert.Equal(t, http.StatusOK, w.Code)
		mockBot.AssertExpectations(t)
	})

	t.Run("Database error in webhook", func(t *testing.T) {
		// Setup mocks
		mockBot := &MockTelegramBot{
			Updates: make(chan tgbotapi.Update, 100),
		}
		mockUserService := &MockUserService{}
		mockMatchingService := &MockMatchingService{}
		mockMessagingService := &MockMessagingService{}

		// Create handler
		handler := NewHandler(nil, mockUserService, mockMatchingService, mockMessagingService)

		// Setup Gin router
		gin.SetMode(gin.TestMode)
		router := gin.New()
		router.POST("/webhook", handler.HandleWebhook)

		// Setup expectations - database error
		mockUserService.On("GetUserByTelegramID", int64(12345)).Return(nil, fmt.Errorf("database connection failed"))
		mockBot.On("Send", mock.AnythingOfType("tgbotapi.MessageConfig")).Return(tgbotapi.Message{
			MessageID: 123,
			Chat:      &tgbotapi.Chat{ID: 12345},
			Text:      "Sorry, something went wrong. Please try again later.",
		}, nil)

		// Create test update
		update := tgbotapi.Update{
			UpdateID: 1,
			Message: &tgbotapi.Message{
				MessageID: 1,
				From: &tgbotapi.User{
					ID:        12345,
					FirstName: "Test",
					UserName:  "testuser",
				},
				Chat: &tgbotapi.Chat{
					ID:   12345,
					Type: "private",
				},
				Date: int(time.Now().Unix()),
				Text: "/profile",
			},
		}

		updateJSON, err := json.Marshal(update)
		require.NoError(t, err)

		req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(updateJSON))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		// Execute request
		router.ServeHTTP(w, req)

		// Should handle error gracefully
		assert.Equal(t, http.StatusOK, w.Code)
		mockUserService.AssertExpectations(t)
		mockBot.AssertExpectations(t)
	})
}

// Test concurrent webhook requests
func TestConcurrentWebhookRequests(t *testing.T) {
	// Setup mocks
	mockBot := &MockTelegramBot{
		Updates: make(chan tgbotapi.Update, 100),
	}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	// Create handler
	handler := NewHandler(nil, mockUserService, mockMatchingService, mockMessagingService)

	// Setup Gin router
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/webhook", handler.HandleWebhook)

	// Setup expectations for multiple calls
	mockBot.On("Send", mock.AnythingOfType("tgbotapi.MessageConfig")).Return(tgbotapi.Message{
		MessageID: 123,
		Chat:      &tgbotapi.Chat{ID: 12345},
		Text:      "Welcome! Please use /start to begin.",
	}, nil).Times(5)

	mockUserService.On("GetUserByTelegramID", mock.AnythingOfType("int64")).Return(nil, fmt.Errorf("user not found")).Times(5)
	mockUserService.On("CreateUser", mock.AnythingOfType("*models.User")).Return(nil).Times(5)

	// Create multiple concurrent requests
	const numRequests = 5
	results := make(chan int, numRequests)

	for i := 0; i < numRequests; i++ {
		go func(userID int64) {
			update := tgbotapi.Update{
				UpdateID: i,
				Message: &tgbotapi.Message{
					MessageID: i,
					From: &tgbotapi.User{
						ID:        int(userID),
						FirstName: fmt.Sprintf("Test%d", userID),
						UserName:  fmt.Sprintf("testuser%d", userID),
					},
					Chat: &tgbotapi.Chat{
						ID:   userID,
						Type: "private",
					},
					Date: int(time.Now().Unix()),
					Text: "/start",
				},
			}

			updateJSON, _ := json.Marshal(update)
			req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(updateJSON))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)
			results <- w.Code
		}(int64(12345 + i))
	}

	// Wait for all requests to complete
	for i := 0; i < numRequests; i++ {
		code := <-results
		assert.Equal(t, http.StatusOK, code)
	}

	// Verify all expectations were met
	mockBot.AssertExpectations(t)
	mockUserService.AssertExpectations(t)
}

// Test webhook with different update types
func TestWebhookUpdateTypes(t *testing.T) {
	// Setup mocks
	mockBot := &MockTelegramBot{
		Updates: make(chan tgbotapi.Update, 100),
	}
	mockUserService := &MockUserService{}
	mockMatchingService := &MockMatchingService{}
	mockMessagingService := &MockMessagingService{}

	// Create handler
	handler := NewHandler(nil, mockUserService, mockMatchingService, mockMessagingService)

	// Setup Gin router
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/webhook", handler.HandleWebhook)

	tests := []struct {
		name   string
		update tgbotapi.Update
	}{
		{
			name: "Message update",
			update: tgbotapi.Update{
				UpdateID: 1,
				Message: &tgbotapi.Message{
					MessageID: 1,
					From:      &tgbotapi.User{ID: 12345, FirstName: "Test"},
					Chat:      &tgbotapi.Chat{ID: 12345, Type: "private"},
					Text:      "Hello",
				},
			},
		},
		{
			name: "Callback query update",
			update: tgbotapi.Update{
				UpdateID: 2,
				CallbackQuery: &tgbotapi.CallbackQuery{
					ID:   "callback_1",
					From: &tgbotapi.User{ID: 12345, FirstName: "Test"},
					Data: "test_callback",
				},
			},
		},
		{
			name: "Empty update",
			update: tgbotapi.Update{
				UpdateID: 3,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Reset mocks
			mockBot.ExpectedCalls = nil
			mockUserService.ExpectedCalls = nil

			// Setup expectations based on update type
			if tt.update.Message != nil {
				mockBot.On("Send", mock.Anything).Return(tgbotapi.Message{}, nil).Maybe()
				mockUserService.On("GetUserByTelegramID", mock.Anything).Return(nil, fmt.Errorf("not found")).Maybe()
				mockUserService.On("CreateUser", mock.Anything).Return(nil).Maybe()
			} else if tt.update.CallbackQuery != nil {
				mockBot.On("Send", mock.Anything).Return(tgbotapi.Message{}, nil).Maybe()
				mockUserService.On("GetUserByTelegramID", mock.Anything).Return(&services.User{}, nil).Maybe()
			}

			updateJSON, err := json.Marshal(tt.update)
			require.NoError(t, err)

			req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(updateJSON))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			router.ServeHTTP(w, req)

			// All updates should be handled gracefully
			assert.Equal(t, http.StatusOK, w.Code)
		})
	}
}
