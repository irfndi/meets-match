package interfaces

import (
	"github.com/meetsmatch/meetsmatch/internal/database"
	"github.com/meetsmatch/meetsmatch/internal/services"
)

// UserServiceInterface defines the interface for user-related operations
type UserServiceInterface interface {
	CreateUser(telegramID int64, username, name string) (*services.User, error)
	GetUserByID(id string) (*services.User, error)
	GetUserByTelegramID(telegramID int64) (*services.User, error)
	UpdateUserState(userID, state string) error
	UpdateUserName(userID, name string) error
	UpdateUserAge(userID string, age int) error
	UpdateUserGender(userID string, gender string) error
	UpdateUserBio(userID string, bio string) error
	UpdateUserLocation(userID, locationText string, lat, lng *float64) error
	UpdateUserPhotos(userID string, photos database.Photos) error
	UpdateUserPreferences(userID string, preferences database.Preferences) error
	SetUserActive(userID string, active bool) error
	DeleteUser(userID string) error
	GetUserStats(userID string) (*services.UserStats, error)
	GetActiveUsers(limit, offset int) ([]*services.User, error)
}

// MatchingServiceInterface defines the interface for matching operations
type MatchingServiceInterface interface {
	CreateMatch(userID, targetID, status string) (*services.Match, error)
	GetPotentialMatches(userID string, limit int) ([]*services.User, error)
	GetMatches(userID, status string) ([]*services.Match, error)
}

// MessagingServiceInterface defines the interface for messaging operations
type MessagingServiceInterface interface {
	SendMessage(senderID, receiverID, content, messageType string) (*services.Message, error)
	GetConversations(userID string, limit, offset int) ([]*services.Conversation, error)
	GetMessages(conversationID string, limit, offset int) ([]*services.Message, error)
	MarkMessageAsRead(messageID string) error
}
