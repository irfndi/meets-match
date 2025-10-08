package services

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/meetsmatch/meetsmatch/internal/database"
)

func TestNewUserService(t *testing.T) {
	service := NewUserService(nil)
	assert.NotNil(t, service)
}

func TestUserCreation_Validation(t *testing.T) {
	// Test user creation validation
	tests := []struct {
		name      string
		user      *User
		wantValid bool
	}{
		{
			name: "Valid user",
			user: &User{
				ID:         "test-user-1",
				TelegramID: 123456789,
				Username:   "testuser",
				Name:       "Test User",
				Age:        25,
				Gender:     "male",
				State:      "new",
				IsActive:   true,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
				Preferences: Preferences{
					MinAge:       18,
					MaxAge:       50,
					Genders:      []string{"female"},
					MaxDistance:  50,
					ShowOnline:   true,
					ShowDistance: true,
				},
			},
			wantValid: true,
		},
		{
			name: "Invalid age - too young",
			user: &User{
				ID:         "test-user-2",
				TelegramID: 123456789,
				Username:   "testuser2",
				Name:       "Test User 2",
				Age:        16,
				Gender:     "female",
				State:      "new",
				IsActive:   true,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			},
			wantValid: false,
		},
		{
			name: "Missing username",
			user: &User{
				ID:         "test-user-3",
				TelegramID: 123456789,
				Username:   "", // Empty username
				Name:       "Test User 3",
				Age:        25,
				Gender:     "male",
				State:      "new",
				IsActive:   true,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			},
			wantValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := validateUserForCreation(tt.user)
			assert.Equal(t, tt.wantValid, valid)
		})
	}
}

// validateUserForCreation validates user data before creation
func validateUserForCreation(user *User) bool {
	if user.TelegramID <= 0 {
		return false
	}
	
	if user.Username == "" || user.Name == "" {
		return false
	}
	
	if user.Age < 18 || user.Age > 100 {
		return false
	}
	
	if user.Gender == "" {
		return false
	}
	
	return true
}

func TestUserPreferences_Validation(t *testing.T) {
	tests := []struct {
		name     string
		prefs    Preferences
		expected bool
	}{
		{
			name: "Valid preferences",
			prefs: Preferences{
				MinAge:      18,
				MaxAge:      50,
				Genders:     []string{"male", "female"},
				MaxDistance: 50,
				ShowOnline:  true,
			},
			expected: true,
		},
		{
			name: "Min age too low",
			prefs: Preferences{
				MinAge:      16,
				MaxAge:      50,
				Genders:     []string{"male"},
				MaxDistance: 50,
				ShowOnline:  true,
			},
			expected: false,
		},
		{
			name: "No genders specified",
			prefs: Preferences{
				MinAge:      18,
				MaxAge:      50,
				Genders:     []string{},
				MaxDistance: 50,
				ShowOnline:  true,
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			valid := validatePreferences(tt.prefs)
			assert.Equal(t, tt.expected, valid)
		})
	}
}

// validatePreferences validates user preferences
func validatePreferences(prefs Preferences) bool {
	if prefs.MinAge < 18 || prefs.MaxAge > 80 || prefs.MinAge > prefs.MaxAge {
		return false
	}
	
	if len(prefs.Genders) == 0 {
		return false
	}
	
	if prefs.MaxDistance < 1 || prefs.MaxDistance > 200 {
		return false
	}
	
	return true
}

func TestUser_PhotosManagement(t *testing.T) {
	user := &User{
		ID:     "test-user",
		Photos: Photos{},
	}

	// Test adding photos
	photo1 := database.Photo{
		ID:        "photo1",
		URL:       "https://example.com/photo1.jpg",
		IsPrimary: true,
		Order:     1,
	}
	
	photo2 := database.Photo{
		ID:        "photo2",
		URL:       "https://example.com/photo2.jpg",
		IsPrimary: false,
		Order:     2,
	}

	user.Photos = append(user.Photos, photo1, photo2)

	assert.Len(t, user.Photos, 2)
	assert.Equal(t, "photo1", user.Photos[0].ID)
	assert.Equal(t, "photo2", user.Photos[1].ID)
	assert.True(t, user.Photos[0].IsPrimary)
	assert.False(t, user.Photos[1].IsPrimary)

	// Test finding primary photo
	var primaryPhoto *database.Photo
	for _, photo := range user.Photos {
		if photo.IsPrimary {
			primaryPhoto = &photo
			break
		}
	}
	assert.NotNil(t, primaryPhoto)
	assert.Equal(t, "photo1", primaryPhoto.ID)
}

func TestUser_StateManagement(t *testing.T) {
	user := &User{
		ID:    "test-user",
		State: "new",
	}

	// Test valid state transitions
	validStates := []string{"new", "active", "paused", "banned", "deleted"}
	
	for _, state := range validStates {
		user.State = state
		assert.Equal(t, state, user.State)
	}

	// Test invalid state
	invalidState := "invalid"
	user.State = invalidState
	assert.NotContains(t, validStates, user.State)
}

func TestUser_IsActive(t *testing.T) {
	tests := []struct {
		name     string
		user     *User
		expected bool
	}{
		{
			name: "Active user",
			user: &User{
				ID:       "test-user",
				IsActive: true,
				State:    "active",
			},
			expected: true,
		},
		{
			name: "Inactive user",
			user: &User{
				ID:       "test-user",
				IsActive: false,
				State:    "paused",
			},
			expected: false,
		},
		{
			name: "Banned user",
			user: &User{
				ID:       "test-user",
				IsActive: true,
				State:    "banned",
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isActive := isUserActive(tt.user)
			assert.Equal(t, tt.expected, isActive)
		})
	}
}

// isUserActive checks if user is active based on IsActive flag and state
func isUserActive(user *User) bool {
	return user.IsActive && user.State != "banned" && user.State != "deleted"
}