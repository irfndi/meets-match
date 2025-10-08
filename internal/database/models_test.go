package database

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestPhotos_Value tests the Photos Valuer implementation
func TestPhotos_Value(t *testing.T) {
	tests := []struct {
		name     string
		photos   Photos
		expected string
		hasError bool
	}{
		{
			name:     "Nil photos",
			photos:   nil,
			expected: "",
			hasError: false,
		},
		{
			name: "Empty photos",
			photos: Photos{},
			expected: "[]",
			hasError: false,
		},
		{
			name: "Single photo",
			photos: Photos{
				{
					ID:        "photo1",
					URL:       "https://example.com/photo1.jpg",
					IsPrimary: true,
					Order:     0,
				},
			},
			expected: `[{"id":"photo1","url":"https://example.com/photo1.jpg","is_primary":true,"order":0}]`,
			hasError: false,
		},
		{
			name: "Multiple photos",
			photos: Photos{
				{
					ID:        "photo1",
					URL:       "https://example.com/photo1.jpg",
					IsPrimary: true,
					Order:     0,
				},
				{
					ID:        "photo2",
					URL:       "https://example.com/photo2.jpg",
					IsPrimary: false,
					Order:     1,
				},
			},
			expected: `[{"id":"photo1","url":"https://example.com/photo1.jpg","is_primary":true,"order":0},{"id":"photo2","url":"https://example.com/photo2.jpg","is_primary":false,"order":1}]`,
			hasError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			value, err := tt.photos.Value()
			
			if tt.hasError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
			
			if tt.expected == "" {
				assert.Nil(t, value)
			} else {
				assert.NotNil(t, value)
				// Compare JSON strings by unmarshaling to avoid order issues
				var expectedJSON, actualJSON interface{}
				err := json.Unmarshal([]byte(tt.expected), &expectedJSON)
				require.NoError(t, err)
				err = json.Unmarshal(value.([]byte), &actualJSON)
				require.NoError(t, err)
				assert.Equal(t, expectedJSON, actualJSON)
			}
		})
	}
}

// TestPhotos_Scan tests the Photos Scanner implementation
func TestPhotos_Scan(t *testing.T) {
	tests := []struct {
		name     string
		value    interface{}
		expected Photos
		hasError bool
	}{
		{
			name:     "Nil value",
			value:    nil,
			expected: nil,
			hasError: false,
		},
		{
			name:     "Empty byte slice",
			value:    []byte("[]"),
			expected: Photos{},
			hasError: false,
		},
		{
			name:     "String JSON",
			value:    `[{"id":"photo1","url":"https://example.com/photo1.jpg","is_primary":true,"order":0}]`,
			expected: Photos{{ID: "photo1", URL: "https://example.com/photo1.jpg", IsPrimary: true, Order: 0}},
			hasError: false,
		},
		{
			name:     "Byte slice JSON",
			value:    []byte(`[{"id":"photo1","url":"https://example.com/photo1.jpg","is_primary":true,"order":0}]`),
			expected: Photos{{ID: "photo1", URL: "https://example.com/photo1.jpg", IsPrimary: true, Order: 0}},
			hasError: false,
		},
		{
			name:     "Invalid JSON",
			value:    []byte("invalid json"),
			expected: nil,
			hasError: true,
		},
		{
			name:     "Unsupported type",
			value:    123,
			expected: nil,
			hasError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var photos Photos
			err := photos.Scan(tt.value)
			
			if tt.hasError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, photos)
			}
		})
	}
}

// TestPreferences_Value tests the Preferences Valuer implementation
func TestPreferences_Value(t *testing.T) {
	tests := []struct {
		name     string
		prefs    Preferences
		expected string
		hasError bool
	}{
		{
			name: "Empty preferences",
			prefs: Preferences{},
			expected: `{"min_age":0,"max_age":0,"genders":null,"max_distance":0,"show_online":false,"show_distance":false}`,
			hasError: false,
		},
		{
			name: "Full preferences",
			prefs: Preferences{
				MinAge:       18,
				MaxAge:       35,
				Genders:      []string{"male", "female"},
				MaxDistance:  50,
				ShowOnline:   true,
				ShowDistance: true,
			},
			expected: `{"min_age":18,"max_age":35,"genders":["male","female"],"max_distance":50,"show_online":true,"show_distance":true}`,
			hasError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			value, err := tt.prefs.Value()
			
			if tt.hasError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
			
			assert.NotNil(t, value)
			// Compare JSON strings by unmarshaling to avoid order issues
			var expectedJSON, actualJSON interface{}
			err = json.Unmarshal([]byte(tt.expected), &expectedJSON)
			require.NoError(t, err)
			err = json.Unmarshal(value.([]byte), &actualJSON)
			require.NoError(t, err)
			assert.Equal(t, expectedJSON, actualJSON)
		})
	}
}

