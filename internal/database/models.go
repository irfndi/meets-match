package database

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

// User represents a user in the system
type User struct {
	ID           string      `json:"id" db:"id"`
	TelegramID   int64       `json:"telegram_id" db:"telegram_id"`
	Username     string      `json:"username" db:"username"`
	Name         string      `json:"name" db:"name"`
	Age          int         `json:"age" db:"age"`
	Gender       string      `json:"gender" db:"gender"`
	Bio          string      `json:"bio" db:"bio"`
	LocationText string      `json:"location_text" db:"location_text"`
	Latitude     *float64    `json:"latitude" db:"latitude"`
	Longitude    *float64    `json:"longitude" db:"longitude"`
	Photos       Photos      `json:"photos" db:"photos"`
	Preferences  Preferences `json:"preferences" db:"preferences"`
	State        string      `json:"state" db:"state"`
	IsActive     bool        `json:"is_active" db:"is_active"`
	CreatedAt    time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at" db:"updated_at"`
}

// Photos represents user photos as JSON
type Photos []Photo

type Photo struct {
	ID        string `json:"id"`
	URL       string `json:"url"`
	IsPrimary bool   `json:"is_primary"`
	Order     int    `json:"order"`
}

// Preferences represents user matching preferences
type Preferences struct {
	MinAge       int      `json:"min_age"`
	MaxAge       int      `json:"max_age"`
	Genders      []string `json:"genders"`
	MaxDistance  int      `json:"max_distance"`
	ShowOnline   bool     `json:"show_online"`
	ShowDistance bool     `json:"show_distance"`
}

// Implement driver.Valuer and sql.Scanner for Photos
func (p Photos) Value() (driver.Value, error) {
	if p == nil {
		return nil, nil
	}
	return json.Marshal(p)
}

func (p *Photos) Scan(value interface{}) error {
	if value == nil {
		*p = nil
		return nil
	}

	switch v := value.(type) {
	case []byte:
		return json.Unmarshal(v, p)
	case string:
		return json.Unmarshal([]byte(v), p)
	default:
		return fmt.Errorf("cannot scan %T into Photos", value)
	}
}

// Implement driver.Valuer and sql.Scanner for Preferences
func (p Preferences) Value() (driver.Value, error) {
	return json.Marshal(p)
}

func (p *Preferences) Scan(value interface{}) error {
	if value == nil {
		return nil
	}

	switch v := value.(type) {
	case []byte:
		return json.Unmarshal(v, p)
	case string:
		return json.Unmarshal([]byte(v), p)
	default:
		return fmt.Errorf("cannot scan %T into Preferences", value)
	}
}

// Match represents a match between two users
type Match struct {
	ID        string    `json:"id" db:"id"`
	UserID    string    `json:"user_id" db:"user_id"`
	TargetID  string    `json:"target_id" db:"target_id"`
	Status    string    `json:"status" db:"status"` // pending, accepted, declined, mutual
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// Message represents a message between matched users
type Message struct {
	ID          string    `json:"id" db:"id"`
	MatchID     string    `json:"match_id" db:"match_id"`
	SenderID    string    `json:"sender_id" db:"sender_id"`
	ReceiverID  string    `json:"receiver_id" db:"receiver_id"`
	Content     string    `json:"content" db:"content"`
	MessageType string    `json:"message_type" db:"message_type"` // text, image, gif
	IsRead      bool      `json:"is_read" db:"is_read"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// Conversation represents a conversation between matched users
type Conversation struct {
	ID           string    `json:"id" db:"id"`
	MatchID      string    `json:"match_id" db:"match_id"`
	User1ID      string    `json:"user1_id" db:"user1_id"`
	User2ID      string    `json:"user2_id" db:"user2_id"`
	LastMessage  *string   `json:"last_message" db:"last_message"`
	LastActivity time.Time `json:"last_activity" db:"last_activity"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// UserSession represents user session data
type UserSession struct {
	ID        string    `json:"id" db:"id"`
	UserID    string    `json:"user_id" db:"user_id"`
	Token     string    `json:"token" db:"token"`
	ExpiresAt time.Time `json:"expires_at" db:"expires_at"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// Analytics represents user analytics data
type Analytics struct {
	ID        string    `json:"id" db:"id"`
	UserID    string    `json:"user_id" db:"user_id"`
	EventType string    `json:"event_type" db:"event_type"`
	EventData EventData `json:"event_data" db:"event_data"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// UserStats represents user statistics
type UserStats struct {
	TotalMatches     int `json:"total_matches"`
	MutualMatches    int `json:"mutual_matches"`
	MessagesSent     int `json:"messages_sent"`
	MessagesReceived int `json:"messages_received"`
}

// EventData represents event data as a custom type
type EventData map[string]interface{}

// Implement driver.Valuer and sql.Scanner for EventData
func (e EventData) Value() (driver.Value, error) {
	if e == nil {
		return nil, nil
	}
	return json.Marshal(e)
}

func (e *EventData) Scan(value interface{}) error {
	if value == nil {
		*e = nil
		return nil
	}

	switch v := value.(type) {
	case []byte:
		return json.Unmarshal(v, e)
	case string:
		return json.Unmarshal([]byte(v), e)
	default:
		return fmt.Errorf("cannot scan %T into EventData", value)
	}
}