// TestPreferences_Scan tests the Preferences Scanner implementation
func TestPreferences_Scan(t *testing.T) {
	tests := []struct {
		name     string
		value    interface{}
		expected Preferences
		hasError bool
	}{
		{
			name:     "Nil value",
			value:    nil,
			expected: Preferences{},
			hasError: false,
		},
		{
			name:     "Empty preferences JSON",
			value:    `{}`,
			expected: Preferences{},
			hasError: false,
		},
		{
			name:     "Full preferences JSON",
			value:    `{"min_age":18,"max_age":35,"genders":["male","female"],"max_distance":50,"show_online":true,"show_distance":true}`,
			expected: Preferences{MinAge: 18, MaxAge: 35, Genders: []string{"male", "female"}, MaxDistance: 50, ShowOnline: true, ShowDistance: true},
			hasError: false,
		},
		{
			name:     "Invalid JSON",
			value:    []byte("invalid json"),
			expected: Preferences{},
			hasError: true,
		},
		{
			name:     "Unsupported type",
			value:    123,
			expected: Preferences{},
			hasError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var prefs Preferences
			err := prefs.Scan(tt.value)
			
			if tt.hasError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, prefs)
			}
		})
	}
}

// TestEventData_Value tests the EventData Valuer implementation
func TestEventData_Value(t *testing.T) {
	tests := []struct {
		name     string
		data     EventData
		expected string
		hasError bool
	}{
		{
			name:     "Nil event data",
			data:     nil,
			expected: "",
			hasError: false,
		},
		{
			name:     "Empty event data",
			data:     EventData{},
			expected: "{}",
			hasError: false,
		},
		{
			name: "Event data with values",
			data: EventData{
				"user_id":    "123",
				"action":     "swipe_right",
				"timestamp":  1234567890,
				"metadata":   map[string]interface{}{"source": "mobile"},
			},
			expected: `{"action":"swipe_right","metadata":{"source":"mobile"},"timestamp":1234567890,"user_id":"123"}`,
			hasError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			value, err := tt.data.Value()
			
			if tt.hasError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
			
			if tt.expected == "" {
				assert.Nil(t, value)
			} else {
				assert.NotNil(t, value)
				// Compare JSON strings by unmarshaling to avoid order issues
				var expectedJSON, actualJSON interface{}
				err = json.Unmarshal([]byte(tt.expected), &expectedJSON)
				require.NoError(t, err)
				err = json.Unmarshal(value.([]byte), &actualJSON)
				require.NoError(t, err)
				assert.Equal(t, expectedJSON, actualJSON)
			}
		})
	}
}

// TestEventData_Scan tests the EventData Scanner implementation
func TestEventData_Scan(t *testing.T) {
	tests := []struct {
		name     string
		value    interface{}
		expected EventData
		hasError bool
	}{
		{
			name:     "Nil value",
			value:    nil,
			expected: nil,
			hasError: false,
		},
		{
			name:     "Empty event data JSON",
			value:    `{}`,
			expected: EventData{},
			hasError: false,
		},
		{
			name:     "Event data JSON",
			value:    `{"user_id":"123","action":"swipe_right"}`,
			expected: EventData{"user_id": "123", "action": "swipe_right"},
			hasError: false,
		},
		{
			name:     "Invalid JSON",
			value:    []byte("invalid json"),
			expected: nil,
			hasError: true,
		},
		{
			name:     "Unsupported type",
			value:    123,
			expected: nil,
			hasError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var data EventData
			err := data.Scan(tt.value)
			
			if tt.hasError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, data)
			}
		})
	}
}

// TestUser_Validation tests User model validation
func TestUser_Validation(t *testing.T) {
	tests := []struct {
		name     string
		user     User
		expected bool
	}{
		{
			name: "Valid user",
			user: User{
				ID:         "user1",
				TelegramID: 123456,
				Name:       "John Doe",
				Age:        25,
				Gender:     "male",
				State:      "active",
				IsActive:   true,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			},
			expected: true,
		},
		{
			name: "User with empty ID",
			user: User{
				ID:         "",
				TelegramID: 123456,
				Name:       "John Doe",
				Age:        25,
				Gender:     "male",
				State:      "active",
				IsActive:   true,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			},
			expected: false,
		},
		{
			name: "User with invalid Telegram ID",
			user: User{
				ID:         "user1",
				TelegramID: 0,
				Name:       "John Doe",
				Age:        25,
				Gender:     "male",
				State:      "active",
				IsActive:   true,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			},
			expected: false,
		},
		{
			name: "User with empty name",
			user: User{
				ID:         "user1",
				TelegramID: 123456,
				Name:       "",
				Age:        25,
				Gender:     "male",
				State:      "active",
				IsActive:   true,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			},
			expected: false,
		},
		{
			name: "User with invalid age (too young)",
			user: User{
				ID:         "user1",
				TelegramID: 123456,
				Name:       "John Doe",
				Age:        15,
				Gender:     "male",
				State:      "active",
				IsActive:   true,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			},
			expected: false,
		},
		{
			name: "User with invalid age (too old)",
			user: User{
				ID:         "user1",
				TelegramID: 123456,
				Name:       "John Doe",
				Age:        101,
				Gender:     "male",
				State:      "active",
				IsActive:   true,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := validateUser(tt.user)
			assert.Equal(t, tt.expected, valid)
		})
	}
}

// TestMatch_Validation tests Match model validation
func TestMatch_Validation(t *testing.T) {
	tests := []struct {
		name     string
		match    Match
		expected bool
	}{
		{
			name: "Valid match",
			match: Match{
				ID:        "match1",
				UserID:    "user1",
				TargetID:  "user2",
				Status:    "pending",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			expected: true,
		},
		{
			name: "Match with empty ID",
			match: Match{
				ID:        "",
				UserID:    "user1",
				TargetID:  "user2",
				Status:    "pending",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			expected: false,
		},
		{
			name: "Match with invalid status",
			match: Match{
				ID:        "match1",
				UserID:    "user1",
				TargetID:  "user2",
				Status:    "invalid_status",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			expected: false,
		},
		{
			name: "Match with same user and target",
			match: Match{
				ID:        "match1",
				UserID:    "user1",
				TargetID:  "user1",
				Status:    "pending",
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := validateMatch(tt.match)
			assert.Equal(t, tt.expected, valid)
		})
	}
}

// TestMessage_Validation tests Message model validation
func TestMessage_Validation(t *testing.T) {
	tests := []struct {
		name     string
		message  Message
		expected bool
	}{
		{
			name: "Valid message",
			message: Message{
				ID:          "msg1",
				MatchID:     "match1",
				SenderID:    "user1",
				ReceiverID:  "user2",
				Content:     "Hello!",
				MessageType: "text",
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
			expected: true,
		},
		{
			name: "Message with empty content",
			message: Message{
				ID:          "msg1",
				MatchID:     "match1",
				SenderID:    "user1",
				ReceiverID:  "user2",
				Content:     "",
				MessageType: "text",
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
			expected: false,
		},
		{
			name: "Message with invalid type",
			message: Message{
				ID:          "msg1",
				MatchID:     "match1",
				SenderID:    "user1",
				ReceiverID:  "user2",
				Content:     "Hello!",
				MessageType: "invalid_type",
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
			expected: false,
		},
		{
			name: "Message with same sender and receiver",
			message: Message{
				ID:          "msg1",
				MatchID:     "match1",
				SenderID:    "user1",
				ReceiverID:  "user1",
				Content:     "Hello!",
				MessageType: "text",
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := validateMessage(tt.message)
			assert.Equal(t, tt.expected, valid)
		})
	}
}

// Helper validation functions
func validateUser(user User) bool {
	if user.ID == "" {
		return false
	}
	if user.TelegramID <= 0 {
		return false
	}
	if user.Name == "" {
		return false
	}
	if user.Age < 18 || user.Age > 100 {
		return false
	}
	if user.State == "" {
		return false
	}
	return true
}

func validateMatch(match Match) bool {
	if match.ID == "" {
		return false
	}
	if match.UserID == "" || match.TargetID == "" {
		return false
	}
	if match.UserID == match.TargetID {
		return false
	}
	validStatuses := map[string]bool{
		"pending":  true,
		"accepted": true,
		"declined": true,
		"mutual":   true,
	}
	if !validStatuses[match.Status] {
		return false
	}
	return true
}

func validateMessage(message Message) bool {
	if message.ID == "" {
		return false
	}
	if message.MatchID == "" {
		return false
	}
	if message.SenderID == "" || message.ReceiverID == "" {
		return false
	}
	if message.SenderID == message.ReceiverID {
		return false
	}
	if message.Content == "" {
		return false
	}
	validTypes := map[string]bool{
		"text":  true,
		"image": true,
		"gif":   true,
	}
	if !validTypes[message.MessageType] {
		return false
	}
	return true
}